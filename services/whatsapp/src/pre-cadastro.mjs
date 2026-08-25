/* ──────────────────────────────────────────────────────────────────
   Pré-cadastro: recebe quem escreve e monta a ficha do cliente.

   Este bot é INBOUND. Ele só fala com quem falou primeiro — o que,
   segundo os dados de 2026, mantém o risco de ban abaixo de 2% ao
   ano, contra 15–30% de quem aborda contato frio.

   O fluxo é curto de propósito. Pedir muita coisa por WhatsApp faz a
   pessoa desistir no meio, e ficha pela metade não serve para nada:

     1. Chegou mensagem   → cria/acha o lead, pergunta o nome
     2. Respondeu o nome  → grava, pergunta se é pessoa ou empresa
     3. Respondeu         → grava, oferece atendimento humano
     4. Pronto            → conversa livre, humano assume

   Regras que valem mais que o fluxo:

   · Quem já é cliente NÃO entra no funil. É constrangedor perguntar
     o nome de quem compra há dois anos.
   · Em qualquer momento a pessoa pode escrever "atendente" e o bot
     se cala.
   · "sair"/"parar" marca opt-out e o bot nunca mais escreve.
   · Toda mensagem enviada é resposta a uma mensagem recebida, dentro
     da janela de 24h — a categoria mais segura da política.
   ────────────────────────────────────────────────────────────────── */
import { doJid, bonito } from "./telefone.mjs";
import { criarMensagens } from "./mensagens.mjs";
import { criarEstadoBot } from "./bot-estado.mjs";

const PEDIR_NOME = "pedir_nome";
const PEDIR_TIPO = "pedir_tipo";
const CONCLUIDO = "concluido";
const HUMANO = "humano";

/* Frases que encerram o bot na hora. */
const QUER_HUMANO = /\b(atendente|humano|pessoa|falar com algu[eé]m|suporte)\b/i;
const QUER_SAIR = /^\s*(sair|parar|stop|cancelar|n[aã]o quero|descadastrar)\s*$/i;

const ESPERA_MIN = 1200;   // pausa mínima antes de responder
const ESPERA_MAX = 3000;

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/* Responder instantaneamente é assinatura de robô. Uma pausa curta,
   variável, imita leitura humana e reduz o sinal de automação. */
async function responder(sock, jid, texto, contar) {
  await dorme(ESPERA_MIN + Math.random() * (ESPERA_MAX - ESPERA_MIN));
  try { await sock.sendPresenceUpdate("composing", jid); } catch { /* opcional */ }
  await dorme(400 + Math.random() * 800);
  await sock.sendMessage(jid, { text: texto });
  try { await sock.sendPresenceUpdate("paused", jid); } catch { /* opcional */ }
  contar?.();
}

/* ── Uma conversa por vez ──────────────────────────────────────────
   Quem digita rápido manda duas mensagens em menos de um segundo. As
   duas entram em `tratar()` ao mesmo tempo, LEEM O MESMO ESTADO e
   respondem as duas — foi o que produziu, num teste real:

     você: "Tiago"
     bot : "Desculpe, não entendi. Pode me dizer só o seu nome?"
     você: "Tiago"
     bot : "Desculpe, não entendi..."     ← execução atrasada
     bot : "Prazer, Tiago! É para você ou empresa?"
     bot : "responda 1 ou 2"              ← as duas responderam

   A correção é serializar por telefone: a segunda mensagem espera a
   primeira terminar e então lê o estado já atualizado. Fila em
   memória basta porque só existe um processo do serviço.        */
const filas = new Map();

function enfileirar(chave, tarefa) {
  const anterior = filas.get(chave) || Promise.resolve();
  const atual = anterior.then(tarefa, tarefa);
  // Libera a chave quando esta for a última da fila (evita vazamento).
  filas.set(chave, atual);
  atual.finally(() => { if (filas.get(chave) === atual) filas.delete(chave); });
  return atual;
}

export function criarPreCadastro({ pool, empresa = "VTDIGITAL", contarEnviada }) {
  /* Todo texto que o bot manda vem daqui. O padrão está no código;
     o banco só guarda o que o operador customizou pela web. */
  const msgs = criarMensagens({ pool });
  /* Liga/desliga do bot. Pausado, ele continua ouvindo e gravando —
     só para de responder. Ver bot-estado.mjs. */
  const estadoBot = criarEstadoBot({ pool });

  /* Estado da conversa vive no banco: reiniciar o serviço não pode
     fazer o bot perguntar o nome de novo para quem já respondeu. */
  async function garantirTabela() {
    await msgs.garantirTabela();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_conversas (
        phone_e164   text PRIMARY KEY,
        customer_id  integer,
        etapa        text NOT NULL DEFAULT '${PEDIR_NOME}',
        ultima_msg   timestamptz NOT NULL DEFAULT now(),
        primeira_msg timestamptz NOT NULL DEFAULT now(),
        recebidas    integer NOT NULL DEFAULT 0,
        saudou       boolean NOT NULL DEFAULT false,
        assumida_por text,
        assumida_em  timestamptz
      )
    `);
    /* Instalações da 3.47.0/3.47.1 já têm a tabela sem esta coluna. */
    await pool.query(
      `ALTER TABLE whatsapp_conversas
         ADD COLUMN IF NOT EXISTS saudou boolean NOT NULL DEFAULT false`
    );
    /* Aviso de ausência é uma vez por conversa, não por mensagem. */
    await pool.query(
      `ALTER TABLE whatsapp_conversas
         ADD COLUMN IF NOT EXISTS avisou_ausencia boolean NOT NULL DEFAULT false`
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
        id          bigserial PRIMARY KEY,
        phone_e164  text NOT NULL,
        direcao     text NOT NULL,
        texto       text,
        wa_id       text,
        criado_em   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS whatsapp_mensagens_fone_idx
         ON whatsapp_mensagens (phone_e164, criado_em DESC)`
    );
  }

  async function registrar(fone, direcao, texto, waId = null) {
    await pool.query(
      `INSERT INTO whatsapp_mensagens (phone_e164, direcao, texto, wa_id)
       VALUES ($1,$2,$3,$4)`,
      [fone, direcao, texto, waId]
    );
  }

  /* Acha o cliente pelas duas formas possíveis do número. Sem isto,
     quem tem cadastro antigo sem o nono dígito viraria lead novo. */
  async function acharCliente(fone) {
    const semNono = fone.length === 13 ? fone.slice(0, 4) + fone.slice(5) : null;
    const chaves = semNono ? [fone, semNono] : [fone];
    const { rows } = await pool.query(
      `SELECT id, name, status, whatsapp_opt_out
         FROM customers
        WHERE phone_e164 = ANY($1::text[])
        LIMIT 1`,
      [chaves]
    );
    return rows[0] || null;
  }

  /* INSERT ... ON CONFLICT: se duas mensagens do mesmo número chegarem
     juntas, o índice único garante um só cliente, e o DO UPDATE
     devolve a linha existente em vez de estourar erro. */
  async function criarLead(fone) {
    const { rows } = await pool.query(
      `INSERT INTO customers (type, name, whatsapp, phone_e164, status, origin)
       VALUES ('pf', $1, $2, $3, 'lead', 'whatsapp')
       ON CONFLICT (phone_e164) WHERE coalesce(phone_e164,'') <> ''
       DO UPDATE SET updated_at = now()
       RETURNING id, name, status`,
      [`WhatsApp ${bonito(fone)}`, bonito(fone), fone]
    );
    return rows[0];
  }

  async function pegarConversa(fone, customerId) {
    const { rows } = await pool.query(
      `INSERT INTO whatsapp_conversas (phone_e164, customer_id, recebidas)
       VALUES ($1, $2, 1)
       ON CONFLICT (phone_e164) DO UPDATE
         SET ultima_msg = now(),
             recebidas  = whatsapp_conversas.recebidas + 1,
             customer_id = COALESCE(whatsapp_conversas.customer_id, EXCLUDED.customer_id)
       RETURNING *`,
      [fone, customerId]
    );
    return rows[0];
  }

  const mudarEtapa = (fone, etapa) =>
    pool.query(`UPDATE whatsapp_conversas SET etapa = $2 WHERE phone_e164 = $1`, [fone, etapa]);

  /* Ponto de entrada: serializa por telefone antes de processar. */
  async function tratar(ctx) {
    const chave = String(ctx.jid || "").split("@")[0];
    return enfileirar(chave, () => tratarSerial(ctx));
  }

  async function tratarSerial({ sock, msg, jid, texto }) {
    /* Defesa em profundidade: conexao.mjs já filtra, mas se alguém
       chamar esta função direto (teste, replay, futura fila), grupo
       não pode virar cliente. Um JID de grupo é "12345-67890@g.us" e
       os dígitos dele passam por telefone válido — o descarte tem de
       ser pelo sufixo, não pelo número.

       Aceita só "@s.whatsapp.net": um "@lid" já foi convertido para o
       número real em conexao.mjs. Se chegasse aqui, viraria cliente
       com um LID no lugar do telefone. */
    if (!String(jid).endsWith("@s.whatsapp.net")) return;

    const fone = doJid(jid);
    if (!fone) return;                        // número que não sabemos ler

    await garantirTabela();
    await registrar(fone, "recebida", texto, msg.key?.id);

    let cliente = await acharCliente(fone);
    const novo = !cliente;
    if (!cliente) cliente = await criarLead(fone);

    const conversa = await pegarConversa(fone, cliente.id);

    /* Humano assumiu: o bot fica em silêncio, mas continua gravando
       tudo para o histórico aparecer no chat do ERP. */
    if (conversa.assumida_por) return;

    /* ── Bot desligado no painel ────────────────────────────────────
       A mensagem JÁ FOI gravada acima e o cliente já foi vinculado:
       nada se perde, só não respondemos.

       O opt-out é a exceção deliberada. "Sair"/"parar" é pedido do
       titular sob a LGPD, não recurso do bot — atender isso não pode
       depender de o operador ter ligado ou desligado alguma coisa. */
    const bot = await estadoBot.ler();
    if (bot.pausado && !QUER_SAIR.test(texto)) {
      /* Aviso de ausência: uma única vez por conversa, para o cliente
         não achar que falou com o vazio. Repetir a cada mensagem seria
         pior que o silêncio. */
      if (bot.ausenciaAtiva && !conversa.avisou_ausencia) {
        await pool.query(
          `UPDATE whatsapp_conversas SET avisou_ausencia = true WHERE phone_e164 = $1`,
          [fone]
        );
        const t = await msgs.texto("bot.ausencia", { empresa });
        if (t) {
          await responder(sock, jid, t, contarEnviada);
          await registrar(fone, "enviada", t);
        }
      }
      return;
    }

    if (QUER_SAIR.test(texto)) {
      await pool.query(
        `UPDATE customers SET whatsapp_opt_out = true, updated_at = now() WHERE id = $1`,
        [cliente.id]
      );
      await mudarEtapa(fone, HUMANO);
      const t = await msgs.texto("bot.opt_out");
      if (t) await responder(sock, jid, t, contarEnviada);
      if (t) await registrar(fone, "enviada", t);
      return;
    }

    if (QUER_HUMANO.test(texto)) {
      await mudarEtapa(fone, HUMANO);
      const t = await msgs.texto("bot.quer_humano");
      if (t) await responder(sock, jid, t, contarEnviada);
      if (t) await registrar(fone, "enviada", t);
      return;
    }

    /* Cliente de verdade não passa pelo funil de pré-cadastro. */
    if (!novo && cliente.status && cliente.status !== "lead") {
      if (conversa.etapa !== HUMANO) await mudarEtapa(fone, HUMANO);
      if (conversa.recebidas <= 1) {
        const primeiro = String(cliente.name || "").split(" ")[0];
        const t = await msgs.texto("bot.cliente_conhecido", { nome: primeiro, empresa });
        if (t) await responder(sock, jid, t, contarEnviada);
        if (t) await registrar(fone, "enviada", t);
      }
      return;
    }

    switch (conversa.etapa) {
      case PEDIR_NOME: {
        /* A saudação é decidida pela ETAPA, não por contador de
           mensagens. Com `recebidas <= 1` o bot cumprimentava, mudava
           para a etapa seguinte só depois — e se a pessoa respondesse
           rápido, a segunda mensagem ainda via o contador antigo e a
           saudação saía duas vezes. */
        if (!conversa.saudou) {
          await pool.query(
            `UPDATE whatsapp_conversas SET saudou = true WHERE phone_e164 = $1`,
            [fone]
          );
          const t = await msgs.texto("bot.saudacao", { empresa });
          if (t) await responder(sock, jid, t, contarEnviada);
          if (t) await registrar(fone, "enviada", t);
          return;
        }
        const nome = limparNome(texto);
        if (!nome) {
          const t = await msgs.texto("bot.nome_invalido", { empresa });
          if (t) await responder(sock, jid, t, contarEnviada);
          if (t) await registrar(fone, "enviada", t);
          return;
        }
        await pool.query(
          `UPDATE customers SET name = $2, updated_at = now() WHERE id = $1`,
          [cliente.id, nome]
        );
        await mudarEtapa(fone, PEDIR_TIPO);
        const t = await msgs.texto("bot.pede_tipo", { nome: nome.split(" ")[0], empresa });
        if (t) await responder(sock, jid, t, contarEnviada);
        if (t) await registrar(fone, "enviada", t);
        return;
      }

      case PEDIR_TIPO: {
        const ehEmpresa = /\b(2|empresa|cnpj|companhia|loja|neg[oó]cio)\b/i.test(texto);
        const ehPessoa = /\b(1|pra mim|para mim|pessoa|pessoal|cpf|eu)\b/i.test(texto);
        if (!ehEmpresa && !ehPessoa) {
          const t = await msgs.texto("bot.tipo_invalido", { empresa });
          if (t) await responder(sock, jid, t, contarEnviada);
          if (t) await registrar(fone, "enviada", t);
          return;
        }
        await pool.query(
          `UPDATE customers SET type = $2, updated_at = now() WHERE id = $1`,
          [cliente.id, ehEmpresa ? "pj" : "pf"]
        );
        await mudarEtapa(fone, CONCLUIDO);
        const t = await msgs.texto("bot.concluido", { nome: String(cliente.name || "").split(" ")[0], empresa });
        if (t) await responder(sock, jid, t, contarEnviada);
        if (t) await registrar(fone, "enviada", t);
        return;
      }

      case CONCLUIDO: {
        /* Ficha montada. A partir daqui é assunto de gente — avisamos
           uma vez e passamos para o humano. */
        await mudarEtapa(fone, HUMANO);
        const t = await msgs.texto("bot.passa_equipe", { nome: String(cliente.name || "").split(" ")[0], empresa });
        if (t) await responder(sock, jid, t, contarEnviada);
        if (t) await registrar(fone, "enviada", t);
        return;
      }

      default:
        return;   // HUMANO: silêncio, só registra
    }
  }

  return { tratar, garantirTabela, estadoBot };
}

/* O nome vem no meio de frase ("meu nome é Maria", "sou o João").
   Sem limpar, o cadastro fica com lixo. */
function limparNome(bruto) {
  let t = String(bruto || "")
    .replace(/^\s*(meu\s+nome\s+(é|eh|e)|me\s+chamo|sou\s+(o|a)?|aqui\s+(é|eh|e)\s+(o|a)?)\s*/i, "")
    .replace(/[^\p{L}\s'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 2 || t.length > 60) return null;
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|e a[ií]|test\w*)$/i.test(t)) return null;
  return t
    .split(" ")
    .map((p) => (p.length > 2 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()))
    .join(" ");
}
