#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   EXPORTA A BASE CURADA (o "miolo" do sistema)

     node scripts/exportar-base-curada.mjs

   Gera `base-curada.sql`, que carrega num banco limpo tudo o que foi
   CONFIGURADO — e nada do que foi apenas movimentado.

   VAI:  configurações do painel, categorias, impressoras e seus
         consumíveis, formatos, serviços, materiais reais (a contagem
         física do dono) e os produtos com suas faixas de preço.

   NÃO VAI: clientes, orçamentos, pedidos, vendas, lançamentos
         financeiros, movimentos de estoque, compras, kanban, leads.
         Isso é histórico — cada instalação tem o seu.

   Por que existe: o servidor do dono está com a base de demonstração
   (produtos fictícios, 439 vendas inventadas). Em vez de limpar item a
   item por lá, exporta-se daqui o que presta e substitui-se tudo.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "base-curada.sql");

/* Ordem importa: pai antes de filho, senão a chave estrangeira falha.
   `filtro` limita o que sai — materiais só os reais, por exemplo. */
const TABELAS = [
  { nome: "settings", desc: "configurações do painel" },
  { nome: "item_categories", desc: "categorias e subcategorias" },
  { nome: "material_categories", desc: "categorias de material", opcional: true },
  { nome: "printer_categories", desc: "categorias de impressão" },
  { nome: "printers", desc: "parque gráfico" },
  { nome: "printer_consumables", desc: "tintas e desgaste" },
  { nome: "print_formats", desc: "formatos de papel" },
  { nome: "services", desc: "serviços e acabamentos" },
  { nome: "finishings", desc: "acabamentos", opcional: true },
  { nome: "pricing_tables", desc: "tabelas de preço de insumo" },
  {
    nome: "suppliers",
    desc: "fornecedores",
    /* O smoke cria fornecedor a cada rodada; sem o filtro a base
       curada levaria 62 "E2E Fornecedor 178743..." para o servidor. */
    filtro: `name !~ '^(ZZ|E2E|SMOKE|TESTE)'`,
  },
  {
    nome: "materials",
    desc: "materiais (só a contagem real)",
    filtro: `notes like 'Contagem do dono%' or name like '%recorte 30cm%'`,
  },
  { nome: "products", desc: "produtos" },
  { nome: "product_materials", desc: "receita dos produtos", opcional: true },
  { nome: "product_finishings", desc: "acabamentos dos produtos", opcional: true },
  { nome: "product_price_tiers", desc: "faixas de preço por quantidade" },
  /* A base de exemplo (4 clientes, 4 orçamentos, 4 pedidos) vai junto:
     é pequena, mostra o sistema funcionando e o dono apaga em quatro
     cliques quando começar a usar de verdade. */
  { nome: "customers", desc: "clientes de exemplo" },
  { nome: "quotes", desc: "orçamentos de exemplo" },
  { nome: "quote_items", desc: "itens dos orçamentos" },
  { nome: "orders", desc: "pedidos de exemplo" },
  { nome: "message_templates", desc: "modelos de mensagem", opcional: true },
  { nome: "commemorative_dates", desc: "calendário comercial", opcional: true },
];

/* Limpas no destino antes da carga. Da folha para a raiz. */
const LIMPAR = [
  "quote_items", "quotes",
  "deliveries", "art_approvals", "production_schedules",
  "kanban_cards", "orders",
  "sales",
  "transactions",
  "stock_movements", "purchase_items", "purchases",
  "crm_activities", "crm_leads",
  "registration_links",
  "customers",
  "product_price_tiers", "product_finishings", "product_materials", "products",
  "printer_consumables", "print_formats", "printers", "printer_categories",
  "pricing_tables", "finishings", "services",
  "materials", "material_categories",
  "item_categories",
  "message_templates", "commemorative_dates",
  "settings",
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}
const db = new pg.Client({ connectionString: url });
await db.connect();

/** Existe mesmo? Tabela opcional some entre versões. */
async function existe(t) {
  const { rows } = await db.query(`select to_regclass($1) as r`, [`public.${t}`]);
  return !!rows[0].r;
}

/** Literal SQL de um valor, respeitando o tipo do Postgres. */
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v) || typeof v === "object") {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

const partes = [];
partes.push(`-- ==================================================================
-- BASE CURADA — VTDIGITAL
-- Gerado em ${new Date().toISOString()}
--
-- Carrega a CONFIGURAÇÃO do sistema: painel, categorias, parque
-- gráfico, materiais conferidos e produtos com preço.
--
-- APAGA TUDO no destino: movimento e clientes. Deixa a base de
-- exemplo (4 clientes, 4 orçamentos, 4 pedidos).
--
-- Rode sempre pelo instalar-base-curada.sh, que faz backup antes.
-- ==================================================================

begin;

-- ── limpeza ──`);

for (const t of LIMPAR) {
  if (await existe(t)) partes.push(`delete from ${t};`);
}

partes.push(`
-- ── carga ──`);

let total = 0;
for (const { nome, desc, filtro, opcional } of TABELAS) {
  if (!(await existe(nome))) {
    if (!opcional) console.warn(`  ! tabela ${nome} não existe — pulada`);
    continue;
  }
  const where = filtro ? ` where ${filtro}` : "";
  const { rows } = await db.query(`select * from ${nome}${where} order by id`);
  if (!rows.length) {
    console.log(`  · ${nome}: vazia`);
    continue;
  }
  const cols = Object.keys(rows[0]);
  partes.push(`\n-- ${desc} (${rows.length})`);
  for (const r of rows) {
    const vals = cols.map((c) => lit(r[c])).join(", ");
    partes.push(
      `insert into ${nome} (${cols.map((c) => `"${c}"`).join(", ")}) values (${vals});`
    );
  }
  /* A sequência precisa acompanhar, senão o próximo insert pela tela
     colide com um id já usado. */
  if (cols.includes("id")) {
    partes.push(
      `select setval(pg_get_serial_sequence('${nome}','id'), coalesce((select max(id) from ${nome}), 1), true);`
    );
  }
  console.log(`  + ${nome}: ${rows.length} registro(s) — ${desc}`);
  total += rows.length;
}

partes.push(`
commit;

-- ${total} registros carregados.`);

await writeFile(SAIDA, partes.join("\n"), "utf8");
console.log(`\n  ✔ ${total} registros em base-curada.sql\n`);
await db.end();
