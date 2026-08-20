#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Auditoria: Cobranças (InfinitePay) · Envios (SuperFrete)

     node scripts/auditar-cobrancas-envios.mjs

   Os dois últimos módulos sem auditoria. Aqui o risco é dinheiro:
   taxa errada tira do lucro em silêncio, e frete errado é prejuízo
   por pedido. Nenhum dos dois grita — só aparece no fim do mês.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

let ok = 0, prob = 0, avisos = 0;
const T = (c, d) => { console.log(`  ${c ? "✔" : "✖"} ${d}`); c ? ok++ : prob++; };
const A = (d) => { console.log(`  ⚠ ${d}`); avisos++; };
const q = async (s, p = []) => (await pool.query(s, p)).rows;
const num = (v, f = 0) => { const n = Number(v); return Number.isFinite(n) ? n : f; };

try {
  const linhas = await q(`SELECT key, coalesce(value,'') v FROM settings`);
  const cfg = new Map(linhas.map((r) => [r.key, r.v]));

  /* ══════════════ COBRANÇAS ══════════════ */
  console.log("\n═══ COBRANÇAS · InfinitePay ═══");

  const pedidos = await q(
    `SELECT id, total, deposit_amount, balance_amount, financial_status
       FROM orders WHERE status <> 'cancelado'`
  );
  console.log(`  (${pedidos.length} pedido(s) ativos)`);

  /* A conta que não pode falhar: entrada + saldo = total. Se sobrar
     centavo, alguém cobra a mais ou a menos. */
  const somaErrada = pedidos.filter((p) => {
    const t = num(p.total), d = num(p.deposit_amount), b = num(p.balance_amount);
    if (d === 0 && b === 0) return false;      // ainda não dividido
    return Math.abs(d + b - t) > 0.02;
  });
  T(somaErrada.length === 0, "entrada + saldo fecha com o total em todo pedido");
  if (somaErrada.length) {
    for (const p of somaErrada.slice(0, 3)) {
      console.log(`     pedido ${p.id}: ${p.deposit_amount} + ${p.balance_amount} ≠ ${p.total}`);
    }
  }

  const negativos = pedidos.filter(
    (p) => num(p.deposit_amount) < 0 || num(p.balance_amount) < 0
  );
  T(negativos.length === 0, "nenhuma entrada ou saldo negativo");

  /* Pago mas com saldo em aberto (ou o contrário) é inconsistência
     que aparece como cobrança indevida. */
  const pagoComSaldo = pedidos.filter(
    (p) => p.financial_status === "pago" && num(p.balance_amount) > 0.02
  );
  T(pagoComSaldo.length === 0, "nenhum pedido 'pago' com saldo em aberto");
  if (pagoComSaldo.length) {
    console.log(`     ex.: pedido ${pagoComSaldo[0].id} saldo ${pagoComSaldo[0].balance_amount}`);
  }

  console.log("\n  — taxas —");

  /* As taxas do Painel vs. as reais da InfinitePay. Não reprovo se
     divergirem (o dono pode ter negociado outra), mas aviso: taxa
     subestimada come a margem sem aparecer em lugar nenhum. */
  const REAIS = { pix: 0, credit: 0.0315, installment: 0.124 };
  const taxas = {
    pix: num(cfg.get("infinitepay_fee_pix"), 0),
    credit: num(cfg.get("infinitepay_fee_credit"), 0),
    installment: num(cfg.get("infinitepay_fee_installment"), 0),
  };
  for (const [k, v] of Object.entries(taxas)) {
    /* Aceita tanto 3.15 quanto 0.0315 — o Painel guarda em %. */
    const frac = v > 1 ? v / 100 : v;
    const real = REAIS[k];
    const rotulo = { pix: "PIX", credit: "crédito à vista", installment: "parcelado 12x" }[k];
    if (k === "pix") {
      T(frac === 0, `taxa de ${rotulo}: ${(frac * 100).toFixed(2)}% (InfinitePay não cobra)`);
    } else if (frac === 0) {
      A(`taxa de ${rotulo} está ZERADA — o custo do cartão não entra no preço`);
    } else if (frac < real - 0.005) {
      A(`taxa de ${rotulo}: ${(frac * 100).toFixed(2)}% — abaixo da real (${(real * 100).toFixed(2)}%)`);
    } else {
      T(true, `taxa de ${rotulo}: ${(frac * 100).toFixed(2)}%`);
    }
  }

  const modo = cfg.get("infinitepay_fee_mode") || "absorve";
  T(["absorve", "repassa"].includes(modo), `modo da taxa: ${modo}`);

  /* Sem handle não existe link de pagamento. */
  const handle = String(cfg.get("infinitepay_handle") || "").trim();
  if (!handle) A("sem handle da InfinitePay — os links de pagamento não funcionam");
  else T(true, `handle configurado: ${handle}`);

  /* ══════════════ ENVIOS ══════════════ */
  console.log("\n═══ ENVIOS · SuperFrete ═══");

  const token = String(cfg.get("superfrete_token") || "").trim();
  const sandbox = String(cfg.get("superfrete_sandbox") || "") === "true";
  if (!token) A("sem token da SuperFrete — a cotação de frete não funciona");
  else T(true, `token presente (${token.length} chars) · ambiente: ${sandbox ? "TESTE" : "produção"}`);

  if (token && !sandbox) {
    A("ambiente de PRODUÇÃO: cada etiqueta gerada é cobrada de verdade");
  }

  /* Pacote padrão: se vier zerado, a cotação sai errada para menos e
     a diferença aparece só na hora de postar. */
  const pkg = {
    peso: num(cfg.get("superfrete_pkg_weight"), 0),
    altura: num(cfg.get("superfrete_pkg_height"), 0),
    largura: num(cfg.get("superfrete_pkg_width"), 0),
    comprimento: num(cfg.get("superfrete_pkg_length"), 0),
  };
  const zerado = Object.entries(pkg).filter(([, v]) => v <= 0).map(([k]) => k);
  T(zerado.length === 0, `pacote padrão: ${pkg.peso}kg · ${pkg.altura}×${pkg.largura}×${pkg.comprimento}cm`);
  if (zerado.length) console.log(`     zerado(s): ${zerado.join(", ")}`);

  /* Mínimos dos Correios. Abaixo disso a API recusa ou arredonda por
     conta própria, e o valor cotado não bate com o cobrado. */
  const MIN = { altura: 2, largura: 11, comprimento: 16 };
  const abaixo = Object.entries(MIN).filter(([k, m]) => pkg[k] > 0 && pkg[k] < m);
  T(abaixo.length === 0, "pacote padrão respeita os mínimos dos Correios");
  if (abaixo.length) {
    for (const [k, m] of abaixo) console.log(`     ${k}: ${pkg[k]}cm (mínimo ${m}cm)`);
  }

  /* Origem: sem CEP da empresa não há como cotar. */
  const cepOrigem = String(cfg.get("company_cep") || "").replace(/\D/g, "");
  T(cepOrigem.length === 8, `CEP de origem: ${cepOrigem || "(vazio)"}`);

  /* Produtos volumosos sem dimensão caem no pacote padrão — e é aí
     que o frete sai barato demais. */
  const semDim = await q(`
    SELECT count(*)::int n FROM products
     WHERE active = true
       AND (coalesce(ship_weight,0) = 0 OR coalesce(ship_length,0) = 0)`);
  const total = await q(`SELECT count(*)::int n FROM products WHERE active = true`);
  if (num(semDim[0]?.n) > 0) {
    A(`${semDim[0].n} de ${total[0].n} produtos sem peso/dimensão — usam o pacote padrão`);
    console.log("     (só importa para o que você envia pelos Correios)");
  } else {
    T(true, "todo produto ativo tem peso e dimensões");
  }

  console.log("\n  — regra da casa —");
  /* Regra do dono: SuperFrete só para fora do município. Não há como
     o código impedir (nem deve — toda regra tem exceção), mas o
     operador precisa ver isso escrito na tela. */
  const r = await fetch(`${BASE}/envios`).then((x) => x.text()).catch(() => "");
  const avisaRegra = /fora do munic|outra cidade|outro estado|fora da cidade/i.test(r);
  if (avisaRegra) T(true, "a tela lembra que SuperFrete é para fora do município");
  else A("a tela não menciona a regra 'SuperFrete só para fora do município'");

  /* ══════════════ ROTAS ══════════════ */
  console.log("\n═══ As telas respondem? ═══");
  for (const rota of ["/cobrancas", "/envios", "/api/payments", "/api/shipping"]) {
    const res = await fetch(`${BASE}${rota}`).catch(() => null);
    const c = res?.status ?? 0;
    /* 400/422 é resposta válida numa rota que espera parâmetro; 500
       e 404 não são. */
    T(c === 200 || c === 400 || c === 422, `${rota} → ${c || "sem resposta"}`);
  }
} catch (e) {
  console.error("\n✖ erro:", e.message);
  prob++;
} finally {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${ok} ok · ${prob} problema(s) · ${avisos} aviso(s)`);
  console.log("═".repeat(60) + "\n");
  await pool.end();
  process.exitCode = prob ? 1 : 0;
}
