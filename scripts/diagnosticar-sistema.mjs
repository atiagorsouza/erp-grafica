#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   VARREDURA GERAL — procura problemas que os testes não pegam.

     node scripts/diagnosticar-sistema.mjs

   Os testes automáticos verificam se o código FUNCIONA. Este script
   verifica se os DADOS estão sãos e se as telas não engordaram.

   Nasceu de um bug real (v3.53.1): o Painel de Controle parou de
   abrir em produção porque as logos, guardadas como base64 no banco,
   eram embutidas no HTML — a página passou de 200 KB para 12 MB.
   Nenhum teste pegava isso, porque tecnicamente respondia HTTP 200.

   Não altera nada. Só olha e relata.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let problemas = 0;
let avisos = 0;

const titulo = (t) => {
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  ${t}`);
  console.log("─".repeat(64));
};
const ok = (m) => console.log(`  ✔ ${m}`);
const alerta = (m) => { console.log(`  ⚠ ${m}`); avisos++; };
const erro = (m) => { console.log(`  ✖ ${m}`); problemas++; };

const q = async (sql, p = []) => (await client.query(sql, p)).rows;
const n = async (sql) => Number((await q(sql))[0]?.n ?? 0);

/* ── 1. Páginas: respondem e não engordaram ────────────────────────
   O limite de 900 KB é generoso: as telas mais cheias ficam em ~300.
   Passar disso quase sempre significa que algo grande vazou para o
   HTML — foi assim que o Painel quebrou. */
const LIMITE_KB = 900;
const PAGINAS = [
  "/", "/clientes", "/orcamentos", "/pedidos", "/kanban", "/produtos",
  "/financeiro", "/relatorios", "/pdv", "/estoque", "/whatsapp",
  "/configuracoes", "/tabelas-precos", "/impressoras", "/servicos",
  "/calendario", "/envios", "/cobrancas",
];

titulo("1. PÁGINAS — respondem? pesam quanto?");
let servidorNoAr = true;
try {
  await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
} catch {
  servidorNoAr = false;
  alerta(`servidor não respondeu em ${BASE} — pulei a checagem de páginas`);
}

if (servidorNoAr) {
  let maior = { p: "", kb: 0 };
  for (const p of PAGINAS) {
    try {
      const r = await fetch(`${BASE}${p}`, { signal: AbortSignal.timeout(30000) });
      const kb = Math.round((await r.arrayBuffer()).byteLength / 1024);
      if (kb > maior.kb) maior = { p, kb };
      if (!r.ok) erro(`${p} respondeu HTTP ${r.status}`);
      else if (kb > LIMITE_KB) erro(`${p} está com ${kb} KB (limite ${LIMITE_KB} KB) — algo grande vazou para o HTML`);
    } catch (e) {
      erro(`${p} falhou: ${e.message}`);
    }
  }
  if (!problemas) ok(`as ${PAGINAS.length} páginas respondem · a mais pesada é ${maior.p} com ${maior.kb} KB`);

  /* Endpoints que devolvem JSON grande também travam tela. */
  for (const r of ["/api/crud/settings"]) {
    try {
      const res = await fetch(`${BASE}${r}`, { signal: AbortSignal.timeout(15000) });
      const kb = Math.round((await res.arrayBuffer()).byteLength / 1024);
      if (kb > 500) erro(`${r} devolve ${kb} KB — grande demais para uma tela consumir`);
      else ok(`${r} devolve ${kb} KB`);
    } catch (e) {
      erro(`${r} falhou: ${e.message}`);
    }
  }
}

/* ── 2. Valores gigantes no banco ─────────────────────────────────── */
titulo("2. SETTINGS — valores grandes demais");
const gordos = await q(
  `SELECT key, length(value) AS bytes FROM settings
    WHERE length(value) > 100000 ORDER BY length(value) DESC`
);
if (!gordos.length) ok("nenhum valor acima de 100 KB");
for (const g of gordos) {
  const mb = (g.bytes / 1024 / 1024).toFixed(1);
  const ehLogo = g.key.startsWith("company_logo");
  if (ehLogo) {
    ok(`${g.key} tem ${mb} MB — servido por /api/upload/logo, não vai no HTML`);
  } else {
    erro(`${g.key} tem ${mb} MB e NÃO é logo — confira quem lê essa chave`);
  }
}

/* ── 3. Integridade referencial ───────────────────────────────────── */
titulo("3. INTEGRIDADE — registros órfãos");
const orfaos = [
  ["pedidos apontando para cliente inexistente",
   `SELECT count(*) n FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
     WHERE o.customer_id IS NOT NULL AND c.id IS NULL`],
  ["orçamentos apontando para cliente inexistente",
   `SELECT count(*) n FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
     WHERE q.customer_id IS NOT NULL AND c.id IS NULL`],
  ["cards do Kanban sem pedido",
   `SELECT count(*) n FROM kanban_cards k LEFT JOIN orders o ON o.id=k.order_id
     WHERE k.order_id IS NOT NULL AND o.id IS NULL`],
  ["transações sem pedido",
   `SELECT count(*) n FROM transactions t LEFT JOIN orders o ON o.id=t.order_id
     WHERE t.order_id IS NOT NULL AND o.id IS NULL`],
  ["links de cadastro sem cliente",
   `SELECT count(*) n FROM registration_links r LEFT JOIN customers c ON c.id=r.customer_id
     WHERE c.id IS NULL`],
];
let limpos = true;
for (const [desc, sql] of orfaos) {
  try {
    const c = await n(sql);
    if (c > 0) { erro(`${c} ${desc}`); limpos = false; }
  } catch (e) {
    if (!/does not exist/.test(e.message)) throw e;
  }
}
if (limpos) ok("nenhum registro órfão");

/* ── 4. Duplicatas ────────────────────────────────────────────────── */
titulo("4. CLIENTES — duplicatas");
const dupDoc = await n(
  `SELECT count(*) n FROM (
     SELECT regexp_replace(document,'\\D','','g') d FROM customers
      WHERE coalesce(document,'')<>'' GROUP BY 1 HAVING count(*)>1) x`
);
const dupFone = await n(
  `SELECT count(*) n FROM (
     SELECT phone_e164 FROM customers WHERE coalesce(phone_e164,'')<>''
      GROUP BY 1 HAVING count(*)>1) x`
);
dupDoc ? erro(`${dupDoc} documento(s) repetido(s)`) : ok("nenhum CPF/CNPJ duplicado");
dupFone ? erro(`${dupFone} telefone(s) repetido(s)`) : ok("nenhum telefone duplicado");

const semChave = await n(
  `SELECT count(*) n FROM customers
    WHERE coalesce(phone_e164,'')='' AND coalesce(phone,'')<>''`
);
if (semChave) alerta(`${semChave} cliente(s) com telefone mas sem chave E.164 — o bot não os reconhece (rode scripts/backfill-phone-e164.mjs)`);
else ok("todos os telefones têm chave canônica");

/* ── 5. Dinheiro ──────────────────────────────────────────────────── */
titulo("5. FINANCEIRO — valores incoerentes");
const negativos = await n(`SELECT count(*) n FROM orders WHERE coalesce(total,0)<0`);
negativos ? erro(`${negativos} pedido(s) com total negativo`) : ok("nenhum total negativo");

const descontoMaior = await n(
  `SELECT count(*) n FROM orders WHERE coalesce(discount,0)>coalesce(subtotal,0)`
);
descontoMaior ? erro(`${descontoMaior} pedido(s) com desconto maior que o subtotal`) : ok("nenhum desconto acima do subtotal");

/* Só vale para pedido vivo: cancelado e quitado zeram os campos. */
const somaErrada = await n(
  `SELECT count(*) n FROM orders
    WHERE financial_status IN ('pendente','parcial')
      AND abs(coalesce(deposit_amount,0)+coalesce(balance_amount,0)-coalesce(total,0))>0.01`
);
somaErrada
  ? erro(`${somaErrada} pedido(s) em aberto onde entrada + saldo ≠ total`)
  : ok("entrada + saldo fecham com o total nos pedidos em aberto");

const semEntrada = await n(
  `SELECT count(*) n FROM orders
    WHERE production_status='em_producao' AND coalesce(deposit_amount,0)=0
      AND coalesce(notes,'') NOT ILIKE '%libera%'`
);
semEntrada
  ? alerta(`${semEntrada} pedido(s) em produção sem entrada e sem justificativa registrada`)
  : ok("todo pedido em produção tem entrada ou escape registrado");

const precoAbaixoCusto = await n(
  `SELECT count(*) n FROM products
    WHERE active AND coalesce(final_price,0)>0
      AND coalesce(final_price,0)<coalesce(cost_snapshot,0)`
);
precoAbaixoCusto ? erro(`${precoAbaixoCusto} produto(s) com preço abaixo do custo`) : ok("nenhum produto vendido abaixo do custo");

const margemRuim = await n(`SELECT count(*) n FROM products WHERE margin<0 OR margin>=1`);
margemRuim ? erro(`${margemRuim} produto(s) com margem fora de 0–1 (o campo é fração, não %)`) : ok("margens dentro da faixa");

/* ── 6. Configuração pendente ─────────────────────────────────────── */
titulo("6. PAINEL — o que ainda falta preencher");
const precisam = {
  company_cnpj: "CNPJ da empresa (sai na nota e nos documentos)",
  company_email: "e-mail da empresa",
  app_base_url: "URL pública — sem ela o link de cadastro sai errado",
  labor_hourly_rate: "valor-hora da mão de obra (serviços ficam sem custo de trabalho)",
};
const linhas = await q(
  `SELECT key, coalesce(value,'') v FROM settings WHERE key = ANY($1)`,
  [Object.keys(precisam)]
);
const mapa = new Map(linhas.map((r) => [r.key, r.v]));
let tudoOk = true;
for (const [k, desc] of Object.entries(precisam)) {
  const v = String(mapa.get(k) ?? "").trim();
  if (!v || v === "0") { alerta(`${k} está vazio — ${desc}`); tudoOk = false; }
}
if (tudoOk) ok("configurações essenciais preenchidas");

/* ── 7. Painel × banco ────────────────────────────────────────────── */
titulo("7. PAINEL — campos e chaves batem?");
try {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "config/control-panel-settings.json"), "utf8")
  );
  const canon = new Set(cfg.groups.flatMap((g) => g.fields.map((f) => f.key)));
  const noBanco = new Set((await q(`SELECT key FROM settings`)).map((r) => r.key));

  const faltando = [...canon].filter((k) => !noBanco.has(k));
  if (faltando.length) {
    alerta(`${faltando.length} campo(s) do Painel sem linha no banco: ${faltando.slice(0, 5).join(", ")}${faltando.length > 5 ? "…" : ""}`);
    console.log("     → rode: node scripts/ensure-settings.mjs");
  } else {
    ok(`os ${canon.size} campos do Painel têm linha no banco`);
  }

  /* Chaves de estado interno não pertencem ao Painel: são ligadas por
     botão, não digitadas em formulário. */
  const INTERNAS = /^(wa_bot_|_)/;
  const orfas = [...noBanco].filter((k) => !canon.has(k) && !INTERNAS.test(k));
  if (orfas.length) alerta(`${orfas.length} chave(s) no banco sem campo no Painel: ${orfas.slice(0, 6).join(", ")}`);
  else ok("nenhuma chave órfã (fora as de estado interno do bot)");

  const tipos = new Set(cfg.groups.flatMap((g) => g.fields.map((f) => f.type || "text")));
  const suportados = new Set(["text", "number", "select", "textarea", "logo"]);
  const naoSuportados = [...tipos].filter((t) => !suportados.has(t));
  if (naoSuportados.length) erro(`tipo(s) de campo que a tela não sabe desenhar: ${naoSuportados.join(", ")}`);
  else ok("todos os tipos de campo são suportados pela tela");
} catch (e) {
  erro(`não consegui ler o Painel: ${e.message}`);
}

/* ── 8. WhatsApp ──────────────────────────────────────────────────── */
titulo("8. WHATSAPP — estado do bot");
try {
  const est = await q(
    `SELECT key, coalesce(value,'') v FROM settings WHERE key LIKE 'wa_bot_%'`
  );
  const m = new Map(est.map((r) => [r.key, r.v]));
  const pausado = m.get("wa_bot_pausado") === "true";
  const ate = m.get("wa_bot_pausado_ate");
  if (pausado) {
    alerta(
      ate
        ? `o bot está DESLIGADO até ${new Date(ate).toLocaleString("pt-BR")}`
        : "o bot está DESLIGADO por tempo indeterminado — ninguém recebe resposta automática"
    );
  } else {
    ok("bot ligado (respondendo)");
  }

  const optOut = await n(`SELECT count(*) n FROM customers WHERE whatsapp_opt_out`);
  if (optOut) ok(`${optOut} cliente(s) com opt-out — o sistema respeita`);
} catch (e) {
  if (!/does not exist/.test(e.message)) alerta(`não consegui ler o estado do bot: ${e.message}`);
}

/* ── Resumo ───────────────────────────────────────────────────────── */
console.log(`\n${"═".repeat(64)}`);
if (problemas === 0 && avisos === 0) {
  console.log("  ✅ Nada encontrado. Sistema saudável.");
} else {
  console.log(`  ${problemas} problema(s) · ${avisos} aviso(s)`);
  if (problemas === 0) console.log("  Nenhum problema grave — os avisos são coisas a preencher ou conferir.");
}
console.log("═".repeat(64) + "\n");

await client.end();
process.exitCode = problemas > 0 ? 1 : 0;
