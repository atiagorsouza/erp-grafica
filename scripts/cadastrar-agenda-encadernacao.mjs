#!/usr/bin/env node
/**
 * Cadastra ENCADERNAÇÃO e AGENDA/CADERNO como PRODUTOS de venda.
 *
 * Por que produto e não acabamento: o PDV não vende acabamento —
 * acabamento só existe dentro de um orçamento, pendurado em outro
 * produto. Mas encadernar avulso é venda de balcão: o cliente chega
 * com o TCC impresso e quer só espiralar. Se não for produto, o
 * operador não consegue bipar e fechar no caixa.
 *
 * Os itens de acabamento continuam existindo (para quando a
 * encadernação faz parte de um trabalho maior, como uma apostila
 * impressa aqui). Os dois modos convivem.
 *
 * PREÇOS
 *
 * Encadernação avulsa = custo do espiral x3 + R$ 2,50 de montagem,
 * arredondado para R$ 0,50. Mesma régua do acabamento, para o preço
 * bater nos dois caminhos.
 *
 * Agenda/caderno = soma real do miolo + capa + espiral, x3, mais R$ 3
 * de montagem (é trabalhoso: dobrar, alcear, furar), arredondado para
 * o real inteiro. Preço cheio para número redondo de vitrine.
 *
 * Simula por padrão.  node scripts/cadastrar-agenda-encadernacao.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

const KONICA = 10;
const KONICA_CAT = 6;
const CLIQUE_PB = 0.0187;
const CLIQUE_COR = 0.0607;

const teto = (v, passo) => Math.ceil(v / passo) * passo;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/* ---------- referências, buscadas por nome (id muda) ---------- */
async function idCategoria(nome) {
  const r = await c.query(
    `select id from item_categories where module='product' and name=$1 limit 1`,
    [nome],
  );
  return r.rows[0]?.id ?? null;
}
async function material(sku) {
  const r = await c.query(`select id, unit_cost from materials where sku=$1`, [sku]);
  if (!r.rows.length) throw new Error(`material ${sku} não existe`);
  return { id: r.rows[0].id, custo: Number(r.rows[0].unit_cost) };
}

const catEncad = await idCategoria("Encadernação");
const catAgenda = await idCategoria("Agendas e Cadernos");
if (!catEncad || !catAgenda) {
  console.error("❌ Faltam as subcategorias Encadernação / Agendas e Cadernos.");
  await c.end();
  process.exit(1);
}

const sulfite = await material("CMX075CA4");
const supremo = await material("SUPREMO-250-A4");
const couche = await material("COUCH-250-A4");
const esp09 = await material("ESP-PL-09");
const esp12 = await material("ESP-PL-12");
const esp17 = await material("ESP-PL-17");

/* ---------- 1. Encadernação avulsa (cliente traz impresso) ---------- */
const ENCAD = [
  [50, esp09, "09"],
  [70, esp12, "12"],
  [100, esp17, "17"],
].map(([folhas, esp, mm]) => {
  const custo = esp.custo;
  return {
    sku: `ENC-${String(folhas).padStart(3, "0")}`,
    name: `Encadernação espiral até ${folhas} folhas`,
    description:
      `Espiralar material já impresso. Espiral plástico ${mm} mm, capacidade ${folhas} folhas. ` +
      `Capas cobradas à parte. Para apostilas impressas aqui, use o acabamento no orçamento.`,
    categoryId: catEncad,
    materialId: esp.id,
    custo,
    preco: teto(custo * 3 + 2.5, 0.5),
    subcat: "Encadernação",
  };
});

/* ---------- 2. Agenda e caderno personalizados ---------- */
/* Miolo A5: cada folha A4 impressa frente e verso vira 2 folhas A5,
   ou seja 4 páginas. `folhas` abaixo é o total de folhas A5 do
   caderno pronto. */
const AGENDA = [
  {
    sku: "CAD-A5-50",
    name: "Caderno A5 personalizado 50 folhas",
    folhas: 50,
    esp: esp12,
    capa: supremo,
    capaNome: "cartão supremo 250g",
    subcat: "Agendas e Cadernos",
  },
  {
    sku: "CAD-A5-100",
    name: "Caderno A5 personalizado 100 folhas",
    folhas: 100,
    esp: esp17,
    capa: supremo,
    capaNome: "cartão supremo 250g",
    subcat: "Agendas e Cadernos",
  },
  {
    sku: "AGE-A5-100",
    name: "Agenda A5 personalizada 100 folhas",
    folhas: 100,
    esp: esp17,
    capa: couche,
    capaNome: "couché 250g",
    subcat: "Agendas e Cadernos",
  },
].map((a) => {
  const folhasA4 = a.folhas / 2; // A4 dobrada = 2 folhas A5
  const papel = folhasA4 * sulfite.custo;
  const clique = folhasA4 * CLIQUE_PB * 2; // frente e verso
  const capa = a.capa.custo * 2 + 2 * CLIQUE_COR; // capa + contracapa, frente colorida
  const custo = papel + clique + capa + a.esp.custo;
  return {
    ...a,
    categoryId: catAgenda,
    materialId: sulfite.id,
    custo,
    preco: teto(custo * 3 + 3, 1),
    description:
      `Miolo ${a.folhas} folhas A5 em sulfite 75g, impresso frente e verso. ` +
      `Capa e contracapa em ${a.capaNome} com impressão colorida. Espiral plástico. ` +
      `Personalizado com a arte do cliente.`,
  };
});

const TODOS = [...ENCAD, ...AGENDA];

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log("ENCADERNAÇÃO AVULSA  (cliente traz o impresso)");
  for (const p of ENCAD) {
    console.log(
      `   ${p.sku.padEnd(10)} custo R$ ${p.custo.toFixed(2).padStart(5)}  ` +
        `venda R$ ${p.preco.toFixed(2).padStart(6)}  margem ${(((p.preco - p.custo) / p.preco) * 100).toFixed(0)}%  ${p.name}`,
    );
  }
  console.log("\nAGENDA E CADERNO PERSONALIZADOS");
  for (const p of AGENDA) {
    console.log(
      `   ${p.sku.padEnd(10)} custo R$ ${p.custo.toFixed(2).padStart(5)}  ` +
        `venda R$ ${p.preco.toFixed(2).padStart(6)}  margem ${(((p.preco - p.custo) / p.preco) * 100).toFixed(0)}%  ${p.name}`,
    );
  }
  console.log("\nPara aplicar: node scripts/cadastrar-agenda-encadernacao.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  let criados = 0;
  let atualizados = 0;
  for (const p of TODOS) {
    const ja = await c.query(`select id from products where sku=$1`, [p.sku]);
    const campos = [
      p.name, p.description, p.categoryId, KONICA, KONICA_CAT,
      p.materialId, p.custo.toFixed(4), p.preco.toFixed(4),
    ];
    if (ja.rows.length) {
      await c.query(
        `update products set name=$2, description=$3, product_category_id=$4,
           printer_id=$5, printer_category_id=$6, base_material_id=$7,
           cost_snapshot=$8, sell_price=$9, final_price=$9,
           calculation_mode='unit', pieces_per_sheet=1, base_material_qty=1,
           min_order_qty=1, default_quantity=1, active=true, track_stock=false
         where id=$1`,
        [ja.rows[0].id, ...campos],
      );
      atualizados++;
    } else {
      await c.query(
        `insert into products
           (name, description, product_category_id, printer_id, printer_category_id,
            base_material_id, cost_snapshot, sell_price, final_price, sku,
            calculation_mode, pieces_per_sheet, base_material_qty, min_order_qty,
            default_quantity, print_sides, waste_percent, setup_sheets, margin,
            active, track_stock, lead_time_creation, lead_time_production,
            lead_time_finishing, lead_time_serial, pages_per_unit, copies)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,
                 'unit',1,1,1,1,1,0,0,0.4,true,false,0,1,0,false,1,1)`,
        [...campos, p.sku],
      );
      criados++;
    }
  }
  await c.query("commit");
  console.log(`✅ ${criados} criados, ${atualizados} atualizados.`);

  const fim = await c.query(
    `select p.sku, p.name, p.final_price, s.name sub
       from products p join item_categories s on s.id = p.product_category_id
      where p.sku like 'ENC-%' or p.sku like 'CAD-%' or p.sku like 'AGE-%'
      order by s.name, p.final_price`,
  );
  let atual = "";
  for (const r of fim.rows) {
    if (r.sub !== atual) {
      console.log(`\n${r.sub}`);
      atual = r.sub;
    }
    console.log(
      `   R$ ${Number(r.final_price).toFixed(2).padStart(6)}  ${r.sku.padEnd(11)} ${r.name}`,
    );
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
