#!/usr/bin/env node
/**
 * Cadastra a RECEITA da agenda: insumos e acabamentos, item a item.
 *
 * O dono abriu a tela de editar produto e viu a calculadora mostrando
 * só R$ 14,65 de custo — impressão e uma folha de sulfite. Faltava
 * tudo o mais: papelão, adesivo, wire-o, laminação.
 *
 * O motivo: eu gravei o custo como um NÚMERO FIXO em cost_snapshot
 * (R$ 21,18, que eu tinha calculado na mão) sem cadastrar as linhas
 * em product_materials e product_finishings. Para o sistema, a agenda
 * era feita de uma folha de papel.
 *
 * Consequência prática: a calculadora ao vivo mentia, o estoque não
 * baixaria os insumos na venda, e se o preço do wire-o subisse nada
 * avisaria.
 *
 * Agora a composição fica declarada. O custo passa a ser CALCULADO,
 * não digitado.
 *
 * Simula por padrão.  node scripts/receita-agenda.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const SKU = "AGE-A5-186";

/**
 * Insumos por unidade vendida (uma agenda).
 *
 * O papel do miolo NÃO entra aqui: ele é o material base do produto e
 * o motor já cobra `páginas por unidade` × custo da folha. Repetir
 * seria cobrar duas vezes.
 */
const INSUMOS = [
  ["PAPELAO-A5-19", 2, "capa dura: frente e verso"],
  ["BC-2278", 4, "revestimento da capa, adesivo Jojo 135g A3"],
  ["WIREO-250", 1, "espiral wire-o"],
];

/**
 * Acabamentos. `per_piece` = por agenda; a quantidade é quantas
 * unidades do acabamento cada agenda consome.
 */
const ACABAMENTOS = [["Laminação Brilho", 4, "per_piece", "4 folhas laminadas por agenda"]];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const prod = await c.query(
  `select id, name, pages_per_unit, base_material_id, cost_snapshot
     from products where sku=$1`,
  [SKU],
);
if (!prod.rows.length) {
  console.error(`❌ Produto ${SKU} não existe.`);
  await c.end();
  process.exit(1);
}
const p = prod.rows[0];

/* resolve os ids e custos */
const mats = [];
for (const [sku, qtd, nota] of INSUMOS) {
  const r = await c.query(`select id, name, unit_cost, unit from materials where sku=$1`, [sku]);
  if (!r.rows.length) {
    console.error(`❌ Material ${sku} não existe no estoque.`);
    await c.end();
    process.exit(1);
  }
  mats.push({ ...r.rows[0], qtd, nota, custo: Number(r.rows[0].unit_cost) * qtd });
}

const acabs = [];
for (const [nome, qtd, modo, nota] of ACABAMENTOS) {
  const r = await c.query(
    `select id, name, unit_cost from finishing_items where name=$1 and archived_at is null`,
    [nome],
  );
  if (!r.rows.length) {
    console.error(`❌ Acabamento "${nome}" não existe.`);
    await c.end();
    process.exit(1);
  }
  acabs.push({ ...r.rows[0], qtd, modo, nota, custo: Number(r.rows[0].unit_cost) * qtd });
}

/* papel do miolo, que o motor calcula sozinho */
const base = await c.query(`select name, unit_cost from materials where id=$1`, [
  p.base_material_id,
]);
const folhas = Number(p.pages_per_unit) / 2; // A4 dobrada = 2 páginas A5
const custoMiolo = folhas * Number(base.rows[0].unit_cost);
const CLIQUE_PB = 0.0187;
const custoClique = Number(p.pages_per_unit) * 2 * CLIQUE_PB; // frente e verso

const totalInsumos = mats.reduce((s, m) => s + m.custo, 0);
const totalAcab = acabs.reduce((s, a) => s + a.custo, 0);
const TOTAL = custoMiolo + custoClique + totalInsumos + totalAcab;

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log(`${p.name}\n`);
  console.log("O QUE O MOTOR JÁ CALCULA SOZINHO");
  console.log(`   miolo: ${folhas} folhas × R$ ${Number(base.rows[0].unit_cost).toFixed(4)}   R$ ${custoMiolo.toFixed(2).padStart(6)}`);
  console.log(`   impressão: ${p.pages_per_unit} pg frente e verso        R$ ${custoClique.toFixed(2).padStart(6)}`);
  console.log("\nINSUMOS A CADASTRAR (por agenda)");
  for (const m of mats) {
    console.log(
      `   ${String(m.qtd).padStart(2)} × ${m.name.slice(0, 42).padEnd(44)} R$ ${m.custo.toFixed(2).padStart(6)}`,
    );
  }
  console.log("\nACABAMENTOS A CADASTRAR");
  for (const a of acabs) {
    console.log(
      `   ${String(a.qtd).padStart(2)} × ${a.name.slice(0, 42).padEnd(44)} R$ ${a.custo.toFixed(2).padStart(6)}`,
    );
  }
  console.log(`\n   ${"CUSTO TOTAL CALCULADO".padEnd(49)} R$ ${TOTAL.toFixed(2).padStart(6)}`);
  console.log(`   ${"(o que estava gravado à mão)".padEnd(49)} R$ ${Number(p.cost_snapshot).toFixed(2).padStart(6)}`);
  console.log("\nPara aplicar: node scripts/receita-agenda.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  await c.query(`delete from product_materials where product_id=$1`, [p.id]);
  for (const m of mats) {
    await c.query(
      `insert into product_materials (product_id, material_id, quantity) values ($1,$2,$3)`,
      [p.id, m.id, m.qtd],
    );
  }
  console.log(`Insumos cadastrados: ${mats.length}`);

  await c.query(`delete from product_finishings where product_id=$1`, [p.id]);
  for (const a of acabs) {
    await c.query(
      `insert into product_finishings (product_id, finishing_id, quantity, charge_mode, batch_size)
       values ($1,$2,$3,$4,1)`,
      [p.id, a.id, a.qtd, a.modo],
    );
  }
  console.log(`Acabamentos cadastrados: ${acabs.length}`);

  await c.query(`update products set cost_snapshot=$2 where id=$1`, [p.id, TOTAL.toFixed(4)]);
  await c.query("commit");

  console.log(`\n✅ Custo agora é calculado: R$ ${TOTAL.toFixed(2)}`);
  const pv = 46.9;
  console.log(`   venda R$ ${pv.toFixed(2)}   margem ${(((pv - TOTAL) / pv) * 100).toFixed(0)}%`);
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
