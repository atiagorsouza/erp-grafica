#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   MIGRAÇÃO DE SCHEMA SEM TTY

     node scripts/migrar-banco.mjs             mostra o que falta
     node scripts/migrar-banco.mjs --aplicar   cria o que falta

   Por que existe: `drizzle-kit push` é interativo. Rodando por SSH
   dentro de um script, sem TTY, ele pode não concluir — e sai como se
   tivesse dado certo. Foi o que houve no deploy de 19/08/2026: o
   código da 3.54.0 subiu, as tabelas de campanha não foram criadas, e
   /api/campanhas passou a devolver 500 em produção.

   Este script não substitui o drizzle: ele confere o que o código
   precisa e cria só o que falta, com SQL explícito e idempotente.
   Roda em qualquer lugar, sem terminal interativo.

   Regra de ouro: só CRIA. Nunca apaga coluna, nunca dropa tabela,
   nunca altera tipo. Migração que destrói dado tem de ser decidida
   por gente, não por script de deploy.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const AQUI = dirname(fileURLToPath(import.meta.url));
const APLICAR = process.argv.includes("--aplicar");

/* O que o código da versão atual espera encontrar. */
const ESPERADO = {
  tabelas: [
    "campaigns",
    "campaign_targets",
    "registration_links",
    "message_templates",
    "whatsapp_mensagens",
    "whatsapp_conversas",
  ],
  colunas: [
    ["customers", "marketing_opt_in"],
    ["customers", "marketing_opt_in_at"],
    ["customers", "marketing_opt_in_source"],
    ["orders", "deposit_amount"],
    ["orders", "balance_amount"],
    ["products", "lead_time_creation"],
    ["products", "lead_time_production"],
    ["products", "lead_time_finishing"],
    ["products", "lead_time_serial"],
  ],
  enums: ["campaign_status", "campaign_target_status"],
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const q = async (sql, p = []) => (await client.query(sql, p)).rows;

try {
  const tabelas = new Set(
    (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).map((r) => r.tablename)
  );
  const colunas = new Set(
    (await q(
      `SELECT table_name||'.'||column_name AS c
         FROM information_schema.columns WHERE table_schema='public'`
    )).map((r) => r.c)
  );
  const enums = new Set((await q(`SELECT typname FROM pg_type WHERE typtype='e'`)).map((r) => r.typname));

  const faltaTabela = ESPERADO.tabelas.filter((t) => !tabelas.has(t));
  const faltaColuna = ESPERADO.colunas.filter(([t, c]) => tabelas.has(t) && !colunas.has(`${t}.${c}`));
  const faltaEnum = ESPERADO.enums.filter((e) => !enums.has(e));

  console.log("\n" + "═".repeat(62));
  console.log(`  SCHEMA DO BANCO  ${APLICAR ? "(aplicando)" : "(conferindo)"}`);
  console.log("═".repeat(62));
  console.log(`  ${tabelas.size} tabelas · ${enums.size} tipos`);

  if (!faltaTabela.length && !faltaColuna.length && !faltaEnum.length) {
    console.log("\n  ✔ Banco em dia — nada a fazer.\n");
    process.exit(0);
  }

  console.log("\n  FALTANDO:");
  for (const e of faltaEnum) console.log(`   · tipo    ${e}`);
  for (const t of faltaTabela) console.log(`   · tabela  ${t}`);
  for (const [t, c] of faltaColuna) console.log(`   · coluna  ${t}.${c}`);

  if (!APLICAR) {
    console.log("\n→ Nada foi alterado.");
    console.log("→ Para aplicar: node scripts/migrar-banco.mjs --aplicar\n");
    process.exit(0);
  }

  /* O SQL vive num .sql ao lado — assim dá para revisar e aplicar à
     mão com psql, se preferir. */
  const sql = await readFile(join(AQUI, "migrar-campanhas.sql"), "utf8");
  console.log("\n  aplicando migrar-campanhas.sql…");
  await client.query(sql);

  /* Reconfere: dizer "pronto" sem verificar foi exatamente o erro que
     nos trouxe até aqui. */
  const tab2 = new Set(
    (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).map((r) => r.tablename)
  );
  const col2 = new Set(
    (await q(
      `SELECT table_name||'.'||column_name AS c
         FROM information_schema.columns WHERE table_schema='public'`
    )).map((r) => r.c)
  );

  const aindaFalta = [
    ...ESPERADO.tabelas.filter((t) => !tab2.has(t)).map((t) => `tabela ${t}`),
    ...ESPERADO.colunas
      .filter(([t, c]) => tab2.has(t) && !col2.has(`${t}.${c}`))
      .map(([t, c]) => `coluna ${t}.${c}`),
  ];

  if (aindaFalta.length) {
    console.log("\n  ✖ Ainda faltando (o SQL não cobre tudo):");
    for (const x of aindaFalta) console.log(`   · ${x}`);
    console.log("\n     Rode `npx drizzle-kit push --force` num terminal interativo.\n");
    process.exitCode = 1;
  } else {
    console.log("\n  ✔ Schema sincronizado.\n");
  }
} catch (e) {
  console.error("\n✖ falhou:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
