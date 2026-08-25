#!/usr/bin/env node
/**
 * Panfletos e cartões de visita, com o aproveitamento CALCULADO.
 *
 * Primeiro uso da biblioteca src/lib/aproveitamento.ts: em vez de
 * digitar "4 por folha", a conta é feita a partir do tamanho da peça e
 * conferida contra o que o dono informou.
 *
 * PANFLETO 14x10 em A4 couché 115g
 *   Calculado: 4 por folha, grade 2x2 girada, 90% de aproveitamento.
 *   Bate exatamente com o que ele disse. Corte na guilhotina.
 *
 * CARTÃO DE VISITA em A4 couché 250g
 *   O dono falou "9x6 cm, cabe 10". Geometricamente 9x6 não dá 10 numa
 *   A4 — dá 9, e nem com margem zero chega a 10. Com 9x5, que é o
 *   padrão brasileiro, dão 10 exatos numa grade 2x5.
 *   Cadastrado como 9x5 e 10 por folha, que é o que a conta fecha.
 *   Recorte na Silhouette, sem laminação (é laser).
 *
 * Simula por padrão.  node scripts/cadastrar-panfletos-cartoes.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

const KONICA = 10;
const KONICA_CAT = 6;
const FMT_A4_CHAPADO = 23;

/* Aproveitamento calculado — grade regular, que é a que se refila. */
const PANFLETO = { larguraMm: 140, alturaMm: 100, porFolha: 4 };
const CARTAO = { larguraMm: 90, alturaMm: 50, porFolha: 10 };

const PRODUTOS = [
  {
    sku: "PANF-14X10",
    name: "Panfleto 14x10 cm",
    papelSku: "COUCH-115-A4",
    porFolha: PANFLETO.porFolha,
    acabamento: "Corte na Guilhotina", // por peça
    servico: null,
    faixas: [
      [50, 34.9],
      [100, 49.9],
      [200, 79.9],
    ],
    descricao:
      "Panfleto 14 x 10 cm em papel couché brilho 115g, colorido frente. " +
      "Impressão Konica e corte na guilhotina. Cabem 4 por folha A4.",
  },
  {
    sku: "CART-9X5",
    name: "Cartão de visita 9x5 cm",
    papelSku: "COUCH-250-A4",
    porFolha: CARTAO.porFolha,
    acabamento: null,
    servico: 13, // recorte de contorno na Silhouette, por folha
    faixas: [
      [50, 34.9],
      [100, 49.9],
      [200, 79.9],
    ],
    descricao:
      "Cartão de visita 9 x 5 cm em papel couché brilho 250g, colorido frente. " +
      "Impressão Konica e recorte na Silhouette. Cabem 10 por folha A4. " +
      "Sem laminação — impressão laser já sai protegida.",
  },
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const catProd = (
  await c.query(
    `select id from item_categories where module='product' and name='Cartões e Panfletos' limit 1`,
  )
).rows[0]?.id;
if (!catProd) {
  console.error('❌ Subcategoria "Cartões e Panfletos" não encontrada.');
  await c.end();
  process.exit(1);
}

/* custo do clique A4 chapado colorido */
const catK = (await c.query(`select * from printer_categories where id=$1`, [KONICA_CAT])).rows[0];
const consK = (await c.query(`select * from printer_consumables where category_id=$1`, [KONICA_CAT])).rows;
const fmtK = (await c.query(`select * from print_formats where id=$1`, [FMT_A4_CHAPADO])).rows[0];
const rende = (x) => (Number(x.yield_pages) > 0 ? Number(x.unit_cost) / Number(x.yield_pages) : 0);
const aplica = consK.filter((x) => x.applies_to === "color" || x.applies_to === "both");
const baseCov = Math.max(Number(catK.reference_coverage) || 0.05, 0.0001);
const corante = aplica.filter((x) => (x.cost_role || "colorant") === "colorant").reduce((s, x) => s + rende(x), 0);
const mec = aplica.filter((x) => (x.cost_role || "colorant") !== "colorant").reduce((s, x) => s + rende(x), 0);
const CLIQUE_A4 =
  (corante * (Number(fmtK.ink_coverage) / baseCov) + mec + Number(catK.fixed_cost_per_page || 0)) *
  Number(fmtK.area_factor) *
  (1 + Number(catK.waste_factor || 0));

/* monta o plano */
const plano = [];
for (const p of PRODUTOS) {
  const papel = (await c.query(`select id, unit_cost from materials where sku=$1`, [p.papelSku])).rows[0];
  const acab = p.acabamento
    ? (await c.query(`select id, unit_cost from finishing_items where name=$1 and archived_at is null`, [p.acabamento])).rows[0]
    : null;
  const svc = p.servico
    ? (await c.query(`select id, base_cost from services where id=$1`, [p.servico])).rows[0]
    : null;

  /* custo por PEÇA: a folha se divide entre as peças que ela rende */
  const porFolha = Number(papel.unit_cost) + CLIQUE_A4 + Number(svc?.base_cost || 0);
  const custoPeca = porFolha / p.porFolha + Number(acab?.unit_cost || 0);

  plano.push({ ...p, papelId: papel.id, acabId: acab?.id ?? null, svcId: svc?.id ?? null,
               custoFolha: porFolha, custo: custoPeca });
}

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  for (const p of plano) {
    console.log(`${p.sku}  ${p.name}`);
    console.log(`   ${p.porFolha} por folha A4  ·  folha custa R$ ${p.custoFolha.toFixed(4)}`);
    console.log(`   custo por peça R$ ${p.custo.toFixed(4)}`);
    for (const [q, v] of p.faixas) {
      const custoLote = p.custo * q;
      const m = ((v - custoLote) / v) * 100;
      console.log(
        `      ${String(q).padStart(3)} un por R$ ${v.toFixed(2).padStart(6)}   ` +
          `custo R$ ${custoLote.toFixed(2).padStart(6)}   margem ${m.toFixed(0).padStart(3)}%   lucro R$ ${(v - custoLote).toFixed(2)}`,
      );
    }
    console.log();
  }
  console.log("Para aplicar: node scripts/cadastrar-panfletos-cartoes.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  for (const p of plano) {
    const precoUnit = p.faixas[0][1] / p.faixas[0][0];
    const campos = [p.name, p.descricao, catProd, KONICA, KONICA_CAT, FMT_A4_CHAPADO,
                    p.papelId, p.custo.toFixed(4), precoUnit.toFixed(4), p.svcId,
                    (1 / p.porFolha).toFixed(4)];
    const ja = await c.query(`select id from products where sku=$1`, [p.sku]);
    let id;
    if (ja.rows.length) {
      id = ja.rows[0].id;
      await c.query(
        `update products set name=$2, description=$3, product_category_id=$4, printer_id=$5,
           printer_category_id=$6, print_format_id=$7, color_mode='color', base_material_id=$8,
           cost_snapshot=$9, sell_price=$10, final_price=$10, base_service_id=$11,
           base_material_qty=$12, calculation_mode='unit', pieces_per_sheet=$13,
           pages_per_unit=1, print_sides=1, min_order_qty=$14, default_quantity=$14,
           active=true, track_stock=false where id=$1`,
        [id, ...campos, p.porFolha, p.faixas[0][0]],
      );
    } else {
      id = (
        await c.query(
          `insert into products (name, description, product_category_id, printer_id,
             printer_category_id, print_format_id, color_mode, base_material_id, cost_snapshot,
             sell_price, final_price, base_service_id, base_material_qty, sku, pieces_per_sheet,
             min_order_qty, default_quantity, calculation_mode, pages_per_unit, print_sides,
             waste_percent, setup_sheets, margin, active, track_stock, lead_time_creation,
             lead_time_production, lead_time_finishing, lead_time_serial, copies)
           values ($1,$2,$3,$4,$5,$6,'color',$7,$8,$9,$9,$10,$11,$12,$13,$14,$14,
                   'unit',1,1,0.05,0,0.4,true,false,0,2,1,false,1) returning id`,
          [...campos, p.sku, p.porFolha, p.faixas[0][0]],
        )
      ).rows[0].id;
    }

    /* acabamento por peça, quando houver */
    await c.query(`delete from product_finishings where product_id=$1`, [id]);
    if (p.acabId) {
      await c.query(
        `insert into product_finishings (product_id, finishing_id, quantity, charge_mode, batch_size)
         values ($1,$2,1,'per_piece',1)`,
        [id, p.acabId],
      );
    }

    /* faixas: o preço é do LOTE, então divide pela quantidade */
    await c.query(`delete from product_price_tiers where product_id=$1`, [id]);
    for (const [q, v] of p.faixas) {
      await c.query(
        `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
         values ($1,$2,$3,$4)`,
        [id, q, (v / q).toFixed(4), `${q} unidades · R$ ${v.toFixed(2).replace(".", ",")}`],
      );
    }
    console.log(`${p.sku}: ${p.porFolha} por folha, custo R$ ${p.custo.toFixed(4)}/peça`);
  }
  await c.query("commit");

  const fim = await c.query(
    `select p.sku, p.pieces_per_sheet, p.cost_snapshot,
            (select string_agg(t.label, ' · ' order by t.min_quantity)
               from product_price_tiers t where t.product_id=p.id) faixas
       from products p where p.sku in ('PANF-14X10','CART-9X5') order by p.sku`,
  );
  console.log("\n✅ Cadastrado:");
  for (const r of fim.rows) {
    console.log(`   ${r.sku.padEnd(12)} ${Number(r.pieces_per_sheet)} por folha   ${r.faixas}`);
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
