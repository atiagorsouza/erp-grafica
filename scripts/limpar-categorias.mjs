#!/usr/bin/env node
/**
 * Reduz as 60 categorias acumuladas para as 8 aprovadas pelo dono.
 *
 * O cadastro juntou várias tentativas de taxonomia: "Comunicação
 * Visual" existia 4 vezes, "Papelaria Personalizada" 2, e 59 das 60
 * categorias não tinham um único produto. No PDV isso virava quatro
 * linhas de abas vazias.
 *
 * Nada é apagado antes de remapear: todo serviço, acabamento, material
 * e produto é movido para a categoria nova correspondente. Só então as
 * antigas caem.
 *
 * Simula por padrão. Para valer:  node scripts/limpar-categorias.mjs --aplicar
 */
import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");

/* As 8 categorias aprovadas, na ordem em que aparecem no PDV. */
const NOVAS = [
  ["Gráfica Rápida", "xerox, cópia, impressão avulsa, encadernação"],
  ["Impressos", "cartão, panfleto, folder, adesivo, cartela"],
  ["Fotografia", "10x15, A4, pôster"],
  ["Brindes", "caneca, botton, chaveiro, copo"],
  ["Têxtil", "camiseta, body, DTF"],
  ["Papelaria", "agenda, caderno, caixinha"],
  ["Impressão 3D", "peças"],
  ["Serviços", "criação, arte-final"],
];

/**
 * Para onde vai cada categoria antiga. A chave é o nome exato como
 * está hoje no banco; o valor é uma das 8 novas.
 */
const MAPA = {
  // --- Gráfica Rápida ---
  "Gráfica": "Gráfica Rápida",
  "Gráfica Rápida & Divulgação": "Gráfica Rápida",
  "Serviços de Balcão & Cópias": "Gráfica Rápida",
  "Impressão Digital": "Gráfica Rápida",
  "Encadernação": "Gráfica Rápida",
  "Organização & Encadernação": "Gráfica Rápida",
  "Plastificação": "Gráfica Rápida",
  "Laminação": "Gráfica Rápida",
  "Acabamento": "Gráfica Rápida",
  "Corte & Vinco": "Gráfica Rápida",
  "Montagem & Embalagem": "Gráfica Rápida",

  // --- Impressos ---
  "Impressos Comerciais": "Impressos",
  "Adesivo & Vinil": "Impressos",
  "Comunicação Visual": "Impressos",
  "Comunicação Visual Rápida": "Impressos",
  "Divulgação & Panfletagem": "Impressos",
  "Etiquetas & Ribbons": "Impressos",

  // --- Fotografia ---
  "Fotografia": "Fotografia",
  "Papéis Fotográficos": "Fotografia",

  // --- Brindes ---
  "Brindes": "Brindes",
  "Brindes & Sublimação": "Brindes",
  "Brindes & Estamparia": "Brindes",
  "Brindes para gravar": "Brindes",
  "Sublimação": "Brindes",
  "Sublimação Clássica": "Brindes",
  "Copos & Acrílicos": "Brindes",
  "Bottons & Acessórios": "Brindes",
  "Cortadores & Confeitaria": "Brindes",
  "Peças Decorativas & Colecionáveis": "Brindes",

  // --- Têxtil ---
  "Têxtil": "Têxtil",
  "Têxtil & DTF": "Têxtil",
  "DTF": "Têxtil",
  "DTF UV": "Têxtil",
  "DTF Têxtil": "Têxtil",
  "Estamparia Têxtil": "Têxtil",

  // --- Papelaria ---
  "Papelaria": "Papelaria",
  "Papelaria Personalizada": "Papelaria",
  "Papelaria para Lojas e E-commerce": "Papelaria",
  "Festas & Eventos": "Papelaria",
  "Embalagem": "Papelaria",
  "Embalagens": "Papelaria",
  "Corporativo & Utilitários": "Papelaria",
  "Papel & Cartonagem": "Papelaria",
  "Papéis e Cartões": "Papelaria",

  // --- Impressão 3D ---
  "Impressão 3D": "Impressão 3D",
  "Impressão 3D & Modelagem": "Impressão 3D",
  "Modelagem & Impressão 3D": "Impressão 3D",
  "Filamentos 3D": "Impressão 3D",
  "Filamento & Resina 3D": "Impressão 3D",

  // --- Serviços ---
  "Design & Criação": "Serviços",
  "Terceirizados": "Serviços",
  "Uso geral": "Serviços",

  /* Insumos não são categoria de venda: quem usa isso é o estoque,
     não a vitrine. Vão para Gráfica Rápida só para não ficarem órfãos. */
  "Consumíveis de Impressão": "Gráfica Rápida",
  "Tinta, Toner & DTF": "Gráfica Rápida",
};

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const antes = await c.query("select id, name, module from item_categories order by id");
console.log(`Categorias hoje: ${antes.rows.length}`);

const semDestino = antes.rows.filter((r) => !MAPA[r.name]);
if (semDestino.length) {
  console.log("\n⚠️  Sem destino definido (ficariam órfãs):");
  for (const r of semDestino) console.log(`   ${r.id} ${r.name}`);
  console.log("\nAbortado: complete o MAPA antes de aplicar.");
  await c.end();
  process.exit(1);
}

if (!APLICAR) {
  console.log("\n--- SIMULAÇÃO (nada foi gravado) ---\n");
  const porNova = {};
  for (const [velha, nova] of Object.entries(MAPA)) {
    (porNova[nova] ??= []).push(velha);
  }
  for (const [nome, desc] of NOVAS) {
    console.log(`${nome}  (${desc})`);
    for (const v of (porNova[nome] || []).sort()) console.log(`     <- ${v}`);
  }
  console.log(`\n${antes.rows.length} categorias -> ${NOVAS.length}`);
  console.log("\nPara aplicar: node scripts/limpar-categorias.mjs --aplicar");
  await c.end();
  process.exit(0);
}

await c.query("begin");
try {
  /* 1. Cria as 8 novas EM CADA MÓDULO que hoje tem categoria.
        A tabela é compartilhada por produtos, materiais, serviços,
        acabamentos e tabelas de preço, e cada um só enxerga o seu
        módulo — criar só um jogo de 8 deixaria os outros sem nada.
        Nome temporário para não colidir com os antigos. */
  const modulos = [...new Set(antes.rows.map((r) => r.module))];
  const idNova = {}; // `${modulo}|${nome}` -> id
  for (const modulo of modulos) {
    for (const [i, [nome]] of NOVAS.entries()) {
      const r = await c.query(
        `insert into item_categories (name, module, "order") values ($1, $2, $3) returning id`,
        [`__nova__${nome}`, modulo, i],
      );
      idNova[`${modulo}|${nome}`] = r.rows[0].id;
    }
  }

  /* 2. Remapeia TUDO que aponta para uma categoria antiga, sempre
        para a nova DO MESMO MÓDULO. */
  const paraNova = new Map(); // id velho -> id novo
  for (const r of antes.rows) {
    const nova = MAPA[r.name];
    paraNova.set(r.id, idNova[`${r.module}|${nova}`]);
  }

  const alvos = [
    ["products", "product_category_id"],
    ["materials", "category_id"],
    ["services", "category_id"],
    ["finishing_items", "category_id"],
    ["pricing_tables", "category_id"],
  ];
  for (const [tabela, coluna] of alvos) {
    for (const [velho, novo] of paraNova) {
      const r = await c.query(
        `update ${tabela} set ${coluna}=$1 where ${coluna}=$2`,
        [novo, velho],
      );
      if (r.rowCount) console.log(`   ${tabela}: ${r.rowCount} -> ${novo}`);
    }
  }

  /* 3. Solta os pais antes de apagar (hierarquia antiga morre junto). */
  await c.query("update item_categories set parent_id=null");

  /* 4. Apaga as antigas. */
  const del = await c.query(
    `delete from item_categories where id not in (${Object.values(idNova).join(",")})`,
  );
  console.log(`\nApagadas: ${del.rowCount}`);

  /* 5. Tira o prefixo temporário. */
  await c.query(
    `update item_categories set name = replace(name, '__nova__', '')`,
  );

  await c.query("commit");
  const fim = await c.query(
    `select module, count(*)::int n, string_agg(name, ', ' order by "order") nomes
     from item_categories group by module order by module`,
  );
  console.log("\n✅ Resultado por módulo:");
  for (const r of fim.rows) console.log(`   ${r.module.padEnd(14)} ${r.n}  ${r.nomes}`);
} catch (e) {
  await c.query("rollback");
  console.error("\n❌ Nada foi alterado:", e.message);
  process.exitCode = 1;
}
await c.end();
