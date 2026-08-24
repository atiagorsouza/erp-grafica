#!/usr/bin/env node
/**
 * Copos personalizados + porta-retrato 10x15.
 *
 * COPOS
 *
 * Processo informado pelo dono: transfer laser Adespan impresso na
 * Konica, aplicado sobre primer TF200. A lata do primer custa R$ 60 e
 * rende 200 copos, ou seja R$ 0,30 por copo.
 *
 * Cabem 2 copos por folha A4 de transfer: a faixa de um long drink
 * 350ml tem cerca de 22 x 9 cm, e duas delas ocupam a largura da A4.
 * Como o adesivo é chapado, a impressão usa cobertura 100%.
 *
 * De novo a armadilha do kit: o eco copo vem em caixa de 100 por
 * R$ 119,92, o que dá R$ 1,20 a unidade — e não R$ 119,92.
 *
 * Os três copos têm custo bem diferente (R$ 1,20 / R$ 1,41 / R$ 3,01),
 * então viram três produtos, não um só com variação.
 *
 * PORTA-RETRATO
 *
 * O dono confirmou que tem. A moldura A6 já está no estoque a
 * R$ 6,19, vinda do kit de 10.
 *
 * Simula por padrão.  node scripts/cadastrar-copos.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

const KONICA = 10;
const KONICA_CAT = 6;
const FMT_A4_CHAPADO = 23; // A4 100% de tinta
const COPOS_POR_FOLHA = 2;
const PRIMER_POR_COPO = 60 / 200; // lata R$ 60, rende 200

/* ---------- insumos ---------- */
const INSUMOS = [
  {
    sku: "COPO-ECO-400",
    name: "Copo Ecológico 400ml branco (sem personalização)",
    kit: 100,
    kitPreco: 119.92,
    minStock: 50,
    nota: "Kit 100 Copos Ecológicos 400ml branco. Shopee, R$ 119,92 o kit.",
  },
  {
    sku: "COPO-LD-DEG",
    name: "Copo Long Drink 350ml cristal degradê",
    kit: 15,
    kitPreco: 45.17,
    minStock: 15,
    nota: "Kit 15 Copos Long Drink 350ml cristal degradê (azul escuro / rosa neon). Shopee.",
  },
  {
    sku: "COPO-LD-LISO",
    name: "Copo Long Drink 350ml liso translúcido",
    kit: 50,
    kitPreco: 70.58,
    minStock: 25,
    nota: "Kit 50 Copos Long Drink 350ml liso translúcido. Shopee.",
  },
  {
    sku: "PRIMER-TF200",
    name: "Primer TF200 para transfer em copo (lata)",
    kit: 200, // rende 200 copos
    kitPreco: 60.0,
    minStock: 1,
    unidade: "aplicação",
    nota: "Lata de primer TF200, R$ 60,00. Rende cerca de 200 copos — R$ 0,30 por copo.",
  },
];

/* ---------- produtos ---------- */
const PRODUTOS = [
  {
    sku: "COPO-ECO-PERS",
    name: "Copo Ecológico 400ml personalizado",
    copoSku: "COPO-ECO-400",
    faixas: [
      [1, 6.9],
      [15, 5.9],
      [50, 5.4],
      [100, 4.9],
    ],
    descricao:
      "Copo ecológico 400ml branco com arte personalizada. Transfer laser Adespan " +
      "impresso na Konica e aplicado sobre primer TF200. Lavável.",
  },
  {
    sku: "COPO-LD-DEG-PERS",
    name: "Copo Long Drink 350ml degradê personalizado",
    copoSku: "COPO-LD-DEG",
    faixas: [
      [1, 11.9],
      [15, 10.9],
      [50, 9.9],
    ],
    descricao:
      "Copo long drink 350ml cristal degradê com arte personalizada. Transfer laser " +
      "Adespan impresso na Konica e aplicado sobre primer TF200. Cores: azul escuro ou rosa neon.",
  },
  {
    sku: "COPO-LD-LISO-PERS",
    name: "Copo Long Drink 350ml liso personalizado",
    copoSku: "COPO-LD-LISO",
    faixas: [
      [1, 7.9],
      [15, 6.9],
      [50, 5.9],
      [100, 5.4],
    ],
    descricao:
      "Copo long drink 350ml liso translúcido com arte personalizada. Transfer laser " +
      "Adespan impresso na Konica e aplicado sobre primer TF200.",
  },
];

/* porta-retrato: foto 10x15 já montada */
const PORTA_RETRATO = {
  sku: "FOTO-10X15-M",
  name: "Foto 10x15 com porta-retrato",
  fotoSku: "FOTO-10X15",
  molduraSku: "MOLD-A6",
  faixas: [
    [1, 19.9],
    [3, 17.9],
    [10, 15.9],
  ],
  descricao:
    "Foto 10x15 cm impressa em papel Jojo Super Crystal 260g, já montada em " +
    "porta-retrato com vidro. Pronta para presentear.",
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

async function catId(modulo, nome) {
  const r = await c.query(
    `select id from item_categories where module=$1 and name=$2 limit 1`,
    [modulo, nome],
  );
  return r.rows[0]?.id ?? null;
}
async function mat(sku) {
  const r = await c.query(`select id, unit_cost from materials where sku=$1`, [sku]);
  return r.rows[0] ? { id: r.rows[0].id, custo: Number(r.rows[0].unit_cost) } : null;
}

const catMatCopo = await catId("material", "Copos e Acrílicos");
const catProdCopo = await catId("product", "Copos e Acrílicos");
const catMatFoto = await catId("material", "Fotos");
const catProdFoto = await catId("product", "Fotos");

const transfer = await mat("CPM6-100-A4");
if (!transfer) {
  console.error("❌ Transfer Adespan (CPM6-100-A4) não está no estoque.");
  await c.end();
  process.exit(1);
}

/* impressão A4 chapada colorida, da Konica */
const catK = (await c.query(`select * from printer_categories where id=$1`, [KONICA_CAT])).rows[0];
const consK = (await c.query(`select * from printer_consumables where category_id=$1`, [KONICA_CAT])).rows;
const fmtK = (await c.query(`select * from print_formats where id=$1`, [FMT_A4_CHAPADO])).rows[0];
const rende = (x) => (Number(x.yield_pages) > 0 ? Number(x.unit_cost) / Number(x.yield_pages) : 0);
const aplicaK = consK.filter((x) => x.applies_to === "color" || x.applies_to === "both");
const baseCovK = Math.max(Number(catK.reference_coverage) || 0.05, 0.0001);
const coranteK = aplicaK.filter((x) => (x.cost_role || "colorant") === "colorant").reduce((s, x) => s + rende(x), 0);
const mecK = aplicaK.filter((x) => (x.cost_role || "colorant") !== "colorant").reduce((s, x) => s + rende(x), 0);
const cliqueA4 =
  (coranteK * (Number(fmtK.ink_coverage) / baseCovK) + mecK + Number(catK.fixed_cost_per_page || 0)) *
  Number(fmtK.area_factor) *
  (1 + Number(catK.waste_factor || 0));

/* monta o plano dos copos */
const custoTransferPorCopo = (transfer.custo + cliqueA4) / COPOS_POR_FOLHA;
const plano = [];
for (const p of PRODUTOS) {
  const ins = INSUMOS.find((x) => x.sku === p.copoSku);
  const custoCopo = ins.kitPreco / ins.kit;
  plano.push({ ...p, custoCopo, custo: custoCopo + custoTransferPorCopo + PRIMER_POR_COPO });
}

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log("1. INSUMOS (custo por unidade, não do kit)\n");
  for (const i of INSUMOS) {
    console.log(
      `   ${i.sku.padEnd(14)} kit ${String(i.kit).padStart(3)} × R$ ${i.kitPreco.toFixed(2).padStart(6)}` +
        `  ->  R$ ${(i.kitPreco / i.kit).toFixed(4).padStart(7)}   ${i.name.slice(0, 40)}`,
    );
  }
  console.log(`\n2. TRANSFER: folha R$ ${transfer.custo.toFixed(4)} + impressão R$ ${cliqueA4.toFixed(4)}`);
  console.log(`   ÷ ${COPOS_POR_FOLHA} copos por folha = R$ ${custoTransferPorCopo.toFixed(4)} por copo`);
  console.log(`   + primer TF200 R$ ${PRIMER_POR_COPO.toFixed(2)}\n`);
  console.log("3. COPOS PERSONALIZADOS\n");
  for (const p of plano) {
    console.log(`   ${p.sku}  (copo R$ ${p.custoCopo.toFixed(2)} → custo total R$ ${p.custo.toFixed(2)})`);
    for (const [q, v] of p.faixas) {
      console.log(
        `      ${String(q).padStart(3)} un × R$ ${v.toFixed(2).padStart(6)}   margem ${(((v - p.custo) / v) * 100).toFixed(0)}%`,
      );
    }
  }
  const f = await mat(PORTA_RETRATO.fotoSku ? "BA-1047" : "");
  const mo = await mat(PORTA_RETRATO.molduraSku);
  const cf = (await c.query(`select cost_snapshot from products where sku=$1`, [PORTA_RETRATO.fotoSku])).rows[0];
  const custoPR = Number(cf.cost_snapshot) + (mo?.custo || 0);
  console.log(`\n4. PORTA-RETRATO  foto R$ ${Number(cf.cost_snapshot).toFixed(2)} + moldura R$ ${(mo?.custo || 0).toFixed(2)} = R$ ${custoPR.toFixed(2)}`);
  for (const [q, v] of PORTA_RETRATO.faixas) {
    console.log(`      ${String(q).padStart(2)} un × R$ ${v.toFixed(2).padStart(6)}   margem ${(((v - custoPR) / v) * 100).toFixed(0)}%`);
  }
  void f;
  console.log("\nPara aplicar: node scripts/cadastrar-copos.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  let forn = (await c.query(`select id from suppliers where name='Shopee'`)).rows[0];
  if (!forn) {
    forn = (
      await c.query(
        `insert into suppliers (name, notes) values ('Shopee','Copos, molduras e brindes.') returning id`,
      )
    ).rows[0];
  }

  /* 1. insumos */
  for (const i of INSUMOS) {
    const unit = i.kitPreco / i.kit;
    const cat = i.sku === "PRIMER-TF200" ? catMatCopo : catMatCopo;
    const ja = await c.query(`select id from materials where sku=$1`, [i.sku]);
    const vals = [i.name, cat, i.unidade || "unidade", unit, `Kit com ${i.kit}`,
                  i.kit, i.kitPreco, forn.id, i.minStock, i.nota];
    if (ja.rows.length) {
      await c.query(
        `update materials set name=$2, category_id=$3, unit=$4, unit_cost=$5, pack_name=$6,
           pack_quantity=$7, pack_cost=$8, supplier='Shopee', supplier_id=$9,
           min_stock=$10, notes=$11 where id=$1`,
        [ja.rows[0].id, ...vals],
      );
    } else {
      await c.query(
        `insert into materials (name, category_id, unit, unit_cost, pack_name, pack_quantity,
           pack_cost, supplier, supplier_id, min_stock, notes, sku, stock)
         values ($1,$2,$3,$4,$5,$6,$7,'Shopee',$8,$9,$10,$11,0)`,
        [...vals, i.sku],
      );
    }
  }
  console.log(`Insumos: ${INSUMOS.length}`);

  /* 2. copos personalizados */
  const primer = await mat("PRIMER-TF200");
  for (const p of plano) {
    const copo = await mat(p.copoSku);
    const ja = await c.query(`select id from products where sku=$1`, [p.sku]);
    const campos = [p.name, p.descricao, catProdCopo, KONICA, KONICA_CAT, FMT_A4_CHAPADO,
                    transfer.id, p.custo.toFixed(4), p.faixas[0][1].toFixed(4)];
    let id;
    if (ja.rows.length) {
      id = ja.rows[0].id;
      await c.query(
        `update products set name=$2, description=$3, product_category_id=$4, printer_id=$5,
           printer_category_id=$6, print_format_id=$7, color_mode='color', base_material_id=$8,
           base_material_qty=0.5, cost_snapshot=$9, sell_price=$10, final_price=$10,
           calculation_mode='unit', pieces_per_sheet=1, pages_per_unit=1, print_sides=1,
           min_order_qty=1, default_quantity=1, active=true, track_stock=false where id=$1`,
        [id, ...campos],
      );
    } else {
      id = (
        await c.query(
          `insert into products (name, description, product_category_id, printer_id,
             printer_category_id, print_format_id, color_mode, base_material_id, cost_snapshot,
             sell_price, final_price, sku, base_material_qty, calculation_mode, pieces_per_sheet,
             pages_per_unit, print_sides, waste_percent, setup_sheets, min_order_qty,
             default_quantity, margin, active, track_stock, lead_time_creation,
             lead_time_production, lead_time_finishing, lead_time_serial, copies)
           values ($1,$2,$3,$4,$5,$6,'color',$7,$8,$9,$9,$10,0.5,'unit',1,1,1,0,0,1,1,0.4,
                   true,false,0,2,1,false,1) returning id`,
          [...campos, p.sku],
        )
      ).rows[0].id;
    }

    /* copo e primer entram como insumo: o estoque baixa na venda */
    await c.query(`delete from product_materials where product_id=$1`, [id]);
    await c.query(
      `insert into product_materials (product_id, material_id, quantity) values ($1,$2,1)`,
      [id, copo.id],
    );
    await c.query(
      `insert into product_materials (product_id, material_id, quantity) values ($1,$2,1)`,
      [id, primer.id],
    );

    await c.query(`delete from product_price_tiers where product_id=$1`, [id]);
    for (const [q, v] of p.faixas) {
      await c.query(
        `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
         values ($1,$2,$3,$4)`,
        [id, q, v, q === 1 ? "avulso" : `a partir de ${q}`],
      );
    }
  }
  console.log(`Copos personalizados: ${plano.length}`);

  /* 3. porta-retrato */
  {
    const pr = PORTA_RETRATO;
    const foto = (await c.query(
      `select cost_snapshot, printer_id, printer_category_id, print_format_id, base_material_id
         from products where sku=$1`, [pr.fotoSku])).rows[0];
    const mo = await mat(pr.molduraSku);
    const custo = Number(foto.cost_snapshot) + mo.custo;
    const campos = [pr.name, pr.descricao, catProdFoto, foto.printer_id, foto.printer_category_id,
                    foto.print_format_id, foto.base_material_id, custo.toFixed(4),
                    pr.faixas[0][1].toFixed(4)];
    const ja = await c.query(`select id from products where sku=$1`, [pr.sku]);
    let id;
    if (ja.rows.length) {
      id = ja.rows[0].id;
      await c.query(
        `update products set name=$2, description=$3, product_category_id=$4, printer_id=$5,
           printer_category_id=$6, print_format_id=$7, color_mode='color', base_material_id=$8,
           base_material_qty=1, cost_snapshot=$9, sell_price=$10, final_price=$10,
           calculation_mode='unit', pieces_per_sheet=1, pages_per_unit=1, print_sides=1,
           min_order_qty=1, default_quantity=1, active=true, track_stock=false where id=$1`,
        [id, ...campos],
      );
    } else {
      id = (
        await c.query(
          `insert into products (name, description, product_category_id, printer_id,
             printer_category_id, print_format_id, color_mode, base_material_id, cost_snapshot,
             sell_price, final_price, sku, base_material_qty, calculation_mode, pieces_per_sheet,
             pages_per_unit, print_sides, waste_percent, setup_sheets, min_order_qty,
             default_quantity, margin, active, track_stock, lead_time_creation,
             lead_time_production, lead_time_finishing, lead_time_serial, copies)
           values ($1,$2,$3,$4,$5,$6,'color',$7,$8,$9,$9,$10,1,'unit',1,1,1,0,0,1,1,0.4,
                   true,false,0,1,1,false,1) returning id`,
          [...campos, pr.sku],
        )
      ).rows[0].id;
    }
    await c.query(`delete from product_materials where product_id=$1`, [id]);
    await c.query(
      `insert into product_materials (product_id, material_id, quantity) values ($1,$2,1)`,
      [id, mo.id],
    );
    await c.query(`delete from product_price_tiers where product_id=$1`, [id]);
    for (const [q, v] of pr.faixas) {
      await c.query(
        `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
         values ($1,$2,$3,$4)`,
        [id, q, v, q === 1 ? "avulsa" : `a partir de ${q}`],
      );
    }
    console.log("Porta-retrato: 1");
  }

  await c.query("commit");

  const fim = await c.query(
    `select sku, cost_snapshot, final_price from products
      where sku like 'COPO-%PERS' or sku='FOTO-10X15-M' order by sku`,
  );
  console.log("\n✅ Novos produtos:");
  for (const r of fim.rows) {
    const cst = Number(r.cost_snapshot);
    const pv = Number(r.final_price);
    console.log(
      `   ${r.sku.padEnd(18)} custo R$ ${cst.toFixed(2).padStart(5)}  venda R$ ${pv.toFixed(2).padStart(6)}` +
        `  margem ${(((pv - cst) / pv) * 100).toFixed(0)}%`,
    );
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
