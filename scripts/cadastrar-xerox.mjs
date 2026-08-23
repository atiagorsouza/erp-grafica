#!/usr/bin/env node
/**
 * Cadastra a linha de cópia/impressão A4 na Konica C284e.
 *
 * Preços definidos pelo dono: P&B R$ 1,00 e colorida R$ 1,50 na
 * avulsa, descendo por faixa até 0,50 / 0,85.
 *
 * Custo real por página (dos consumíveis já cadastrados):
 *   P&B      clique 0,0187 + papel 0,0558 = R$ 0,0745
 *   Colorida clique 0,0607 + papel 0,0558 = R$ 0,1165
 *
 * "Impresso" e "xerox" são o MESMO produto: na Konica passam pelo
 * mesmo mecanismo e gastam o mesmo toner. Separar só confundiria o
 * balcão.
 *
 * Simula por padrão.  Para valer: node scripts/cadastrar-xerox.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

const PB = [
  [1, 1.0],
  [10, 0.9],
  [25, 0.8],
  [50, 0.7],
  [100, 0.6],
  [300, 0.5],
];
const COR = [
  [1, 1.5],
  [10, 1.35],
  [25, 1.2],
  [50, 1.05],
  [100, 0.95],
  [300, 0.85],
];

const PRODUTOS = [
  {
    sku: "COP-PB-A4",
    name: "Cópia / Impressão A4 Preto e Branco",
    description:
      "Cópia ou impressão em papel sulfite A4 75g, preto e branco, uma face. " +
      "Preço por página, com desconto por quantidade.",
    colorMode: "mono",
    printFormatId: 21, // A4 texto (5%)
    faixas: PB,
    custo: 0.0745,
  },
  {
    sku: "COP-COR-A4",
    name: "Cópia / Impressão A4 Colorida",
    description:
      "Cópia ou impressão em papel sulfite A4 75g, colorida, uma face. " +
      "Preço por página, com desconto por quantidade.",
    colorMode: "color",
    printFormatId: 22, // A4 meia cobertura (50%)
    faixas: COR,
    custo: 0.1165,
  },
];

/* Categoria resolvida por NOME dentro do módulo "product": ids mudam
   a cada limpeza de taxonomia, nome não. O PDV só enxerga categorias
   deste módulo. */
const CAT_NOME = "Gráfica Rápida";
const PAPEL_SULFITE = 459; // Papel Sulfite Chamex A4 75g
const KONICA = 10;
const KONICA_CAT = 6;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const catRow = await c.query(
  "select id from item_categories where module='product' and name=$1",
  [CAT_NOME],
);
if (!catRow.rows.length) {
  console.error(`❌ Categoria "${CAT_NOME}" não existe no módulo product.`);
  await c.end();
  process.exit(1);
}
const CAT_GRAFICA_RAPIDA = catRow.rows[0].id;

if (!APLICAR) {
  console.log("--- SIMULAÇÃO (nada gravado) ---\n");
  for (const p of PRODUTOS) {
    console.log(`${p.sku}  ${p.name}`);
    console.log(`   custo por página: R$ ${p.custo.toFixed(4)}`);
    for (const [min, preco] of p.faixas) {
      const m = ((preco - p.custo) / preco) * 100;
      console.log(
        `   a partir de ${String(min).padStart(3)} un  R$ ${preco.toFixed(2)}` +
          `   margem ${m.toFixed(1)}%   lucro R$ ${(preco - p.custo).toFixed(3)}`,
      );
    }
    console.log();
  }
  console.log("Para aplicar: node scripts/cadastrar-xerox.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  for (const p of PRODUTOS) {
    /* Reexecutável: se o SKU já existe, atualiza em vez de duplicar. */
    const existe = await c.query("select id from products where sku=$1", [p.sku]);
    const precoBase = p.faixas[0][1];

    let id;
    if (existe.rows.length) {
      id = existe.rows[0].id;
      await c.query(
        `update products set name=$2, description=$3, product_category_id=$4,
           printer_id=$5, printer_category_id=$6, print_format_id=$7, color_mode=$8,
           base_material_id=$9, base_material_qty=1, calculation_mode='unit',
           pieces_per_sheet=1, print_sides=1, waste_percent=0, setup_sheets=0,
           min_order_qty=1, default_quantity=1, margin=0.4,
           sell_price=$10, final_price=$10, active=true, track_stock=false,
           lead_time_creation=0, lead_time_production=0, lead_time_finishing=0
         where id=$1`,
        [id, p.name, p.description, CAT_GRAFICA_RAPIDA, KONICA, KONICA_CAT,
         p.printFormatId, p.colorMode, PAPEL_SULFITE, precoBase],
      );
      console.log(`atualizado  ${p.sku} (id ${id})`);
    } else {
      const r = await c.query(
        `insert into products
          (name, sku, description, product_category_id, printer_id, printer_category_id,
           print_format_id, color_mode, base_material_id, base_material_qty,
           calculation_mode, pieces_per_sheet, print_sides, waste_percent, setup_sheets,
           min_order_qty, default_quantity, margin, sell_price, final_price,
           active, track_stock, lead_time_creation, lead_time_production, lead_time_finishing,
           lead_time_serial, pages_per_unit, copies)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,'unit',1,1,0,0,1,1,0.4,$10,$10,
                 true,false,0,0,0,false,1,1)
         returning id`,
        [p.name, p.sku, p.description, CAT_GRAFICA_RAPIDA, KONICA, KONICA_CAT,
         p.printFormatId, p.colorMode, PAPEL_SULFITE, precoBase],
      );
      id = r.rows[0].id;
      console.log(`criado      ${p.sku} (id ${id})`);
    }

    /* Faixas: apaga e regrava, para o script poder rodar de novo. */
    await c.query("delete from product_price_tiers where product_id=$1", [id]);
    for (const [min, preco] of p.faixas) {
      await c.query(
        `insert into product_price_tiers (product_id, min_quantity, unit_price, label)
         values ($1,$2,$3,$4)`,
        [id, min, preco, min === 1 ? "avulsa" : `a partir de ${min}`],
      );
    }
    console.log(`            ${p.faixas.length} faixas`);
  }
  await c.query("commit");

  const fim = await c.query(
    `select p.sku, p.name,
            (select count(*) from product_price_tiers t where t.product_id=p.id) faixas,
            (select min(unit_price) from product_price_tiers t where t.product_id=p.id) menor,
            (select max(unit_price) from product_price_tiers t where t.product_id=p.id) maior
     from products p where p.sku like 'COP-%' order by p.sku`,
  );
  console.log("\n✅ Cadastrado:");
  for (const r of fim.rows) {
    console.log(`   ${r.sku.padEnd(11)} ${r.faixas} faixas  de R$ ${r.maior} a R$ ${r.menor}`);
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
