#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   GERA O SQL DE SCHEMA PARA APLICAR NO SERVIDOR

     node scripts/gerar-schema-sql.mjs

   Produz `schema-update.sql`: cria as tabelas, colunas e tipos que
   faltam, sem tocar em nada que já exista.

   POR QUE EXISTE
   O caminho documentado era `npx drizzle-kit push --force`. No
   servidor do dono isso falhou:

       Error: Interactive prompts require a TTY terminal

   O drizzle-kit pede confirmação interativa, e o painel do servidor
   não oferece terminal de verdade. Sem alternativa, as tabelas foram
   criadas à mão — e foi aí que o deploy descarrilhou.

   Este script tira o drizzle-kit do caminho: o SQL sai pronto daqui,
   já conferido, e no servidor é só um `psql -f`.

   REGRA: só CRIA. Nunca dropa tabela, nunca apaga coluna, nunca
   altera tipo. Tudo com IF NOT EXISTS — rodar duas vezes não faz mal.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "schema-update.sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}
const db = new pg.Client({ connectionString: url });
await db.connect();
const q = (sql, p = []) => db.query(sql, p).then((r) => r.rows);

const partes = [];
partes.push(`-- ==================================================================
-- ATUALIZAÇÃO DE SCHEMA — VTDIGITAL
-- Gerado em ${new Date().toISOString()}
--
-- Cria o que falta. Não apaga nada, não altera tipo de coluna.
-- Pode rodar mais de uma vez sem problema.
--
--   psql -U postgres -d app_db -f schema-update.sql
-- ==================================================================

begin;
`);

/* ── TIPOS (enums) ── */
const tipos = await q(`
  select t.typname, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) vals
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
   group by t.typname order by t.typname`);

partes.push("-- ── tipos ──");
for (const t of tipos) {
  /* CREATE TYPE não aceita IF NOT EXISTS; o bloco resolve. */
  partes.push(`do $$ begin
  create type public.${t.typname} as enum (${t.vals});
exception when duplicate_object then null; end $$;`);
}

/* ── TABELAS E COLUNAS ── */
const tabelas = await q(`
  select table_name from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
   order by table_name`);

partes.push("\n-- ── tabelas ──");
let nTab = 0;
let nCol = 0;

for (const { table_name: tab } of tabelas) {
  const cols = await q(
    `select column_name, data_type, udt_name, character_maximum_length,
            numeric_precision, numeric_scale, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [tab]
  );

  /** Tipo SQL de uma coluna, como o Postgres o devolveria. */
  const tipoDe = (c) => {
    if (c.data_type === "USER-DEFINED") return `public.${c.udt_name}`;
    if (c.data_type === "ARRAY") return `${c.udt_name.replace(/^_/, "")}[]`;
    if (c.data_type === "character varying") {
      return c.character_maximum_length ? `varchar(${c.character_maximum_length})` : "varchar";
    }
    if (c.data_type === "numeric" && c.numeric_precision) {
      return `numeric(${c.numeric_precision}, ${c.numeric_scale})`;
    }
    if (c.data_type === "timestamp without time zone") return "timestamp";
    if (c.data_type === "timestamp with time zone") return "timestamptz";
    return c.data_type;
  };

  /* Coluna que usa nextval() de uma sequência PRÓPRIA da tabela é um
     `serial` — e a sequência ainda não existe no destino. Emitir
     `default nextval('sellers_id_seq')` quebra com "relation does not
     exist". A forma correta é declarar serial e deixar o Postgres
     criar a sequência junto. */
  const ehSerial = (c) =>
    c.column_default && new RegExp(`nextval\\('"?${tab}_${c.column_name}_seq`).test(c.column_default);

  const tipoSerial = (c) =>
    c.data_type === "bigint" ? "bigserial" : c.data_type === "smallint" ? "smallserial" : "serial";

  /* CREATE TABLE completo — só age se a tabela não existir. */
  const defs = cols.map((c) => {
    if (ehSerial(c)) return `  "${c.column_name}" ${tipoSerial(c)}`;
    let d = `  "${c.column_name}" ${tipoDe(c)}`;
    if (c.column_default) d += ` default ${c.column_default}`;
    if (c.is_nullable === "NO") d += " not null";
    return d;
  });
  const pk = await q(
    `select kcu.column_name
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name
      where tc.table_schema='public' and tc.table_name=$1
        and tc.constraint_type='PRIMARY KEY'
      order by kcu.ordinal_position`,
    [tab]
  );
  if (pk.length) {
    defs.push(`  primary key (${pk.map((k) => `"${k.column_name}"`).join(", ")})`);
  }

  partes.push(`\ncreate table if not exists public.${tab} (\n${defs.join(",\n")}\n);`);
  nTab++;

  /* ALTER para quem já tem a tabela mas não a coluna. É o caso real
     do servidor: `customers` existe, `document_waiver_reason` não. */
  for (const c of cols) {
    /* A chave primária serial já nasce com o CREATE TABLE acima. Um
       ALTER para ela só repetiria o nextval de uma sequência que
       pode não existir. */
    if (ehSerial(c)) continue;
    let linha = `alter table public.${tab} add column if not exists "${c.column_name}" ${tipoDe(c)}`;
    if (c.column_default) linha += ` default ${c.column_default}`;
    partes.push(linha + ";");
    nCol++;
  }
}

/* ── ÍNDICES ÚNICOS ── o sistema depende deles para barrar duplicata */
const idx = await q(`
  select indexdef from pg_indexes
   where schemaname = 'public' and indexdef ilike '%unique%'
   order by indexname`);
partes.push("\n-- ── índices únicos ──");
for (const i of idx) {
  partes.push(
    i.indexdef.replace(/^CREATE UNIQUE INDEX /i, "create unique index if not exists ") + ";"
  );
}

partes.push(`
commit;

-- ${nTab} tabela(s) e ${nCol} coluna(s) conferidas.`);

await writeFile(SAIDA, partes.join("\n"), "utf8");
console.log(`\n  ✔ ${nTab} tabelas · ${nCol} colunas · ${tipos.length} tipos`);
console.log(`    schema-update.sql\n`);
await db.end();
