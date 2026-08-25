#!/usr/bin/env node
/**
 * Cadastra a linha de espirais da Espirario no estoque.
 *
 * Fonte: https://espirario.lojavirtualnuvem.com.br  (consulta em 23/08/2026)
 *
 * O detalhe que muda tudo: o PLÁSTICO é vendido em PACOTE e a
 * quantidade por pacote CAI conforme o diâmetro sobe. O 07 mm vem com
 * 100 unidades por R$ 17,25 (R$ 0,17 cada); o 33 mm vem com 25 por
 * R$ 44,90 (R$ 1,80 cada). Quem olha só o preço do pacote acha que o
 * 20 mm e o 33 mm custam igual — custam R$ 0,64 e R$ 1,80 por
 * unidade. É o mesmo erro da cartela de adesivo.
 *
 * O METÁLICO é vendido por unidade: o preço do site já é o unitário.
 *
 * Simula por padrão.  Para valer: node scripts/cadastrar-espirais.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

const FORNECEDOR = "Espirario";
const SUBCAT = "Encadernação"; // subcategoria de material

/**
 * [mm, capacidade em folhas 75g, preço do pacote, unidades no pacote, conferido?]
 *
 * "conferido" = a página do produto na loja mostrava "Produto por
 * Embalagem". Onde não mostrava, a quantidade foi estimada pela curva
 * dos que mostravam — está marcado e precisa ser corrigido na próxima
 * compra.
 */
const PLASTICO = [
  [7, 25, 17.25, 100, true],
  [9, 50, 20.9, 100, true],
  [12, 70, 30.3, 100, true],
  [14, 85, 37.5, 91, false],
  [17, 100, 44.9, 82, false],
  [20, 120, 44.9, 70, true],
  [23, 140, 44.9, 58, false],
  [25, 160, 44.9, 45, true],
  [29, 200, 44.9, 36, false],
  [33, 250, 44.9, 25, true],
  [40, 300, 44.9, 21, false],
  [45, 350, 44.9, 18, false],
  [50, 400, 44.9, 16, false],
];

/** [descrição, mm, capacidade, preço unitário] — metálico é avulso. */
const METALICO = [
  ["preto", 25.4, 200, 4.1],
  ["branco", 25.4, 200, 4.1],
  ["branco", 31.7, 275, 5.5],
  ["branco", 38.1, 350, 6.2],
  ["branco", 57.1, 500, 10.0],
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const cat = await c.query(
  "select id from item_categories where module='material' and name=$1 limit 1",
  [SUBCAT],
);
if (!cat.rows.length) {
  console.error(`❌ Subcategoria "${SUBCAT}" não existe no módulo material.`);
  await c.end();
  process.exit(1);
}
const CAT_ID = cat.rows[0].id;

/** Monta a lista final de materiais a gravar. */
const itens = [];
for (const [mm, cap, pacote, qtd, ok] of PLASTICO) {
  const mmTxt = String(mm).padStart(2, "0");
  itens.push({
    sku: `ESP-PL-${mmTxt}`,
    name: `Espiral Plástico ${mmTxt} mm (até ${cap} folhas)`,
    unit: "unidade",
    unitCost: pacote / qtd,
    packName: `Pacote com ${qtd}`,
    packQuantity: qtd,
    packCost: pacote,
    minStock: cap <= 120 ? 20 : 10,
    notes:
      `Espirario, consulta 23/08/2026. Pacote R$ ${pacote.toFixed(2)} com ${qtd} un. ` +
      (ok
        ? "Quantidade por pacote confirmada na loja."
        : "⚠️ Quantidade por pacote ESTIMADA — a loja não informava; conferir na próxima compra."),
  });
}
for (const [cor, mm, cap, preco] of METALICO) {
  const mmTxt = String(mm).replace(".", ",");
  itens.push({
    sku: `ESP-MT-${String(mm).replace(".", "")}-${cor.slice(0, 3).toUpperCase()}`,
    name: `Espiral Metálico ${cor} ${mmTxt} mm (até ${cap} folhas)`,
    unit: "unidade",
    unitCost: preco,
    packName: null,
    packQuantity: 1,
    packCost: preco,
    minStock: 10,
    notes: `Espirario, consulta 23/08/2026. Vendido por unidade, passo 6 mm.`,
  });
}

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log(`${"SKU".padEnd(15)} ${"custo/un".padStart(9)}  item`);
  for (const i of itens) {
    const alerta = i.notes.includes("ESTIMADA") ? " ⚠️" : "";
    console.log(
      `${i.sku.padEnd(15)} ${("R$ " + i.unitCost.toFixed(4)).padStart(9)}  ${i.name}${alerta}`,
    );
  }
  console.log(`\n${itens.length} materiais. ⚠️ = quantidade do pacote estimada.`);
  console.log("\nPara aplicar: node scripts/cadastrar-espirais.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  /* Fornecedor: cria se não existir. */
  let forn = await c.query("select id from suppliers where name=$1", [FORNECEDOR]);
  if (!forn.rows.length) {
    forn = await c.query(
      `insert into suppliers (name, notes) values ($1,$2) returning id`,
      [FORNECEDOR, "Espirais para encadernação. espirario.lojavirtualnuvem.com.br"],
    );
    console.log(`Fornecedor "${FORNECEDOR}" criado (id ${forn.rows[0].id})`);
  }
  const FORN_ID = forn.rows[0].id;

  let criados = 0;
  let atualizados = 0;
  for (const i of itens) {
    const ja = await c.query("select id from materials where sku=$1", [i.sku]);
    if (ja.rows.length) {
      await c.query(
        `update materials set name=$2, category_id=$3, unit=$4, unit_cost=$5,
           pack_name=$6, pack_quantity=$7, pack_cost=$8, supplier=$9,
           supplier_id=$10, min_stock=$11, notes=$12
         where id=$1`,
        [ja.rows[0].id, i.name, CAT_ID, i.unit, i.unitCost, i.packName,
         i.packQuantity, i.packCost, FORNECEDOR, FORN_ID, i.minStock, i.notes],
      );
      atualizados++;
    } else {
      await c.query(
        `insert into materials
          (name, sku, category_id, unit, unit_cost, pack_name, pack_quantity,
           pack_cost, supplier, supplier_id, stock, min_stock, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12)`,
        [i.name, i.sku, CAT_ID, i.unit, i.unitCost, i.packName, i.packQuantity,
         i.packCost, FORNECEDOR, FORN_ID, i.minStock, i.notes],
      );
      criados++;
    }
  }
  await c.query("commit");
  console.log(`\n✅ ${criados} criados, ${atualizados} atualizados.`);

  const fim = await c.query(
    `select sku, name, unit_cost, pack_quantity, pack_cost
       from materials where sku like 'ESP-%' order by sku`,
  );
  console.log(`\n${fim.rows.length} espirais no estoque:`);
  for (const r of fim.rows) {
    const pac = r.pack_quantity > 1 ? `pac ${r.pack_quantity} × R$ ${r.pack_cost}` : "avulso";
    console.log(`   ${r.sku.padEnd(15)} R$ ${Number(r.unit_cost).toFixed(4)}/un   ${pac}`);
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
