/* ──────────────────────────────────────────────────────────────────
   Sessão do WhatsApp guardada no PostgreSQL.

   A documentação do Baileys é explícita: `useMultiFileAuthState` é
   "purely for demos and is very inefficient — do not rely on it in
   production". Ele escreve centenas de arquivinhos (um por chave do
   Signal) e não sobrevive bem a container recriado, disco efêmero ou
   backup parcial.

   Aqui a sessão vive no mesmo banco do ERP. Consequências práticas:
   o backup do banco já leva a sessão junto, e trocar o servidor de
   lugar não obriga a ler o QR de novo.

   ── Por que Buffer dá trabalho ──
   O Signal guarda chaves como Buffer. JSON.stringify transforma
   Buffer em {"type":"Buffer","data":[...]}, e ao voltar vira objeto
   comum — aí a criptografia falha com erros incompreensíveis. Por
   isso serializamos Buffer explicitamente como base64 e restauramos
   na leitura. É a causa nº 1 de "funciona no primeiro boot e quebra
   no segundo".
   ────────────────────────────────────────────────────────────────── */
import pg from "pg";
import { initAuthCreds, BufferJSON, proto } from "baileys";

const TABELA = "whatsapp_auth";

export async function usePostgresAuthState(pool, sessionId = "default") {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABELA} (
      session_id text NOT NULL,
      chave      text NOT NULL,
      valor      jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (session_id, chave)
    )
  `);

  /* BufferJSON.replacer/reviver são do próprio Baileys e tratam
     Buffer corretamente. Usar os deles evita divergir do formato que
     a biblioteca espera. */
  const escrever = async (chave, valor) => {
    const json = JSON.stringify(valor, BufferJSON.replacer);
    await pool.query(
      `INSERT INTO ${TABELA} (session_id, chave, valor, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (session_id, chave)
       DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
      [sessionId, chave, json]
    );
  };

  const ler = async (chave) => {
    const { rows } = await pool.query(
      `SELECT valor FROM ${TABELA} WHERE session_id = $1 AND chave = $2`,
      [sessionId, chave]
    );
    if (!rows.length) return null;
    // valor volta como objeto (jsonb); re-serializa para aplicar o reviver.
    return JSON.parse(JSON.stringify(rows[0].valor), BufferJSON.reviver);
  };

  const apagar = async (chave) => {
    await pool.query(
      `DELETE FROM ${TABELA} WHERE session_id = $1 AND chave = $2`,
      [sessionId, chave]
    );
  };

  const creds = (await ler("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (tipo, ids) => {
          const saida = {};
          await Promise.all(
            ids.map(async (id) => {
              let v = await ler(`${tipo}-${id}`);
              /* app-state-sync-key precisa virar o tipo do protobuf,
                 senão a sincronização de contatos falha silenciosamente
                 e o bot "não vê" mensagens de alguns chats. */
              if (tipo === "app-state-sync-key" && v) {
                v = proto.Message.AppStateSyncKeyData.fromObject(v);
              }
              if (v) saida[id] = v;
            })
          );
          return saida;
        },
        set: async (dados) => {
          const tarefas = [];
          for (const tipo in dados) {
            for (const id in dados[tipo]) {
              const valor = dados[tipo][id];
              const chave = `${tipo}-${id}`;
              tarefas.push(valor ? escrever(chave, valor) : apagar(chave));
            }
          }
          await Promise.all(tarefas);
        },
      },
    },
    /* Precisa ser chamado em TODO evento creds.update. Se esquecer,
       a sessão parece funcionar até reiniciar — e aí pede QR de novo. */
    saveCreds: () => escrever("creds", creds),

    /* Desconectar de vez: apaga a sessão inteira. */
    limparSessao: async () => {
      await pool.query(`DELETE FROM ${TABELA} WHERE session_id = $1`, [sessionId]);
    },
  };
}
