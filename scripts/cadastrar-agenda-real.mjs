#!/usr/bin/env node
/**
 * Refaz a agenda com a composição REAL, ditada pelo dono.
 *
 * O que eu tinha cadastrado antes era invenção minha: "Agenda A5 100
 * folhas" por R$ 22,00, com custo de R$ 6,07. Não existe agenda de
 * 100 folhas na operação dele. A dele é:
 *
 *   186 folhas A5  ->  365 impressos (frente e verso)
 *   + 2 papelão cinza Horlle 1,9 mm   (capa dura)
 *   + 4 folhas adesivo Jojo 135g      (revestimento da capa)
 *   + wire-o 250 folhas
 *   + laminação brilho
 *
 * Custo real: R$ 21,18. Três vezes e meia o que eu tinha estimado.
 * Vender a R$ 22,00 seria trabalhar de graça.
 *
 * Este script cria os dois insumos que faltavam no estoque (papelão e
 * wire-o), corrige a agenda e apaga os cadernos A5 inventados.
 *
 * Simula por padrão.  node scripts/cadastrar-agenda-real.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

/* Preço de venda decidido: x3 sobre o custo + montagem, arredondado
   para múltiplo de R$ 5. Agenda de capa dura dá trabalho de verdade —
   dobrar, alcear, colar a capa, laminar, furar e montar o wire-o. */
const PRECO = 75.0;

const CLIQUE_PB = 0.0187;
const CLIQUE_COR = 0.0607;

/* Insumos novos. Preços de mercado consultados em 23/08/2026 —
   marcados como ESTIMADOS até o dono confirmar o que paga. */
const INSUMOS = [
  {
    sku: "PAPELAO-A5-19",
    name: "Papelão Cinza Horlle 1,9mm A5 (capa dura)",
    unit: "unidade",
    packName: "Pacote com 100",
    packQuantity: 100,
    packCost: 74.99,
    minStock: 50,
    subcat: "Encadernação",
    notes:
      "⚠️ Preço ESTIMADO (mercado, 23/08/2026): R$ 74,99 o pacote com 100 placas A5. " +
      "Confirmar com o fornecedor do dono.",
  },
  {
    sku: "WIREO-250",
    name: "Wire-o 2x1 1 1/8 A4 até 250 folhas",
    unit: "unidade",
    packName: null,
    packQuantity: 1,
    packCost: 4.32,
    minStock: 20,
    subcat: "Encadernação",
    notes:
      "⚠️ Preço ESTIMADO (mercado, 23/08/2026): R$ 4,32 a unidade. " +
      "Confirmar com o fornecedor do dono.",
  },
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function subcat(modulo, nome) {
  const r = await c.query(
    `select id from item_categories where module=$1 and name=$2 limit 1`,
    [modulo, nome],
  );
  return r.rows[0]?.id ?? null;
}
async function custoDe(sku) {
  const r = await c.query(`select id, unit_cost from materials where sku=$1`, [sku]);
  if (!r.rows.length) return null;
  return { id: r.rows[0].id, custo: Number(r.rows[0].unit_cost) };
}

const catMatEncad = await subcat("material", "Encadernação");
const catProdAgenda = await subcat("product", "Agendas e Cadernos");

const sulfite = await custoDe("CMX075CA4");
const jojo = await custoDe("BC-2278"); // adesivo Jojo 135g A3
if (!sulfite || !jojo) {
  console.error("❌ Faltam materiais base (sulfite ou adesivo Jojo 135g).");
  await c.end();
  process.exit(1);
}

/* ---------- a conta ---------- */
const folhasA4 = 186 / 2; // folha A4 dobrada vira 2 folhas A5
const LAMINACAO = 0.35; // por folha, do acabamento já cadastrado

const parcelas = [
  ["Papel do miolo", `${folhasA4} folhas A4 sulfite 75g`, folhasA4 * sulfite.custo],
  ["Impressão do miolo", "365 impressos P&B", 365 * CLIQUE_PB],
  ["Adesivo da capa", "4 folhas Jojo 135g A3", 4 * jojo.custo],
  ["Impressão da capa", "4 folhas coloridas", 4 * CLIQUE_COR],
  ["Papelão cinza", "2 placas 1,9mm", 2 * (74.99 / 100)],
  ["Laminação brilho", "4 folhas", 4 * LAMINACAO],
  ["Wire-o", "1 unidade, 250 folhas", 4.32],
];
const CUSTO = parcelas.reduce((s, [, , v]) => s + v, 0);

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log("AGENDA A5 186 FOLHAS — composição do dono\n");
  for (const [nome, detalhe, valor] of parcelas) {
    console.log(`   ${nome.padEnd(20)} ${detalhe.padEnd(28)} R$ ${valor.toFixed(2).padStart(6)}`);
  }
  console.log(`   ${"".padEnd(49)} ---------`);
  console.log(`   ${"CUSTO".padEnd(49)} R$ ${CUSTO.toFixed(2).padStart(6)}`);
  console.log(`   ${"VENDA".padEnd(49)} R$ ${PRECO.toFixed(2).padStart(6)}`);
  console.log(
    `   ${"".padEnd(49)} margem ${(((PRECO - CUSTO) / PRECO) * 100).toFixed(0)}%  ` +
      `lucro R$ ${(PRECO - CUSTO).toFixed(2)}`,
  );
  console.log("\nInsumos a criar no estoque:");
  for (const i of INSUMOS) {
    const un = i.packQuantity > 1 ? i.packCost / i.packQuantity : i.packCost;
    console.log(`   ${i.sku.padEnd(15)} R$ ${un.toFixed(4)}/un   ${i.name}`);
  }
  console.log("\nA apagar (invenção minha, não existe na operação):");
  console.log("   CAD-A5-50, CAD-A5-100, AGE-A5-100");
  console.log("\nPara aplicar: node scripts/cadastrar-agenda-real.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  /* 1. insumos que faltavam */
  for (const i of INSUMOS) {
    const unitCost = i.packQuantity > 1 ? i.packCost / i.packQuantity : i.packCost;
    const ja = await c.query(`select id from materials where sku=$1`, [i.sku]);
    if (ja.rows.length) {
      await c.query(
        `update materials set name=$2, category_id=$3, unit=$4, unit_cost=$5,
           pack_name=$6, pack_quantity=$7, pack_cost=$8, min_stock=$9, notes=$10
         where id=$1`,
        [ja.rows[0].id, i.name, catMatEncad, i.unit, unitCost, i.packName,
         i.packQuantity, i.packCost, i.minStock, i.notes],
      );
    } else {
      await c.query(
        `insert into materials (name, sku, category_id, unit, unit_cost, pack_name,
           pack_quantity, pack_cost, stock, min_stock, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10)`,
        [i.name, i.sku, catMatEncad, i.unit, unitCost, i.packName,
         i.packQuantity, i.packCost, i.minStock, i.notes],
      );
    }
  }
  console.log(`Insumos no estoque: ${INSUMOS.length}`);

  /* 2. some com os cadernos que eu inventei */
  const apagados = await c.query(
    `delete from products where sku in ('CAD-A5-50','CAD-A5-100','AGE-A5-100')`,
  );
  console.log(`Produtos inventados removidos: ${apagados.rowCount}`);

  /* 3. a agenda de verdade */
  const descricao =
    "Agenda A5 capa dura personalizada. Miolo de 186 folhas (365 páginas impressas " +
    "frente e verso) em sulfite 75g. Capa dura em papelão cinza Horlle 1,9mm revestido " +
    "com adesivo fotográfico Jojo 135g impresso em cores e laminado brilho. " +
    "Encadernação wire-o. Arte personalizada do cliente.";

  const ja = await c.query(`select id from products where sku='AGE-A5-186'`);
  if (ja.rows.length) {
    await c.query(
      `update products set name=$2, description=$3, product_category_id=$4,
         cost_snapshot=$5, sell_price=$6, final_price=$6, active=true
       where id=$1`,
      [ja.rows[0].id, "Agenda A5 capa dura 186 folhas", descricao,
       CUSTO.toFixed(4), PRECO.toFixed(4)],
    );
    console.log("Agenda atualizada");
  } else {
    await c.query(
      `insert into products
         (name, sku, description, product_category_id, printer_id, printer_category_id,
          base_material_id, cost_snapshot, sell_price, final_price,
          calculation_mode, pieces_per_sheet, base_material_qty, min_order_qty,
          default_quantity, print_sides, waste_percent, setup_sheets, margin,
          active, track_stock, lead_time_creation, lead_time_production,
          lead_time_finishing, lead_time_serial, pages_per_unit, copies)
       values ($1,'AGE-A5-186',$2,$3,10,6,$4,$5,$6,$6,
               'unit',1,1,1,1,2,0,0,0.4,true,false,1,3,1,false,186,1)`,
      [
        "Agenda A5 capa dura 186 folhas",
        descricao,
        catProdAgenda,
        sulfite.id,
        CUSTO.toFixed(4),
        PRECO.toFixed(4),
      ],
    );
    console.log("Agenda criada");
  }

  await c.query("commit");

  const fim = await c.query(
    `select sku, name, cost_snapshot, final_price from products
      where sku like 'AGE-%' or sku like 'CAD-%' order by sku`,
  );
  console.log("\n✅ Agendas e cadernos no sistema:");
  for (const r of fim.rows) {
    const cst = Number(r.cost_snapshot);
    const pv = Number(r.final_price);
    console.log(
      `   ${r.sku.padEnd(12)} custo R$ ${cst.toFixed(2).padStart(6)}  ` +
        `venda R$ ${pv.toFixed(2).padStart(6)}  margem ${(((pv - cst) / pv) * 100).toFixed(0)}%`,
    );
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
