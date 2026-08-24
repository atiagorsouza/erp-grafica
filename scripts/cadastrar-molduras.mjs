#!/usr/bin/env node
/**
 * Molduras no estoque + fotos emolduradas + faixas que faltavam.
 *
 * Três coisas que o dono pediu:
 *
 * 1. FAIXAS DE VENDA
 *    10x15 vende em 1 / 10 / 30 / 50 / 70 / 100.
 *    20x30 e 30x40 vendem em 1 e 3.
 *    Eu tinha inventado degraus que ele não pratica.
 *
 * 2. MOLDURAS NO ESTOQUE
 *    Compradas em kit na Shopee. O preço do kit não é o custo da
 *    peça: o kit de 5 porta-diploma sai a R$ 77,75, ou seja
 *    R$ 15,55 cada. Mesma armadilha da cartela de adesivo e do
 *    pacote de espiral.
 *
 * 3. FOTO COM MOLDURA
 *    Produto novo: a foto impressa já montada no quadro.
 *
 * Simula por padrão.  node scripts/cadastrar-molduras.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

/* ---------------------------------------------------------------- */
/* 1. Molduras compradas em kit                                      */
/* ---------------------------------------------------------------- */
const MOLDURAS = [
  {
    sku: "MOLD-A4-BRA",
    name: "Moldura A4 20x30 branca com vidro",
    kit: 5,
    kitPreco: 77.75,
    minStock: 5,
    nota: "Kit 5 Porta Diploma A4 20x30 branca com vidro. Shopee, compra de 09/07.",
  },
  {
    sku: "MOLD-A4-PRE",
    name: "Moldura A4 20x30 preta com vidro",
    kit: 5,
    kitPreco: 81.9,
    minStock: 5,
    nota: "Kit 5 Porta Diploma A4 20x30 preta com vidro. Shopee, compra de 09/07.",
  },
  {
    sku: "MOLD-A4-ATA",
    name: "Moldura A4 21x30 com vidro (atacado)",
    kit: 4,
    kitPreco: 56.9,
    minStock: 4,
    nota: "Kit 4 Molduras Quadros A4 21x30 vidro, atacado. Shopee, compra de 24/05. Mais barata que a Porta Diploma.",
  },
  {
    sku: "MOLD-A3-BRA",
    name: "Moldura A3 30x42 branca com vidro",
    kit: 3,
    kitPreco: 87.4,
    minStock: 3,
    nota: "Kit 3 Quadro Moldura 30x42 A3 poster, branca com vidro. Shopee.",
  },
  {
    sku: "MOLD-A3-PRE",
    name: "Moldura A3 30x42 preta com vidro",
    kit: 3,
    kitPreco: 87.4,
    minStock: 3,
    nota: "Kit 3 Quadro Moldura 30x42 A3 poster, preta com vidro. Shopee.",
  },
  {
    sku: "MOLD-A6",
    name: "Porta-retrato 10x15 com vidro",
    kit: 10,
    kitPreco: 61.9,
    minStock: 10,
    nota: "Kit 10 Porta Retratos 10x15 A6 com vidro, branco. Shopee.",
  },
];

/* ---------------------------------------------------------------- */
/* 2. Faixas que o dono realmente pratica                            */
/* ---------------------------------------------------------------- */
const FAIXAS = {
  "FOTO-10X15": [
    [1, 2.49],
    [10, 2.19],
    [30, 1.99],
    [50, 1.79],
    [70, 1.69],
    [100, 1.59],
  ],
  "FOTO-20X30": [
    [1, 12.9],
    [3, 11.9],
  ],
  "FOTO-30X40": [
    [1, 24.9],
    [3, 22.9],
  ],
};

/* ---------------------------------------------------------------- */
/* 3. Fotos emolduradas                                              */
/* ---------------------------------------------------------------- */
/* Preço: custo × 3, terminado em 9,90 — número de vitrine. A moldura
   escolhida é a mais barata de cada tamanho, para o preço de tabela
   valer em qualquer cor; a diferença entre branca e preta é de 83
   centavos e não justifica dois produtos. */
const EMOLDURADAS = [
  {
    sku: "FOTO-20X30-M",
    name: "Foto 20x30 com moldura",
    fotoSku: "FOTO-20X30",
    molduraSku: "MOLD-A4-BRA",
    preco: 59.9,
    faixas: [
      [1, 59.9],
      [3, 54.9],
    ],
    descricao:
      "Foto 20x30 cm impressa em papel Jojo Super Crystal Seda 260g, já montada " +
      "em moldura A4 com vidro. Escolha entre moldura branca ou preta.",
  },
  {
    sku: "FOTO-30X40-M",
    name: "Foto 30x40 com moldura",
    fotoSku: "FOTO-30X40",
    molduraSku: "MOLD-A3-BRA",
    preco: 99.9,
    faixas: [
      [1, 99.9],
      [3, 92.9],
    ],
    descricao:
      "Foto 30x40 cm impressa em papel Jojo Super Crystal 260g, já montada " +
      "em moldura A3 30x42 com vidro. Escolha entre moldura branca ou preta.",
  },
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const catMat = (
  await c.query(`select id from item_categories where module='material' and name='Fotos' limit 1`)
).rows[0]?.id;
const catProd = (
  await c.query(`select id from item_categories where module='product' and name='Fotos' limit 1`)
).rows[0]?.id;
if (!catMat || !catProd) {
  console.error('❌ Subcategoria "Fotos" não encontrada.');
  await c.end();
  process.exit(1);
}

/* fornecedor das molduras */
async function idFornecedor() {
  const j = await c.query(`select id from suppliers where name='Shopee'`);
  if (j.rows.length) return j.rows[0].id;
  if (!APLICAR) return null;
  const r = await c.query(
    `insert into suppliers (name, notes) values ('Shopee', 'Molduras e porta-retratos, compra avulsa.') returning id`,
  );
  return r.rows[0].id;
}

/* custo das fotos, já cadastradas */
async function custoFoto(sku) {
  const r = await c.query(`select cost_snapshot, printer_id, printer_category_id,
                                  print_format_id, base_material_id
                             from products where sku=$1`, [sku]);
  if (!r.rows.length) throw new Error(`produto ${sku} não existe`);
  return r.rows[0];
}

const plano = [];
for (const e of EMOLDURADAS) {
  const f = await custoFoto(e.fotoSku);
  const m = MOLDURAS.find((x) => x.sku === e.molduraSku);
  const custoMoldura = m.kitPreco / m.kit;
  plano.push({ ...e, foto: f, custoFoto: Number(f.cost_snapshot),
               custoMoldura, custo: Number(f.cost_snapshot) + custoMoldura, mold: m });
}

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log("1. MOLDURAS NO ESTOQUE (custo por unidade, não do kit)\n");
  for (const m of MOLDURAS) {
    console.log(
      `   ${m.sku.padEnd(13)} kit ${String(m.kit).padStart(2)} × R$ ${m.kitPreco.toFixed(2).padStart(6)}` +
        `  ->  R$ ${(m.kitPreco / m.kit).toFixed(2).padStart(6)}/un   ${m.name}`,
    );
  }
  console.log("\n2. FAIXAS CORRIGIDAS\n");
  for (const [sku, fx] of Object.entries(FAIXAS)) {
    console.log(`   ${sku}: ${fx.map(([q, v]) => `${q}un R$${v.toFixed(2)}`).join("  ")}`);
  }
  console.log("\n3. FOTOS COM MOLDURA\n");
  for (const p of plano) {
    console.log(`   ${p.sku}  ${p.name}`);
    console.log(
      `      foto R$ ${p.custoFoto.toFixed(2)} + moldura R$ ${p.custoMoldura.toFixed(2)}` +
        ` = custo R$ ${p.custo.toFixed(2)}`,
    );
    for (const [q, v] of p.faixas) {
      console.log(
        `        ${String(q).padStart(2)} un × R$ ${v.toFixed(2).padStart(6)}   margem ${(((v - p.custo) / v) * 100).toFixed(0)}%`,
      );
    }
  }
  console.log("\nPara aplicar: node scripts/cadastrar-molduras.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  const fornId = await idFornecedor();

  /* 1. molduras */
  for (const m of MOLDURAS) {
    const unit = m.kitPreco / m.kit;
    const ja = await c.query(`select id from materials where sku=$1`, [m.sku]);
    if (ja.rows.length) {
      await c.query(
        `update materials set name=$2, category_id=$3, unit='unidade', unit_cost=$4,
           pack_name=$5, pack_quantity=$6, pack_cost=$7, supplier='Shopee',
           supplier_id=$8, min_stock=$9, notes=$10 where id=$1`,
        [ja.rows[0].id, m.name, catMat, unit, `Kit com ${m.kit}`, m.kit, m.kitPreco,
         fornId, m.minStock, m.nota],
      );
    } else {
      await c.query(
        `insert into materials (name, sku, category_id, unit, unit_cost, pack_name,
           pack_quantity, pack_cost, supplier, supplier_id, stock, min_stock, notes)
         values ($1,$2,$3,'unidade',$4,$5,$6,$7,'Shopee',$8,0,$9,$10)`,
        [m.name, m.sku, catMat, unit, `Kit com ${m.kit}`, m.kit, m.kitPreco,
         fornId, m.minStock, m.nota],
      );
    }
  }
  console.log(`Molduras no estoque: ${MOLDURAS.length}`);

  /* 2. faixas das fotos soltas */
  for (const [sku, fx] of Object.entries(FAIXAS)) {
    const p = (await c.query(`select id from products where sku=$1`, [sku])).rows[0];
    if (!p) continue;
    await c.query(`delete from product_price_tiers where product_id=$1`, [p.id]);
    for (const [q, v] of fx) {
      await c.query(
        `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
         values ($1,$2,$3,$4)`,
        [p.id, q, v, q === 1 ? "avulsa" : `a partir de ${q}`],
      );
    }
    await c.query(`update products set final_price=$2, sell_price=$2 where id=$1`,
                  [p.id, fx[0][1].toFixed(4)]);
  }
  console.log(`Faixas corrigidas: ${Object.keys(FAIXAS).length} produtos`);

  /* 3. fotos com moldura */
  for (const p of plano) {
    const mold = (await c.query(`select id from materials where sku=$1`, [p.molduraSku])).rows[0];
    const ja = await c.query(`select id from products where sku=$1`, [p.sku]);
    let id;
    const campos = [
      p.name, p.descricao, catProd, p.foto.printer_id, p.foto.printer_category_id,
      p.foto.print_format_id, p.foto.base_material_id, p.custo.toFixed(4), p.preco.toFixed(4),
    ];
    if (ja.rows.length) {
      id = ja.rows[0].id;
      await c.query(
        `update products set name=$2, description=$3, product_category_id=$4,
           printer_id=$5, printer_category_id=$6, print_format_id=$7, color_mode='color',
           base_material_id=$8, base_material_qty=1, cost_snapshot=$9,
           sell_price=$10, final_price=$10, calculation_mode='unit',
           pieces_per_sheet=1, pages_per_unit=1, print_sides=1, min_order_qty=1,
           default_quantity=1, active=true, track_stock=false
         where id=$1`,
        [id, ...campos],
      );
    } else {
      const r = await c.query(
        `insert into products
           (name, description, product_category_id, printer_id, printer_category_id,
            print_format_id, color_mode, base_material_id, cost_snapshot,
            sell_price, final_price, sku, base_material_qty, calculation_mode,
            pieces_per_sheet, pages_per_unit, print_sides, waste_percent, setup_sheets,
            min_order_qty, default_quantity, margin, active, track_stock,
            lead_time_creation, lead_time_production, lead_time_finishing,
            lead_time_serial, copies)
         values ($1,$2,$3,$4,$5,$6,'color',$7,$8,$9,$9,$10,1,'unit',1,1,1,0,0,1,1,0.4,
                 true,false,0,1,1,false,1)
         returning id`,
        [...campos, p.sku],
      );
      id = r.rows[0].id;
    }

    /* a moldura entra como insumo: o estoque baixa quando vender */
    await c.query(`delete from product_materials where product_id=$1`, [id]);
    await c.query(
      `insert into product_materials (product_id, material_id, quantity) values ($1,$2,1)`,
      [id, mold.id],
    );

    await c.query(`delete from product_price_tiers where product_id=$1`, [id]);
    for (const [q, v] of p.faixas) {
      await c.query(
        `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
         values ($1,$2,$3,$4)`,
        [id, q, v, q === 1 ? "avulsa" : `a partir de ${q}`],
      );
    }
  }
  console.log(`Fotos com moldura: ${plano.length}`);

  await c.query("commit");

  const fim = await c.query(
    `select sku, name, cost_snapshot, final_price from products
      where sku like 'FOTO-%' order by final_price`,
  );
  console.log("\n✅ Linha de fotos:");
  for (const r of fim.rows) {
    const cst = Number(r.cost_snapshot);
    const pv = Number(r.final_price);
    console.log(
      `   ${r.sku.padEnd(14)} custo R$ ${cst.toFixed(2).padStart(6)}  venda R$ ${pv.toFixed(2).padStart(6)}` +
        `  margem ${(((pv - cst) / pv) * 100).toFixed(0)}%`,
    );
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
