#!/usr/bin/env node
/**
 * Corrige o preço da agenda e cadastra as faixas por quantidade.
 *
 * Duas coisas mudaram depois que o dono falou:
 *
 * 1. O PREÇO. Eu tinha posto R$ 75,00 (custo x3). Ele vende a
 *    R$ 46,90. Não estava errado: R$ 46,90 dá 55% de margem, que é
 *    saudável. O errado era o meu — multiplicar por 3 funciona em
 *    item de custo baixo, não num produto de R$ 21 de matéria-prima.
 *    Quem manda é o preço que o mercado dele paga.
 *
 * 2. AS FAIXAS. Ele vende de 1 a 100 unidades. Sem faixa, o cliente
 *    que leva 100 paga o mesmo que quem leva 1, e o pedido grande vai
 *    embora.
 *
 * O custo cai um pouco no volume: o wire-o avulso custa R$ 4,32 e em
 * caixa de 25 sai por R$ 3,96. A partir de 20 unidades a conta usa o
 * custo de caixa fechada — por isso a margem cai menos do que o
 * desconto sugere.
 *
 * Simula por padrão.  node scripts/faixas-agenda.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

const SKU = "AGE-A5-186";
const PRECO_BASE = 46.9; // o que o dono pratica hoje

const CUSTO_AVULSO = 21.18;
const CUSTO_LOTE = 20.82; // wire-o em caixa de 25

/** [a partir de, preço unitário] */
const FAIXAS = [
  [1, 46.9],
  [10, 42.9],
  [20, 39.9],
  [30, 37.9],
  [40, 35.9],
  [50, 34.9],
  [100, 32.9],
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const prod = await c.query(`select id, name from products where sku=$1`, [SKU]);
if (!prod.rows.length) {
  console.error(`❌ Produto ${SKU} não existe. Rode antes o cadastrar-agenda-real.mjs`);
  await c.end();
  process.exit(1);
}
const { id, name } = prod.rows[0];

const custoDe = (q) => (q >= 20 ? CUSTO_LOTE : CUSTO_AVULSO);

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log(`${name}\n`);
  console.log(
    `${"a partir".padStart(9)} | ${"R$/un".padStart(7)} | ${"desc".padStart(5)} | ` +
      `${"custo".padStart(6)} | ${"margem".padStart(6)} | ${"lucro no lote".padStart(13)}`,
  );
  console.log("-".repeat(72));
  for (const [q, pv] of FAIXAS) {
    const cu = custoDe(q);
    const desc = (1 - pv / PRECO_BASE) * 100;
    const m = ((pv - cu) / pv) * 100;
    console.log(
      `${String(q).padStart(6)} un | ${pv.toFixed(2).padStart(7)} | ${desc.toFixed(0).padStart(4)}% | ` +
        `${cu.toFixed(2).padStart(6)} | ${m.toFixed(0).padStart(5)}% | ${((pv - cu) * q).toFixed(2).padStart(13)}`,
    );
  }
  console.log(`\nPreço base muda de R$ 75,00 para R$ ${PRECO_BASE.toFixed(2)}`);
  console.log("\nPara aplicar: node scripts/faixas-agenda.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  await c.query(
    `update products set sell_price=$2, final_price=$2 where id=$1`,
    [id, PRECO_BASE.toFixed(4)],
  );

  await c.query(`delete from product_price_tiers where product_id=$1`, [id]);
  for (const [q, pv] of FAIXAS) {
    await c.query(
      `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
       values ($1,$2,$3,$4)`,
      [id, q, pv, q === 1 ? "unidade" : `a partir de ${q}`],
    );
  }
  await c.query("commit");

  const fim = await c.query(
    `select min_quantity, unit_price from product_price_tiers
      where product_id=$1 order by min_quantity`,
    [id],
  );
  console.log(`✅ ${name}\n`);
  for (const r of fim.rows) {
    const q = Number(r.min_quantity);
    const pv = Number(r.unit_price);
    const m = ((pv - custoDe(q)) / pv) * 100;
    console.log(
      `   a partir de ${String(q).padStart(3)} un   R$ ${pv.toFixed(2).padStart(6)}   margem ${m.toFixed(0)}%`,
    );
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
