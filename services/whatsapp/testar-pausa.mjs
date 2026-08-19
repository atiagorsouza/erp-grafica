#!/usr/bin/env node
/* Verifica o liga/desliga do bot contra o banco real, sem WhatsApp.

   O que precisa ser verdade quando o bot está DESLIGADO:
     · não responde
     · MAS continua gravando a mensagem recebida
     · MAS continua criando/achando o cliente
     · "sair" (opt-out) funciona mesmo assim — é LGPD
     · o aviso de ausência sai no máximo uma vez por conversa
     · pausa com prazo vencido religa sozinha

   Rode: node testar-pausa.mjs */
import "dotenv/config";
import pg from "pg";
import { criarPreCadastro } from "./src/pre-cadastro.mjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const pc = criarPreCadastro({ pool, empresa: "VTDIGITAL" });
await pc.garantirTabela();

let ok = 0, falhas = 0;
const checar = (cond, desc) => {
  console.log(`  ${cond ? "✔" : "✖"} ${desc}`);
  cond ? ok++ : falhas++;
};

function sockFalso() {
  const enviadas = [];
  return {
    enviadas,
    sendMessage: async (_j, c) => { enviadas.push(c.text); return { key: { id: "x" } }; },
    sendPresenceUpdate: async () => {},
  };
}

const FONE = "5521970009999";
const JID = `${FONE}@s.whatsapp.net`;

const limpar = async () => {
  await pool.query(`DELETE FROM whatsapp_mensagens WHERE phone_e164=$1`, [FONE]);
  await pool.query(`DELETE FROM whatsapp_conversas WHERE phone_e164=$1`, [FONE]);
  await pool.query(`DELETE FROM customers WHERE phone_e164=$1`, [FONE]);
};

const conversar = async (textos) => {
  const sock = sockFalso();
  for (const t of textos) {
    await pc.tratar({ sock, msg: { key: { id: "m" + Math.random() } }, jid: JID, texto: t });
  }
  return sock.enviadas;
};

const contarMsgs = async (direcao) =>
  Number(
    (await pool.query(
      `SELECT count(*)::int n FROM whatsapp_mensagens WHERE phone_e164=$1 AND direcao=$2`,
      [FONE, direcao]
    )).rows[0].n
  );

try {
  console.log("\n═══ 1. Bot LIGADO responde normalmente ═══");
  await pc.estadoBot.retomar();
  await limpar();
  let r = await conversar(["oi"]);
  checar(r.length === 1, `respondeu (${r.length} mensagem)`);

  console.log("\n═══ 2. Bot DESLIGADO cala, mas não perde nada ═══");
  await pc.estadoBot.pausar({ minutos: null, motivo: "teste" });
  await pc.estadoBot.definirAusencia(false);
  await limpar();
  r = await conversar(["oi, preciso de cartão de visita"]);
  checar(r.length === 0, "não respondeu");
  checar((await contarMsgs("recebida")) === 1, "gravou a mensagem recebida");
  const { rows: cli } = await pool.query(
    `SELECT id, origin FROM customers WHERE phone_e164=$1`, [FONE]
  );
  checar(cli.length === 1, "criou o cliente mesmo calado");
  checar(cli[0]?.origin === "whatsapp", "marcou a origem");

  console.log("\n═══ 3. Opt-out funciona MESMO com o bot desligado ═══");
  await limpar();
  r = await conversar(["oi", "sair"]);
  const { rows: opt } = await pool.query(
    `SELECT whatsapp_opt_out FROM customers WHERE phone_e164=$1`, [FONE]
  );
  checar(opt[0]?.whatsapp_opt_out === true, "gravou o opt-out (LGPD não se pausa)");
  checar(r.length === 1, "confirmou para a pessoa");

  console.log("\n═══ 4. Aviso de ausência: uma vez por conversa ═══");
  await pc.estadoBot.definirAusencia(true);
  await limpar();
  r = await conversar(["oi", "tem cartão?", "e banner?"]);
  checar(r.length === 1, `avisou uma única vez em 3 mensagens (${r.length})`);
  checar(/fora do atendimento autom/i.test(r[0] || ""), "texto é o aviso de ausência");
  checar((await contarMsgs("recebida")) === 3, "gravou as 3 recebidas");

  console.log("\n═══ 5. Pausa com prazo VENCIDO religa sozinha ═══");
  await pc.estadoBot.pausar({ minutos: 60 });
  /* Empurra o vencimento para o passado, como se a hora já tivesse
     chegado — testar esperando 1h não é opção. */
  await pool.query(
    `UPDATE settings SET value=$1 WHERE key='wa_bot_pausado_ate'`,
    [new Date(Date.now() - 60_000).toISOString()]
  );
  pc.estadoBot.invalidar();
  const estado = await pc.estadoBot.ler(true);
  checar(estado.pausado === false, "religou sozinho ao vencer o prazo");

  await limpar();
  r = await conversar(["oi"]);
  checar(r.length === 1, "voltou a responder");

  console.log("\n═══ 6. Estado sobrevive ao reinício do serviço ═══");
  await pc.estadoBot.pausar({ minutos: null, motivo: "teste persistência" });
  const outro = criarPreCadastro({ pool, empresa: "VTDIGITAL" });
  const lido = await outro.estadoBot.ler(true);
  checar(lido.pausado === true, "outra instância lê o estado pausado");
  checar(lido.motivo === "teste persistência", "motivo persistiu");

  await pc.estadoBot.retomar();
  await pc.estadoBot.definirAusencia(false);
  await limpar();
} catch (e) {
  console.error("\n✖ erro:", e.message);
  falhas++;
} finally {
  console.log("\n" + "═".repeat(46));
  console.log(`  ${ok} passaram · ${falhas} falharam`);
  console.log("═".repeat(46) + "\n");
  await pool.end();
  process.exitCode = falhas ? 1 : 0;
}
