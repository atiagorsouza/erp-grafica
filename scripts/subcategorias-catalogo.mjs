#!/usr/bin/env node
/**
 * Recria o segundo nível da árvore de categorias.
 *
 * A limpeza anterior achatou tudo em 8 categorias, mas o sistema foi
 * desenhado em dois níveis (Mestre → Subcategoria) e o e2e cobra isso:
 * "árvore de produtos tem 0 subcategoria(s)".
 *
 * O achatamento não estava errado — 60 categorias planas eram o
 * problema. O certo é 8 mestres com poucas subcategorias úteis
 * embaixo. No PDV o operador continua vendo 8 abas (as mestres); as
 * subcategorias servem para organizar o catálogo e os relatórios.
 *
 * Simula por padrão. Para valer: node scripts/subcategorias-catalogo.mjs --aplicar
 */
import "dotenv/config";
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

/** Subcategorias por mestre. Enxutas de propósito. */
const ARVORE = {
  "Gráfica Rápida": ["Cópias e Impressões", "Encadernação", "Plastificação"],
  Impressos: ["Adesivos", "Cartões e Panfletos", "Etiquetas"],
  Fotografia: ["Fotos", "Pôsteres e Ampliações"],
  Brindes: ["Canecas", "Bottons e Chaveiros", "Copos e Acrílicos"],
  Têxtil: ["Camisetas", "DTF"],
  Papelaria: ["Agendas e Cadernos", "Embalagens", "Festas"],
  "Impressão 3D": ["Peças 3D"],
  Serviços: ["Criação e Arte-final", "Terceirizados"],
};

/** Para onde cada produto já cadastrado deve ir. */
const PRODUTO_PARA_SUB = {
  "COP-PB-A4": "Cópias e Impressões",
  "COP-COR-A4": "Cópias e Impressões",
  "ADES-4015": "Adesivos",
  "ADES-Q30": "Adesivos",
  "ADES-Q40": "Adesivos",
  "ADES-Q50": "Adesivos",
  "ADES-Q60": "Adesivos",
  "ADES-R30": "Adesivos",
  "ADES-R40": "Adesivos",
  "ADES-R50": "Adesivos",
  "ADES-R60": "Adesivos",
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const mestres = await c.query(
  `select id, name, module from item_categories where parent_id is null order by module, "order"`,
);
const porModulo = {};
for (const r of mestres.rows) (porModulo[r.module] ??= []).push(r);

if (!APLICAR) {
  console.log("--- SIMULAÇÃO ---\n");
  for (const [nome, subs] of Object.entries(ARVORE)) {
    console.log(`${nome}`);
    for (const s of subs) console.log(`   └─ ${s}`);
  }
  const n = Object.values(ARVORE).flat().length;
  console.log(`\n${n} subcategorias × ${Object.keys(porModulo).length} módulos`);
  console.log("\nProdutos seriam movidos para:");
  for (const [sku, sub] of Object.entries(PRODUTO_PARA_SUB)) {
    console.log(`   ${sku.padEnd(11)} -> ${sub}`);
  }
  console.log("\nPara aplicar: node scripts/subcategorias-catalogo.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  /* Cria as subs em todos os módulos, para que cada tela (produtos,
     materiais, serviços...) tenha a mesma estrutura. */
  let criadas = 0;
  for (const [modulo, lista] of Object.entries(porModulo)) {
    for (const mestre of lista) {
      const subs = ARVORE[mestre.name];
      if (!subs) continue;
      for (const [i, nomeSub] of subs.entries()) {
        const ja = await c.query(
          `select id from item_categories where module=$1 and name=$2 and parent_id=$3`,
          [modulo, nomeSub, mestre.id],
        );
        if (ja.rows.length) continue;
        await c.query(
          `insert into item_categories (name, module, parent_id, "order") values ($1,$2,$3,$4)`,
          [nomeSub, modulo, mestre.id, i],
        );
        criadas++;
      }
    }
  }
  console.log(`Subcategorias criadas: ${criadas}`);

  /* Pendura cada produto na subcategoria certa. */
  let movidos = 0;
  for (const [sku, nomeSub] of Object.entries(PRODUTO_PARA_SUB)) {
    const sub = await c.query(
      `select id from item_categories where module='product' and name=$1 limit 1`,
      [nomeSub],
    );
    if (!sub.rows.length) continue;
    const r = await c.query(`update products set product_category_id=$1 where sku=$2`, [
      sub.rows[0].id,
      sku,
    ]);
    movidos += r.rowCount;
  }
  console.log(`Produtos remapeados: ${movidos}`);

  await c.query("commit");

  const fim = await c.query(
    `select m.name mestre, coalesce(s.name,'(direto na mestre)') sub,
            (select count(*) from products p where p.product_category_id = coalesce(s.id, m.id))::int n
       from item_categories m
       left join item_categories s on s.parent_id = m.id
      where m.module='product' and m.parent_id is null
      order by m."order", s."order"`,
  );
  console.log("\n✅ Árvore de produtos:");
  let atual = "";
  for (const r of fim.rows) {
    if (r.mestre !== atual) {
      console.log(`   ${r.mestre}`);
      atual = r.mestre;
    }
    console.log(`      └─ ${r.sub.padEnd(22)} ${r.n || ""}`);
  }
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi gravado:", e.message);
  process.exitCode = 1;
}
await c.end();
