#!/usr/bin/env node
/**
 * Cadastra a encadernação como acabamento por FAIXA DE ESPESSURA.
 *
 * Hoje existe um único "Encadernação Espiral R$ 3,50/unidade". Preço
 * fechado é armadilha: numa apostila de 250 folhas o espiral de 33 mm
 * custa R$ 1,80 só de material, e o serviço inteiro sai no zero. Na
 * outra ponta, cobrar R$ 3,50 por um TCC de 20 folhas espanta o
 * cliente.
 *
 * O dono descreveu a conta certa: "espiral + capas + impresso". Este
 * script cadastra as duas primeiras partes; a impressão já existe
 * (COP-PB-A4 / COP-COR-A4).
 *
 * O preço de cada faixa é: custo do espiral × 3 + mão de obra fixa,
 * arredondado para R$ 0,50. A mão de obra é a mesma em qualquer
 * tamanho — furar e montar dá o mesmo trabalho.
 *
 * Simula por padrão.  node scripts/cadastrar-encadernacao.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

const MAO_DE_OBRA = 2.5; // furar + montar, igual em qualquer espessura
const MULTIPLICADOR = 3; // sobre o custo do espiral

/** Faixas de uso: até quantas folhas, e qual espiral atende. */
const FAIXAS = [
  [50, "ESP-PL-09"],
  [70, "ESP-PL-12"],
  [100, "ESP-PL-17"],
  [140, "ESP-PL-23"],
  [200, "ESP-PL-29"],
  [250, "ESP-PL-33"],
  [350, "ESP-PL-45"],
  [400, "ESP-PL-50"],
];

/**
 * Capas. Preços de VENDA estimados — o dono ainda não informou o que
 * paga, então ficam marcados para revisão, como combinado.
 */
const CAPAS = [
  ["Capa e contracapa PVC + PP (jogo)", 4.0, "jogo"],
  ["Capa e contracapa PVC nas duas faces (jogo)", 5.0, "jogo"],
  ["Capa personalizada couché 250g impressa", 6.0, "jogo"],
];

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const cat = await c.query(
  `select id from item_categories where module='finishing' and name='Encadernação' limit 1`,
);
if (!cat.rows.length) {
  console.error('❌ Subcategoria "Encadernação" não existe no módulo finishing.');
  await c.end();
  process.exit(1);
}
const CAT_ID = cat.rows[0].id;

/* Puxa o custo real de cada espiral do estoque. */
const esp = await c.query(
  `select sku, name, unit_cost from materials where sku = any($1::text[])`,
  [FAIXAS.map(([, sku]) => sku)],
);
const custoDe = Object.fromEntries(esp.rows.map((r) => [r.sku, Number(r.unit_cost)]));

const faltando = FAIXAS.filter(([, sku]) => !custoDe[sku]);
if (faltando.length) {
  console.error(
    "❌ Espirais não encontrados no estoque:",
    faltando.map(([, s]) => s).join(", "),
  );
  console.error("   Rode antes: node scripts/cadastrar-espirais.mjs --aplicar");
  await c.end();
  process.exit(1);
}

const arredonda = (v) => Math.ceil(v / 0.5) * 0.5;

const itens = FAIXAS.map(([folhas, sku]) => {
  const custo = custoDe[sku];
  const preco = arredonda(custo * MULTIPLICADOR + MAO_DE_OBRA);
  const mm = sku.replace("ESP-PL-", "").replace(/^0/, "");
  return {
    name: `Encadernação espiral até ${folhas} folhas (${mm} mm)`,
    unitCost: preco,
    unit: "unidade",
    description:
      `Espiral plástico ${mm} mm. Material R$ ${custo.toFixed(2)} + montagem. ` +
      `Não inclui capas nem impressão — cobrar em linhas separadas.`,
    custo,
    folhas,
  };
});

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  console.log("ENCADERNAÇÃO POR ESPESSURA");
  console.log(
    `${"até".padStart(6)} ${"espiral".padStart(8)} ${"custo".padStart(7)} ${"preço".padStart(7)} ${"lucro".padStart(7)} margem`,
  );
  for (const i of itens) {
    const lucro = i.unitCost - i.custo;
    const m = (lucro / i.unitCost) * 100;
    console.log(
      `${String(i.folhas).padStart(4)} fl ${i.name.match(/\((\d+) mm\)/)[1].padStart(5)} mm ` +
        `R$ ${i.custo.toFixed(2).padStart(4)} R$ ${i.unitCost.toFixed(2).padStart(5)} ` +
        `R$ ${lucro.toFixed(2).padStart(5)} ${m.toFixed(0).padStart(4)}%`,
    );
  }
  console.log("\nCAPAS (preço estimado — confirmar com o dono)");
  for (const [nome, preco] of CAPAS) {
    console.log(`   R$ ${preco.toFixed(2)}  ${nome}`);
  }
  console.log("\nPara aplicar: node scripts/cadastrar-encadernacao.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  /* O item antigo de preço fechado sai de cena: fica arquivado, não
     apagado, porque pode estar em orçamento antigo. */
  const velho = await c.query(
    `update finishing_items set archived_at = now()
      where name = 'Encadernação Espiral' and archived_at is null
      returning id`,
  );
  if (velho.rowCount) {
    console.log(`Arquivado o item antigo de preço fechado (id ${velho.rows[0].id})`);
  }

  let criados = 0;
  let atualizados = 0;
  for (const i of [
    ...itens,
    ...CAPAS.map(([name, preco, unit]) => ({
      name,
      unitCost: preco,
      unit,
      description:
        "⚠️ Preço estimado — o dono ainda não informou o custo de compra. Revisar.",
    })),
  ]) {
    const ja = await c.query(`select id from finishing_items where name=$1`, [i.name]);
    if (ja.rows.length) {
      await c.query(
        `update finishing_items set category_id=$2, unit=$3, unit_cost=$4,
           description=$5, archived_at=null where id=$1`,
        [ja.rows[0].id, CAT_ID, i.unit, i.unitCost, i.description],
      );
      atualizados++;
    } else {
      await c.query(
        `insert into finishing_items (name, category_id, unit, unit_cost, description)
         values ($1,$2,$3,$4,$5)`,
        [i.name, CAT_ID, i.unit, i.unitCost, i.description],
      );
      criados++;
    }
  }
  await c.query("commit");
  console.log(`\n✅ ${criados} criados, ${atualizados} atualizados.`);

  const fim = await c.query(
    `select f.name, f.unit_cost from finishing_items f
      where f.category_id=$1 and f.archived_at is null order by f.unit_cost`,
    [CAT_ID],
  );
  console.log("\nEncadernação no sistema:");
  for (const r of fim.rows) {
    console.log(`   R$ ${String(Number(r.unit_cost).toFixed(2)).padStart(6)}  ${r.name}`);
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
