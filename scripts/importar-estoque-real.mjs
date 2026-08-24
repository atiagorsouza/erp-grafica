#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   IMPORTA A CONFERÊNCIA DE ESTOQUE DO DONO

     node scripts/importar-estoque-real.mjs             mostra o que faria
     node scripts/importar-estoque-real.mjs --aplicar   grava

   Origem: "Planilha_Conferencia_Estoque csv.csv", contagem física feita
   pelo dono em agosto/2026.

   DUAS DECISÕES DELE, confirmadas antes de escrever isto:

   1. "10 pacotes (200 fls)" significa **200 folhas no total** — o que
      sobrou, espalhado em 10 pacotes abertos. NÃO é 10 × 200. Ler
      errado inflaria o estoque em 10 a 37 vezes.

   2. Os papéis que já estavam no sistema (Papel A4 75g, Couché 150g,
      Chamex...) são dados de DEMONSTRAÇÃO, com números chutados. Ele
      pediu para removê-los e ficar só com a contagem real.

   Segurança: só mexe em `materials`. Material de demonstração que já
   tenha movimentação registrada NÃO é apagado — vira estoque zero e
   fica marcado no nome, porque apagá-lo quebraria o histórico.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const { Client } = pg;

/* nome | sku | folhas contadas | custo por folha | unidade */
const CONTAGEM = [
  ["Papel Fotográfico Glossy 115g A4", "BC-227", 200, 0.24],
  ["Papel Foto RC Glossy 260g A6 (10x15)", "BA-1047", 400, 0.35],
  ["Papel Foto Glossy Adesivo 115g A4", "BC-2256", 160, 0.43],
  ["Papel Fotográfico Glossy 260g A4", "BC-2305", 100, 0.75],
  ["Papel Fotográfico Glossy 180g A4", "BC-2266", 200, 0.27],
  ["Papel Foto RC Glossy Seda 260g A4", "BA-1049", 80, 1.6],
  ["Papel Foto RC Glossy 260g A3", "BA-1093", 40, 3.3],
  ["Papel Fotográfico Glossy 180g A3", "BC-2007-1", 40, 0.69],
  ["Papel Foto Glossy Adesivo 135g A3", "BC-2278", 20, 0.43],
  ["Vinil Adesivo Transparente Laser A4", "OP 2459 SU", 100, 1.88],
  ["Vinil Adesivo Branco Brilho Laser A4", "OP2537 SU", 100, 1.88],
  ["Vinil Branco Brilho Laser Super A3", "Lote A12030", 100, 3.44],
  ["Vinil Branco Brilho Laser A3", "OP2141", 100, 3.22],
  ["Papel Kraft Ecocores Ridet A3 100g", "Ref. 010020", 150, 0.59],
  ["Couché Brilho 115g A4 Fracionado", "COUCH-115-A4", 200, 0.17],
  ["Couché Brilho 250g A4 Fracionado", "COUCH-250-A4", 100, 0.37],
  ["Couché Brilho 250g A3 Fracionado", "COUCH-250-A3", 100, 0.83],
  ["Papel Offset 120g/m² A3 Fracionado", "OFFSET-120-A3", 150, 0.43],
  ["Papel Offset 240g/m² A4 Fracionado", "OFFSET-240-A4", 100, 0.4],
];

/* Papéis de demonstração — números chutados no seed inicial. */
const DEMO = [
  "Papel A4 75g (folha)",
  "Papel A4 90g (folha)",
  "Papel Chamex A4 75g",
  "Papel Couché 150g A3",
  "Papel Couché 150g A4",
  "Papel Kraft A3 240g",
  "Papel Sulfite A3 75g",
  "Folha Adesivo Vinil A3+",
];

/* Estoque mínimo sugerido: ~25% do contado, arredondado para baixo em
   dezenas. É só um ponto de partida para o alerta de reposição não
   nascer mudo — o dono ajusta na tela. */
const minimoDe = (n) => Math.max(10, Math.floor((n * 0.25) / 10) * 10);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}
const db = new Client({ connectionString: url });
await db.connect();
const q = (sql, p = []) => db.query(sql, p).then((r) => r.rows);

console.log(`\n  CONFERÊNCIA DE ESTOQUE — ${APLICAR ? "APLICANDO" : "simulação"}\n`);

/* categoria de papel, para os novos não caírem em "Sem categoria" */
const [cat] = await q(
  `select id from material_categories where name ilike '%papel%' order by id limit 1`
).catch(() => [null]);
const catId = cat?.id ?? null;

let criados = 0;
let atualizados = 0;
let valorTotal = 0;

for (const [nome, sku, folhas, custo] of CONTAGEM) {
  const [existe] = await q(`select id, stock from materials where name = $1`, [nome]);
  valorTotal += folhas * custo;
  const min = minimoDe(folhas);

  if (existe) {
    atualizados++;
    console.log(`  ~ ${nome}  →  ${folhas} folhas @ R$ ${custo.toFixed(2)}`);
    if (APLICAR) {
      await q(
        `update materials set sku=$1, unit='folha', unit_cost=$2, stock=$3, min_stock=$4 where id=$5`,
        [sku, custo, folhas, min, existe.id]
      );
    }
  } else {
    criados++;
    console.log(`  + ${nome}  —  ${folhas} folhas @ R$ ${custo.toFixed(2)}  (mín. ${min})`);
    if (APLICAR) {
      await q(
        `insert into materials (name, sku, unit, unit_cost, stock, min_stock, category_id, notes)
         values ($1,$2,'folha',$3,$4,$5,$6,$7)`,
        [nome, sku, custo, folhas, min, catId, "Contagem física do dono — agosto/2026."]
      );
    }
  }
}

console.log(`\n  ${criados} a criar · ${atualizados} a atualizar`);
console.log(`  Valor imobilizado em papel: R$ ${valorTotal.toFixed(2)}\n`);

/* ── material de demonstração ── */
console.log("  DADOS DE DEMONSTRAÇÃO:");
let apagados = 0;
let zerados = 0;
for (const nome of DEMO) {
  const [m] = await q(`select id from materials where name = $1`, [nome]);
  if (!m) continue;

  /* Movimentação registrada é histórico: apagar o material deixaria
     lançamentos órfãos. Nesse caso zera e marca, não remove.

     Mesma lógica para produto que dependa do material: a receita do
     produto perderia o insumo e o custo iria para zero silenciosamente
     — pior que manter o material zerado e visível. */
  const [{ n }] = await q(
    `select
       (select count(*) from stock_movements where material_id = $1)
     + (select count(*) from product_materials  where material_id = $1)
     + (select count(*) from products where base_material_id = $1) as n`,
    [m.id]
  );

  if (Number(n) > 0) {
    zerados++;
    console.log(`  ! ${nome} — tem ${n} vínculo(s) (movimento ou produto); zerando em vez de apagar`);
    if (APLICAR) {
      await q(
        `update materials set stock=0, min_stock=0,
           notes=coalesce(notes,'') || ' [demonstração — substituído pela contagem real]'
         where id=$1`,
        [m.id]
      );
    }
  } else {
    apagados++;
    console.log(`  - ${nome} — sem movimento; removido`);
    if (APLICAR) await q(`delete from materials where id=$1`, [m.id]);
  }
}
console.log(`\n  ${apagados} a remover · ${zerados} a zerar (preservam histórico)\n`);

if (!APLICAR) {
  console.log("→ Nada foi alterado.");
  console.log("→ Para aplicar: node scripts/importar-estoque-real.mjs --aplicar\n");
} else {
  console.log("  ✔ Estoque atualizado com a contagem real.\n");
}

await db.end();
