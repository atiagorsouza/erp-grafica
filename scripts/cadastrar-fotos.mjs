#!/usr/bin/env node
/**
 * Cadastra a linha de fotos — tudo na Epson L18050, papel Jojo 260g.
 *
 * Composição informada pelo dono:
 *
 *   10x15     papel Jojo Super Crystal 260g A6      (1 foto por folha)
 *   20x30     papel Jojo Super Crystal Seda 260g A4 (1 foto por folha)
 *   30x40     papel Jojo Super Crystal 260g A3      (1 foto por folha)
 *   Polaroid  papel Jojo Super Crystal Seda 260g A4 (4 por folha)
 *
 * O custo de impressão vem do motor: categoria "Jato de Tinta",
 * cobertura 100% (foto é chapada, não texto), com o fator de área de
 * cada formato. Uma A3 custa o dobro de uma A4 em tinta, e a 10x15
 * custa 24% de uma A4 — é o que os formatos já cadastrados dizem.
 *
 * Âncora de preço: o dono cobra R$ 2,49 na 10x15. Os demais seguem o
 * mesmo múltiplo sobre o custo, arredondado para número de vitrine.
 *
 * POLAROID é vendida em KIT, não avulsa — ninguém pede uma polaroid
 * só, e cortar uma folha para tirar uma foto desperdiça as outras
 * três. Kit de 8 (duas folhas A4).
 *
 * Simula por padrão.  node scripts/cadastrar-fotos.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

const EPSON = 11;
const CAT_JATO = 7;

/** Formatos já cadastrados na categoria Jato de Tinta. */
const FMT_10X15 = 29; // área 0,24 · tinta 100%
const FMT_A4_FOTO = 31; // área 1,00 · tinta 100%
const FMT_A3 = 28; // área 2,00 · tinta 10% -> precisa de um irmão em 100%

const PRODUTOS = [
  {
    sku: "FOTO-10X15",
    name: "Foto 10x15",
    papel: "BA-1047",
    formato: FMT_10X15,
    porFolha: 1,
    faixas: [
      [1, 2.49],
      [10, 2.19],
      [20, 1.99],
      [50, 1.79],
      [100, 1.59],
    ],
    descricao:
      "Foto 10x15 cm em papel fotográfico Jojo RC Glossy Super Crystal 260g. " +
      "Impressão jato de tinta Epson L18050, alta resolução.",
  },
  {
    sku: "FOTO-20X30",
    name: "Foto 20x30",
    papel: "BA-1049",
    formato: FMT_A4_FOTO,
    porFolha: 1,
    faixas: [
      [1, 12.9],
      [5, 11.9],
      [10, 10.9],
      [25, 9.9],
    ],
    descricao:
      "Foto 20x30 cm em papel fotográfico Jojo RC Glossy Super Crystal Seda 260g A4. " +
      "Impressão jato de tinta Epson L18050, alta resolução.",
  },
  {
    sku: "FOTO-30X40",
    name: "Foto 30x40",
    papel: "BA-1093",
    formato: "A3_FOTO", // criado abaixo
    porFolha: 1,
    faixas: [
      [1, 24.9],
      [5, 22.9],
      [10, 20.9],
    ],
    descricao:
      "Foto 30x40 cm em papel fotográfico Jojo RC Glossy Super Crystal 260g A3. " +
      "Impressão jato de tinta Epson L18050, alta resolução.",
  },
  {
    sku: "FOTO-POLA-9",
    name: "Fotos Polaroid 5x8,5cm — kit com 9",
    papel: "BA-1049",
    formato: FMT_A4_FOTO,
    servico: 13, // recorte de contorno na Silhouette Cameo
    porFolha: 9, // grade 3 x 3 numa folha A4
    kit: 9, // uma folha rende o kit inteiro
    /* Preço POR KIT, não do lote: a faixa multiplica pela quantidade.
       2 kits a R$ 18,45 = R$ 36,90; 4 a R$ 17,45 = R$ 69,80. */
    faixas: [
      [1, 19.9],
      [2, 18.45],
      [4, 17.45],
    ],
    descricao:
      "Kit com 9 fotos estilo Polaroid, 5 x 8,5 cm cada, em papel fotográfico " +
      "Jojo RC Glossy Super Crystal Seda 260g. Impressão jato de tinta Epson L18050 " +
      "e recorte na Silhouette Cameo. As 9 fotos saem de uma única folha A4, em grade 3 x 3.",
  },
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/* ---------- referências ---------- */
const cat = (await c.query(`select * from printer_categories where id=$1`, [CAT_JATO])).rows[0];
const cons = (await c.query(`select * from printer_consumables where category_id=$1`, [CAT_JATO])).rows;

const catFoto = (
  await c.query(`select id from item_categories where module='product' and name='Fotos' limit 1`)
).rows[0]?.id;
if (!catFoto) {
  console.error('❌ Subcategoria "Fotos" não existe no módulo product.');
  await c.end();
  process.exit(1);
}

/**
 * A3 em cobertura 100% não existia: só havia "A3" com 10% de tinta,
 * que é o padrão de documento. Foto 30x40 é chapada.
 */
async function garanteA3Foto() {
  const ja = await c.query(
    `select id from print_formats where category_id=$1 and name=$2`,
    [CAT_JATO, "A3 foto borda a borda"],
  );
  if (ja.rows.length) return ja.rows[0].id;
  if (!APLICAR) return null;
  const r = await c.query(
    `insert into print_formats (category_id, name, width_mm, height_mm, area_factor, ink_coverage, is_photo)
     values ($1,'A3 foto borda a borda',297,420,2.0,1.0,true) returning id`,
    [CAT_JATO],
  );
  console.log(`Formato "A3 foto borda a borda" criado (id ${r.rows[0].id})`);
  return r.rows[0].id;
}

/** Espelha computePrintSheetCost para a categoria de jato. */
function custoImpressao(formato) {
  const aplica = cons.filter((x) => x.applies_to === "color" || x.applies_to === "both");
  const rende = (x) => (Number(x.yield_pages) > 0 ? Number(x.unit_cost) / Number(x.yield_pages) : 0);
  const baseCov = Math.max(Number(cat.reference_coverage) || 0.1, 0.0001);
  const corante = aplica
    .filter((x) => (x.cost_role || "colorant") === "colorant")
    .reduce((s, x) => s + rende(x), 0);
  const mecanico = aplica
    .filter((x) => (x.cost_role || "colorant") !== "colorant")
    .reduce((s, x) => s + rende(x), 0);
  const bruto =
    (corante * (Number(formato.ink_coverage) / baseCov) + mecanico + Number(cat.fixed_cost_per_page || 0)) *
    Number(formato.area_factor);
  return bruto * (1 + Number(cat.waste_factor || 0));
}

const idA3Foto = await garanteA3Foto();

/* monta o plano */
const plano = [];
for (const p of PRODUTOS) {
  const mat = (await c.query(`select id, name, unit_cost from materials where sku=$1`, [p.papel])).rows[0];
  if (!mat) {
    console.error(`❌ Papel ${p.papel} não existe no estoque.`);
    await c.end();
    process.exit(1);
  }
  const fmtId = p.formato === "A3_FOTO" ? idA3Foto : p.formato;
  const fmt = fmtId
    ? (await c.query(`select * from print_formats where id=$1`, [fmtId])).rows[0]
    : { area_factor: 2, ink_coverage: 1 }; // simulação antes de criar

  const impFolha = custoImpressao(fmt);
  /* Recorte na Cameo, quando o produto precisa: a polaroid sai
     picotada da folha, não inteira. Cobrado por FOLHA, não por foto. */
  const svc = p.servico
    ? Number((await c.query(`select base_cost from services where id=$1`, [p.servico])).rows[0]?.base_cost || 0)
    : 0;
  const custoFolha = impFolha + Number(mat.unit_cost) + svc;
  const folhasPorKit = p.kit ? p.kit / p.porFolha : 1;
  const custo = custoFolha * folhasPorKit;

  plano.push({ ...p, matId: mat.id, matNome: mat.name, fmtId, impFolha, custoFolha, custo });
}

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  for (const x of plano) {
    const pv = x.faixas[0][1];
    console.log(`${x.sku}  ${x.name}`);
    console.log(`   papel      ${x.matNome.slice(0, 46)}`);
    console.log(
      `   impressão  R$ ${x.impFolha.toFixed(4)}   papel R$ ${(x.custoFolha - x.impFolha).toFixed(4)}` +
        (x.kit ? `   × ${x.kit / x.porFolha} folhas` : ""),
    );
    console.log(`   CUSTO      R$ ${x.custo.toFixed(4)}`);
    for (const [q, v] of x.faixas) {
      const m = ((v - x.custo) / v) * 100;
      console.log(
        `      ${String(q).padStart(3)} un × R$ ${v.toFixed(2).padStart(6)}   margem ${m.toFixed(0).padStart(3)}%`,
      );
    }
    console.log();
  }
  console.log("Para aplicar: node scripts/cadastrar-fotos.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  let criados = 0;
  let atualizados = 0;
  for (const x of plano) {
    const precoBase = x.faixas[0][1];
    const ja = await c.query(`select id from products where sku=$1`, [x.sku]);
    let id;
    if (ja.rows.length) {
      id = ja.rows[0].id;
      await c.query(
        `update products set name=$2, description=$3, product_category_id=$4,
           printer_id=$5, printer_category_id=$6, print_format_id=$7, color_mode='color',
           base_material_id=$8, base_material_qty=$9, cost_snapshot=$10,
           base_service_id=$12,
           sell_price=$11, final_price=$11, calculation_mode='unit',
           pieces_per_sheet=1, pages_per_unit=1, print_sides=1,
           min_order_qty=1, default_quantity=1, active=true, track_stock=false
         where id=$1`,
        [id, x.name, x.descricao, catFoto, EPSON, CAT_JATO, x.fmtId, x.matId,
         (x.kit ? x.kit / x.porFolha : 1).toFixed(3), x.custo.toFixed(4), precoBase.toFixed(4),
         x.servico || null],
      );
      atualizados++;
    } else {
      const r = await c.query(
        `insert into products
           (name, sku, description, product_category_id, printer_id, printer_category_id,
            print_format_id, color_mode, base_material_id, base_material_qty,
            cost_snapshot, sell_price, final_price, base_service_id, calculation_mode, pieces_per_sheet,
            pages_per_unit, print_sides, waste_percent, setup_sheets, min_order_qty,
            default_quantity, margin, active, track_stock, lead_time_creation,
            lead_time_production, lead_time_finishing, lead_time_serial, copies)
         values ($1,$2,$3,$4,$5,$6,$7,'color',$8,$9,$10,$11,$11,$12,'unit',1,1,1,0,0,1,1,0.4,
                 true,false,0,1,0,false,1)
         returning id`,
        [x.name, x.sku, x.descricao, catFoto, EPSON, CAT_JATO, x.fmtId, x.matId,
         (x.kit ? x.kit / x.porFolha : 1).toFixed(3), x.custo.toFixed(4), precoBase.toFixed(4),
         x.servico || null],
      );
      id = r.rows[0].id;
      criados++;
    }

    await c.query(`delete from product_price_tiers where product_id=$1`, [id]);
    for (const [q, v] of x.faixas) {
      await c.query(
        `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
         values ($1,$2,$3,$4)`,
        [id, q, v, q === 1 ? (x.kit ? `1 kit (${x.kit} fotos)` : "avulsa") : `a partir de ${q}${x.kit ? " kits" : ""}`],
      );
    }
  }
  await c.query("commit");
  console.log(`✅ ${criados} criados, ${atualizados} atualizados.\n`);

  const fim = await c.query(
    `select sku, name, cost_snapshot, final_price from products
      where sku like 'FOTO-%' order by final_price`,
  );
  for (const r of fim.rows) {
    const cst = Number(r.cost_snapshot);
    const pv = Number(r.final_price);
    console.log(
      `   ${r.sku.padEnd(13)} custo R$ ${cst.toFixed(2).padStart(5)}  venda R$ ${pv.toFixed(2).padStart(6)}  margem ${(((pv - cst) / pv) * 100).toFixed(0)}%`,
    );
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
