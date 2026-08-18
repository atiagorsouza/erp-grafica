#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Serviço WhatsApp do PrintFlow — processo separado do Next.

   Por que separado: o Baileys mantém uma sessão viva por WebSocket.
   Dentro do Next, cada rebuild derrubaria a conexão e exigiria ler o
   QR de novo — insustentável em produção.

   Sobe uma API HTTP mínima que o ERP consome:

     GET  /status        estado da conexão (JSON)
     GET  /qr            QR atual em PNG (data URL)
     GET  /eventos       stream SSE para a tela atualizar sozinha
     POST /enviar        { para, texto } — envio manual pelo atendente
     POST /assumir       { telefone } — humano assume a conversa
     POST /devolver      { telefone } — devolve ao bot
     POST /reiniciar     força reconexão
     POST /desconectar   { apagarSessao } — encerra a sessão

   Escuta só em 127.0.0.1 por padrão: quem fala com ele é o ERP, na
   mesma máquina. Não deve ficar exposto à internet.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import http from "node:http";
import pg from "pg";
import { criarGerenciador } from "./conexao.mjs";
import { criarPreCadastro } from "./pre-cadastro.mjs";
import { paraJid, doJid } from "./telefone.mjs";

const PORTA = Number(process.env.WA_PORT || 3101);
const HOST = process.env.WA_HOST || "127.0.0.1";
const TOKEN = process.env.WA_TOKEN || "";
const EMPRESA = process.env.WA_EMPRESA || "VTDIGITAL";

if (!process.env.DATABASE_URL) {
  console.error("✖ DATABASE_URL não definida. O serviço guarda a sessão no banco.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

const preCadastro = criarPreCadastro({
  pool,
  empresa: EMPRESA,
  contarEnviada: () => gerenciador?.contarEnviada(),
});

const gerenciador = criarGerenciador({
  pool,
  aoReceberMensagem: (ctx) => preCadastro.tratar(ctx),
});

/* ── HTTP ─────────────────────────────────────────────────────────── */
const json = (res, code, corpo) => {
  const s = JSON.stringify(corpo);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(s),
  });
  res.end(s);
};

const lerCorpo = (req) =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 1e6) req.destroy();   // não aceitamos payload grande
    });
    req.on("end", () => {
      try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); }
    });
  });

/* Token simples. O serviço só escuta em localhost, mas se alguém
   publicar a porta sem pensar, ao menos não fica aberto. */
function autorizado(req) {
  if (!TOKEN) return true;
  const h = req.headers.authorization || "";
  return h === `Bearer ${TOKEN}` || req.headers["x-wa-token"] === TOKEN;
}

const clientesSSE = new Set();

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rota = url.pathname;

  if (rota === "/saude") return json(res, 200, { ok: true, servico: "whatsapp" });

  if (!autorizado(req)) return json(res, 401, { erro: "não autorizado" });

  try {
    if (rota === "/status" && req.method === "GET") {
      return json(res, 200, gerenciador.estado());
    }

    if (rota === "/qr" && req.method === "GET") {
      const e = gerenciador.estado();
      if (!e.qrDataUrl) {
        return json(res, 404, { erro: "sem QR no momento", status: e.status });
      }
      return json(res, 200, { qr: e.qrDataUrl, expiraEm: e.qrExpiraEm });
    }

    /* SSE: a tela do ERP escuta e reage sozinha, sem ficar
       perguntando de segundo em segundo. */
    if (rota === "/eventos" && req.method === "GET") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write(`data: ${JSON.stringify(gerenciador.estado())}\n\n`);
      const parar = gerenciador.aoMudar((e) => {
        res.write(`data: ${JSON.stringify(e)}\n\n`);
      });
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      clientesSSE.add(res);
      req.on("close", () => {
        clearInterval(ping);
        parar();
        clientesSSE.delete(res);
      });
      return;
    }

    if (rota === "/enviar" && req.method === "POST") {
      const { para, texto } = await lerCorpo(req);
      if (!para || !texto) return json(res, 422, { erro: "informe 'para' e 'texto'" });

      const e = gerenciador.estado();
      if (e.status !== "conectado") {
        return json(res, 409, { erro: "WhatsApp não está conectado", status: e.status });
      }

      const jid = paraJid(para);
      if (!jid) return json(res, 422, { erro: "telefone inválido" });

      const fone = doJid(jid);

      /* Respeita o opt-out. Vale inclusive para envio manual: se a
         pessoa pediu para não receber, não recebe. */
      const { rows } = await pool.query(
        `SELECT whatsapp_opt_out FROM customers WHERE phone_e164 = $1 LIMIT 1`,
        [fone]
      );
      if (rows[0]?.whatsapp_opt_out) {
        return json(res, 403, { erro: "este contato pediu para não receber mensagens" });
      }

      const sock = gerenciador.socket();
      const enviada = await sock.sendMessage(jid, { text: String(texto) });
      gerenciador.contarEnviada();
      await pool.query(
        `INSERT INTO whatsapp_mensagens (phone_e164, direcao, texto, wa_id)
         VALUES ($1,'enviada',$2,$3)`,
        [fone, String(texto), enviada?.key?.id || null]
      );
      return json(res, 200, { ok: true, id: enviada?.key?.id });
    }

    if (rota === "/assumir" && req.method === "POST") {
      const { telefone, atendente = "atendente" } = await lerCorpo(req);
      const fone = doJid(telefone) || null;
      if (!fone) return json(res, 422, { erro: "telefone inválido" });
      await pool.query(
        `UPDATE whatsapp_conversas
            SET etapa = 'humano', assumida_por = $2, assumida_em = now()
          WHERE phone_e164 = $1`,
        [fone, atendente]
      );
      return json(res, 200, { ok: true });
    }

    if (rota === "/devolver" && req.method === "POST") {
      const { telefone } = await lerCorpo(req);
      const fone = doJid(telefone) || null;
      if (!fone) return json(res, 422, { erro: "telefone inválido" });
      await pool.query(
        `UPDATE whatsapp_conversas
            SET assumida_por = NULL, assumida_em = NULL
          WHERE phone_e164 = $1`,
        [fone]
      );
      return json(res, 200, { ok: true });
    }

    if (rota === "/reiniciar" && req.method === "POST") {
      await gerenciador.reiniciar();
      return json(res, 200, { ok: true });
    }

    if (rota === "/desconectar" && req.method === "POST") {
      const { apagarSessao = false } = await lerCorpo(req);
      await gerenciador.desconectar({ apagarSessao });
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { erro: "rota não encontrada" });
  } catch (e) {
    console.error("[whatsapp]", e);
    return json(res, 500, { erro: e.message });
  }
});

servidor.listen(PORTA, HOST, async () => {
  console.log(`▲ Serviço WhatsApp em http://${HOST}:${PORTA}`);
  if (!TOKEN) console.warn("! WA_TOKEN não definido — a API está sem senha");
  await preCadastro.garantirTabela();
  gerenciador.conectar().catch((e) => console.error("falha ao conectar:", e.message));
});

const encerrar = async (sinal) => {
  console.log(`\n${sinal} recebido, encerrando...`);
  for (const c of clientesSSE) { try { c.end(); } catch { /* ignora */ } }
  servidor.close();
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", () => encerrar("SIGTERM"));
process.on("SIGINT", () => encerrar("SIGINT"));
