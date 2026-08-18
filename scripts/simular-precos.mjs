#!/usr/bin/env node
/**
 * SIMULAÇÃO DE REPRECIFICAÇÃO — não grava nada
 *
 * Uso:  node scripts/simular-precos.mjs
 *
 * Mostra, para cada produto ativo, o preço atual e o que ele passaria a
 * custar com o motor unificado (margem + imposto + custo de pagamento no
 * mesmo divisor). Serve para conferir antes de recalcular em lote.
 *
 * O preço antigo era calculado somando as taxas por fora, o que entregava
 * menos margem do que o cadastro prometia. A diferença abaixo é o custo
 * que estava saindo do lucro.
 */
import pg from "pg";

const c = new pg.Client({
  host: process.env.PGHOST || "127.0.0.1",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
  database: process.env.PGDATABASE || "app_db",
});
await c.connect();

const { rows: cfg } = await c.query("select key, value from settings");
const map = new Map(cfg.map((r) => [r.key, r.value]));
const pct = (k, d) => {
  const v = Number(String(map.get(k) ?? "").replace(",", "."));
  return Number.isFinite(v) ? v / 100 : d;
};

const taxRate = pct("tax_rate", 0.06);
const payRate = pct("pricing_payment_cost", 0.0612);
const minMargin = pct("pricing_min_margin", 0.4);

const { rows: produtos } = await c.query(
  `select id, name, calculation_mode, margin, cost_snapshot, final_price
     from products
    where active is not false
    order by name`
);

console.log("SIMULAÇÃO DE REPRECIFICAÇÃO\n");
console.log(
  `imposto ${(taxRate * 100).toFixed(2)}% · custo de pagamento embutido ${(payRate * 100).toFixed(2)}% · piso de margem ${(minMargin * 100).toFixed(0)}%\n`
);

const money = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let semCusto = 0;
let subiu = 0;
let totalAtual = 0;
let totalNovo = 0;

console.log("produto                              custo    hoje     novo    variação");
console.log("─".repeat(78));

for (const p of produtos) {
  const custo = Number(p.cost_snapshot || 0);
  const atual = Number(p.final_price || 0);

  if (custo <= 0) {
    semCusto++;
    continue;
  }

  const margem = Math.max(Number(p.margin || 0), minMargin);
  const divisor = 1 - Math.min(margem + taxRate + payRate, 0.99);
  const novo = custo / divisor;

  const delta = atual > 0 ? ((novo - atual) / atual) * 100 : 0;
  if (novo > atual) subiu++;
  totalAtual += atual;
  totalNovo += novo;

  const nome = p.name.length > 34 ? p.name.slice(0, 33) + "…" : p.name;
  const sinal = delta >= 0 ? "+" : "";
  console.log(
    `${nome.padEnd(35)} ${money(custo).padStart(7)} ${money(atual).padStart(8)} ${money(novo).padStart(8)}  ${(sinal + delta.toFixed(1) + "%").padStart(8)}`
  );
}

console.log("─".repeat(78));
console.log(`\n${produtos.length} produtos ativos · ${subiu} teriam aumento`);
if (semCusto > 0) {
  console.log(`${semCusto} sem custo cadastrado — não dá para recalcular (revise a ficha)`);
}
if (totalAtual > 0) {
  const varTotal = ((totalNovo - totalAtual) / totalAtual) * 100;
  console.log(`variação média da tabela: ${varTotal >= 0 ? "+" : ""}${varTotal.toFixed(1)}%`);
}
console.log("\nNada foi gravado. Para aplicar, edite e salve cada produto na tela,");
console.log("ou peça o script de recálculo em lote.");

await c.end();
