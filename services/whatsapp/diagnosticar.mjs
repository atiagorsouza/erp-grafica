#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Diagnóstico do serviço WhatsApp — "por que o bot está mudo?"

     node diagnosticar.mjs

   Confere, em ordem, tudo que precisa estar certo para uma mensagem
   virar resposta. Para no primeiro problema e diz o que fazer.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";

const PORTA = process.env.WA_PORT || 3101;
const TOKEN = process.env.WA_TOKEN || "";
let problemas = 0;

const ok = (m) => console.log(`  ✔ ${m}`);
const er = (m) => { console.log(`  ✖ ${m}`); problemas++; };
const nota = (m) => console.log(`     ${m}`);
const tit = (m) => console.log(`\n▸ ${m}`);

console.log("═".repeat(60));
console.log("  DIAGNÓSTICO — serviço WhatsApp");
console.log("═".repeat(60));

/* 1 ── o processo responde? ───────────────────────────────────────── */
tit("Serviço");
let estado = null;
try {
  const r = await fetch(`http://127.0.0.1:${PORTA}/status`, {
    headers: TOKEN ? { "x-wa-token": TOKEN } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401) {
    er("token recusado — WA_TOKEN diferente do que o serviço usa");
    nota("compare: grep WA_TOKEN .env  e  grep WA_TOKEN ../../.env");
  } else {
    estado = await r.json();
    ok(`respondendo na porta ${PORTA}`);
  }
} catch {
  er(`nada respondendo em 127.0.0.1:${PORTA}`);
  nota("suba com: pm2 start src/index.mjs --name printflow-whatsapp");
  console.log("\nSem o serviço no ar, o resto não faz sentido.");
  process.exit(1);
}

/* 2 ── conexão com o WhatsApp ─────────────────────────────────────── */
if (estado) {
  tit("Conexão com o WhatsApp");
  if (estado.status === "conectado") {
    ok(`conectado como ${estado.numero}`);
    const min = estado.conectadoDesde
      ? Math.round((Date.now() - new Date(estado.conectadoDesde)) / 60000)
      : null;
    if (min !== null) nota(`no ar há ${min} min`);
  } else {
    er(`status: ${estado.status}`);
    if (estado.status === "qr") nota("leia o QR na tela do ERP");
    if (estado.status === "banido") nota("o WhatsApp recusou — espere algumas horas");
    if (estado.ultimoErro) nota(`último erro: ${estado.ultimoErro}`);
  }
  console.log(`     recebidas: ${estado.mensagensRecebidas} · enviadas: ${estado.mensagensEnviadas}`);
  if (estado.status === "conectado" && estado.mensagensRecebidas === 0) {
    nota("⚠ conectado mas nenhuma mensagem chegou ainda");
  }
}

/* 3 ── o código tem suporte a @lid? ───────────────────────────────── */
tit("Versão do código");
const src = existsSync("./src/conexao.mjs") ? readFileSync("./src/conexao.mjs", "utf8") : "";
if (src.includes("resolverLid")) ok("suporte a @lid presente (3.47.1+)");
else {
  er("SEM suporte a @lid — o bot fica mudo com WhatsApp novo");
  nota("instale a 3.47.1 e rode: pm2 restart printflow-whatsapp");
}
if (src.includes("log.warn(\n        { tipo: type") || src.includes("→ messages.upsert recebido")) {
  ok("log de entrada em nível visível");
} else {
  er("log de entrada em nível 'info' — invisível no padrão 'warn'");
  nota("instale a 3.47.2");
}

/* 4 ── banco ──────────────────────────────────────────────────────── */
tit("Banco de dados");
if (!process.env.DATABASE_URL) {
  er("DATABASE_URL ausente no .env do serviço");
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const t = await pool.query(`
      SELECT tablename FROM pg_tables
       WHERE tablename IN ('whatsapp_auth','whatsapp_conversas','whatsapp_mensagens','customers')
       ORDER BY 1`);
    const achadas = t.rows.map((x) => x.tablename);
    for (const nome of ["customers", "whatsapp_auth", "whatsapp_conversas", "whatsapp_mensagens"]) {
      achadas.includes(nome) ? ok(`tabela ${nome}`) : er(`tabela ${nome} FALTANDO`);
    }

    const idx = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'customers_phone_e164_unique_idx'`
    );
    idx.rowCount ? ok("índice único de telefone") : er("índice único de telefone AUSENTE (v3.46.6)");

    const sess = await pool.query(`SELECT count(*)::int n FROM whatsapp_auth`);
    sess.rows[0].n > 0
      ? ok(`sessão gravada (${sess.rows[0].n} chaves)`)
      : er("sessão vazia — o QR nunca foi lido, ou foi apagada");

    const msgs = await pool.query(`
      SELECT direcao, count(*)::int n FROM whatsapp_mensagens GROUP BY direcao`);
    if (!msgs.rowCount) {
      nota("nenhuma mensagem registrada ainda");
    } else {
      for (const m of msgs.rows) ok(`${m.n} mensagem(ns) ${m.direcao}`);
    }

    const leads = await pool.query(
      `SELECT count(*)::int n FROM customers WHERE origin = 'whatsapp'`);
    console.log(`     leads criados pelo bot: ${leads.rows[0].n}`);

    const ult = await pool.query(`
      SELECT phone_e164, direcao, left(texto, 50) AS texto, criado_em
        FROM whatsapp_mensagens ORDER BY criado_em DESC LIMIT 5`);
    if (ult.rowCount) {
      console.log("\n     últimas mensagens:");
      for (const m of ult.rows) {
        const h = new Date(m.criado_em).toLocaleString("pt-BR");
        console.log(`       ${h}  ${m.direcao.padEnd(8)} ${m.phone_e164}  "${m.texto || ""}"`);
      }
    }
  } catch (e) {
    er(`falha no banco: ${e.message}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

/* ── veredito ──────────────────────────────────────────────────────── */
console.log("\n" + "═".repeat(60));
if (problemas === 0) {
  console.log("  Nada errado na configuração.");
  if (estado?.status === "conectado" && estado.mensagensRecebidas === 0) {
    console.log("\n  O serviço está pronto, mas nenhuma mensagem chegou.");
    console.log("  Para ver o que o WhatsApp está mandando de verdade:");
    console.log("\n    pm2 stop printflow-whatsapp");
    console.log("    cd services/whatsapp");
    console.log("    WA_DEBUG=1 WA_LOG_LEVEL=debug node src/index.mjs");
    console.log("\n  Mande uma mensagem e observe. Se NADA aparecer, o");
    console.log("  WhatsApp não está entregando ao aparelho vinculado —");
    console.log("  costuma ser o celular principal offline por muito tempo.");
  }
} else {
  console.log(`  ${problemas} problema(s) encontrado(s) — veja acima.`);
}
console.log("═".repeat(60));
process.exit(problemas ? 1 : 0);
