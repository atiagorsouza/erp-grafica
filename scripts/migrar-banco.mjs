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

   ── v3.59.1: a lista deixou de ser escrita à mão ──
   Até aqui, "o que o banco precisa ter" era um array digitado neste
   arquivo. Funcionava enquanto alguém lembrasse de atualizá-lo. Não
   lembrou: a v3.58.1 criou `item_categories.parent_id` para as
   subcategorias, ninguém anotou aqui, o deploy passou limpo e o /pdv
   respondeu HTTP 500 até a coluna ser criada à mão. Mesmo padrão nos
   três updates anteriores.

   Agora o esperado é DERIVADO do próprio `src/db/schema.ts`, via
   `scripts/schema-dump.mts`. Se está no código, é conferido — sem
   depender da memória de ninguém.

   Regra de ouro: só CRIA. Nunca apaga coluna, nunca dropa tabela,
   nunca altera tipo. Migração que destrói dado tem de ser decidida
   por gente, não por script de deploy.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const APLICAR = process.argv.includes("--aplicar");

/* ── 1. O que o CÓDIGO espera ────────────────────────────────────
   Lido do schema Drizzle, não de uma lista digitada. */
function lerSchemaDoCodigo() {
  /* `tsx` é devDependency: em produção com --omit=dev ele some. Nesse
     caso caímos no `npx`, que baixa sob demanda. Se nem isso houver
     (servidor sem rede), quem chama decide o que fazer — não vamos
     derrubar um deploy por causa da ferramenta de leitura. */
  const local = join(RAIZ, "node_modules", ".bin", "tsx");
  const tentativas = existsSync(local)
    ? [[local, [join(AQUI, "schema-dump.mts")]]]
    : [
        ["npx", ["--yes", "tsx", join(AQUI, "schema-dump.mts")]],
      ];

  let ultimoErro;
  for (const [cmd, args] of tentativas) {
    try {
      return JSON.parse(
        execFileSync(cmd, args, {
          cwd: RAIZ,
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        })
      );
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro;
}

/* Nome de identificador vindo do schema: citamos sempre, porque há
   colunas com nome reservado ("order") e o SQL sem aspas quebra. */
const id = (s) => `"${String(s).replace(/"/g, '""')}"`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = async (sql, p = []) => (await client.query(sql, p)).rows;

/* ── SEED de unidade de venda (PEÇA 0 do PLANO-PORTAL-CLIENTE) ──
   A família de adesivos (ADES-%) vende por CARTELA — o próprio dono
   escreveu na descrição de cada produto: "Vendido por CARTELA com
   60 adesivos". A cartela desses produtos É a folha A4, por isso o
   seed copia pieces_per_sheet. Só preenche NULL: editou no
   formulário, este script nunca mais toca no valor.

   Chamada nos DOIS caminhos: banco em dia (coluna já existia) e
   coluna recém-criada acima — por isso virou função, não bloco. */
async function semearUnidadeVenda() {
  const temColuna =
    (
      await q(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name='products' AND column_name='sale_unit_label'`
      )
    ).length > 0;
  if (!temColuna) {
    console.log("   ⚠ seed de cartela adiado: coluna sale_unit_label não existe no banco");
    return;
  }
  const seed = await client.query(
    `UPDATE products SET sale_unit_label='cartela', sale_unit_pieces=pieces_per_sheet
      WHERE sku LIKE 'ADES-%' AND calculation_mode='batch'
        AND sale_unit_label IS NULL AND pieces_per_sheet > 0`
  );
  if (seed.rowCount > 0) {
    console.log(`   ~ seed    ${seed.rowCount} adesivo(s): venda por cartela`);
  }
}

/* ── CONFIG: URL pública do app (v3.68.2) ──────────────────────────
   O dono já tem o túnel no ar (app.vtdigital.site). Sem este valor,
   o checkout da InfinitePay não envia redirect_url/webhook_url e o
   cliente fica preso na tela de pagamento após pagar.

   Só preenche VAZIO — valor definido a mão no Painel nunca é
   sobrescrito. A InfiniteTag (handle) NÃO é tocada: é credencial do
   dono, configurada no Painel de Controle. */
async function preencherUrlPublica() {
  const r = await client.query(
    `UPDATE settings SET value='https://app.vtdigital.site'
      WHERE key='app_base_url'
        AND (value IS NULL OR btrim(value) = '')`
  );
  if (r.rowCount > 0) {
    console.log("   ~ config   app_base_url preenchido: https://app.vtdigital.site");
  }
}

try {
  let esperado;
  try {
    esperado = lerSchemaDoCodigo();
  } catch (e) {
    console.error("\n✖ não consegui ler src/db/schema.ts:", e.message);
    console.error("  (as dependências de desenvolvimento estão instaladas?");
    console.error("   rode: NODE_ENV=development npm install --include=dev)\n");
    process.exit(1);
  }

  const tabelas = new Set(
    (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).map((r) => r.tablename)
  );
  const colunas = new Set(
    (
      await q(
        `SELECT table_name||'.'||column_name AS c
           FROM information_schema.columns WHERE table_schema='public'`
      )
    ).map((r) => r.c)
  );
  const enums = new Set((await q(`SELECT typname FROM pg_type WHERE typtype='e'`)).map((r) => r.typname));

  /* Nem tudo que o código usa está no Drizzle: `whatsapp_mensagens` e
     `whatsapp_conversas` nascem em `migrar-campanhas.sql`, em SQL puro.
     Derivar SÓ do schema perdia essas duas — o /whatsapp quebrava com
     "relation does not exist" e este script ainda dizia "banco em dia".
     Então unimos as duas fontes: o schema Drizzle E os CREATE TABLE do
     .sql. */
  const doSql = new Set(
    [...(await readFile(join(AQUI, "migrar-campanhas.sql"), "utf8"))
      .matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi)]
      .map((m) => m[1])
  );

  const todasEsperadas = new Set([...Object.keys(esperado.tabelas), ...doSql]);

  const faltaEnum = Object.keys(esperado.enums).filter((e) => !enums.has(e));
  const faltaTabela = [...todasEsperadas].filter((t) => !tabelas.has(t));
  /* Coluna só é "faltante" se a TABELA já existe. Se a tabela inteira
     falta, ela nasce completa no CREATE — listar as colunas junto só
     polui o relatório. */
  const faltaColuna = [];
  for (const [tab, cols] of Object.entries(esperado.tabelas)) {
    if (!tabelas.has(tab)) continue;
    for (const c of cols) {
      if (!colunas.has(`${tab}.${c.nome}`)) faltaColuna.push([tab, c]);
    }
  }

  console.log("\n" + "═".repeat(62));
  console.log(`  SCHEMA DO BANCO  ${APLICAR ? "(aplicando)" : "(conferindo)"}`);
  console.log("═".repeat(62));
  console.log(`  banco: ${tabelas.size} tabelas · ${enums.size} tipos`);
  console.log(
    `  código: ${Object.keys(esperado.tabelas).length} tabelas · ${Object.keys(esperado.enums).length} tipos`
  );

  if (!faltaTabela.length && !faltaColuna.length && !faltaEnum.length) {
    console.log("\n  ✔ Banco em dia — nada a criar.");
    /* Nada faltando no schema não significa nada a fazer: o seed de
       unidade de venda roda mesmo com banco em dia (é dado, não é
       coluna). Sem isso, um banco que já tem as colunas por outro
       caminho nunca recebia o seed. */
    if (APLICAR) {
      await semearUnidadeVenda();
      await preencherUrlPublica();
    }
    else {
      console.log("\n→ Nada foi alterado.");
      console.log("→ Para aplicar: node scripts/migrar-banco.mjs --aplicar\n");
    }
    process.exit(0);
  }

  console.log("\n  FALTANDO:");
  for (const e of faltaEnum) console.log(`   · tipo    ${e}`);
  for (const t of faltaTabela) console.log(`   · tabela  ${t}`);
  for (const [t, c] of faltaColuna) console.log(`   · coluna  ${t}.${c.nome}  (${c.sqlType})`);

  /* Tabela inteira faltando é caso de drizzle-kit: montar CREATE TABLE
     à mão aqui seria reimplementar o gerador, e errado. Colunas e
     tipos, sim, sabemos criar com segurança. */
  const semReceita = faltaTabela.filter((t) => !doSql.has(t));
  if (semReceita.length) {
    console.log("\n  ⚠ Há TABELAS faltando que este script não sabe criar:");
    for (const t of semReceita) console.log(`     · ${t}`);
    console.log("    Rode antes:  npx drizzle-kit push --force");
  }

  if (!APLICAR) {
    console.log("\n→ Nada foi alterado.");
    console.log("→ Para aplicar: node scripts/migrar-banco.mjs --aplicar\n");
    process.exit(0);
  }

  /* ── 2. Aplicar: tipos primeiro, depois colunas ────────────────
     Ordem importa: uma coluna de tipo enum não pode ser criada antes
     do CREATE TYPE dela. */
  const feitos = [];

  /* Se falta alguma tabela que o .sql sabe criar, roda o .sql. Ele é
     todo IF NOT EXISTS, então é seguro repetir. */
  if (faltaTabela.some((t) => doSql.has(t))) {
    console.log("\n  aplicando migrar-campanhas.sql…");
    await client.query(await readFile(join(AQUI, "migrar-campanhas.sql"), "utf8"));
    for (const t of faltaTabela.filter((x) => doSql.has(x))) {
      feitos.push(`tabela ${t}`);
      console.log(`   + tabela  ${t}`);
    }
  }

  /* O .sql também cria tipos e colunas por conta própria. Reconferimos
     o banco AGORA, depois dele: emitir `CREATE TYPE` para algo que ele
     acabou de criar aborta tudo com "already exists". */
  const enumAgora = new Set(
    (await q(`SELECT typname FROM pg_type WHERE typtype='e'`)).map((r) => r.typname)
  );
  const colAgora = new Set(
    (
      await q(
        `SELECT table_name||'.'||column_name AS c
           FROM information_schema.columns WHERE table_schema='public'`
      )
    ).map((r) => r.c)
  );
  const tabAgora = new Set(
    (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).map((r) => r.tablename)
  );

  for (const nome of faltaEnum.filter((e) => !enumAgora.has(e))) {
    const valores = esperado.enums[nome].map((v) => `'${String(v).replace(/'/g, "''")}'`).join(", ");
    const sql = `CREATE TYPE ${id(nome)} AS ENUM (${valores})`;
    await client.query(sql);
    feitos.push(`tipo ${nome}`);
    console.log(`   + tipo    ${nome}`);
  }

  /* Idem para as colunas: o .sql pode ter criado as que faltavam, e
     tabelas recém-criadas por ele já nascem completas. */
  const colunasPendentes = faltaColuna.filter(
    ([tab, c]) => tabAgora.has(tab) && !colAgora.has(`${tab}.${c.nome}`)
  );

  for (const [tab, c] of colunasPendentes) {
    /* NOT NULL sem default numa tabela que já tem linhas é rejeitado
       pelo Postgres — e forçar um default inventado corromperia dado
       real. Nesses casos criamos a coluna anulável e avisamos. */
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${id(tab)}`);
    const vazia = rows[0].n === 0;
    const podeNotNull = c.notNull && (vazia || c.temDefault);

    let sql = `ALTER TABLE ${id(tab)} ADD COLUMN IF NOT EXISTS ${id(c.nome)} ${c.sqlType}`;
    if (podeNotNull) sql += " NOT NULL";
    if (c.referencia) {
      sql += ` REFERENCES ${id(c.referencia.tabela)}(${id(c.referencia.coluna)})`;
      if (c.referencia.onDelete) sql += ` ON DELETE ${c.referencia.onDelete.toUpperCase()}`;
    }

    await client.query(sql);
    feitos.push(`coluna ${tab}.${c.nome}`);
    console.log(`   + coluna  ${tab}.${c.nome}`);
    if (c.notNull && !podeNotNull) {
      console.log(
        `     ⚠ criada ANULÁVEL: o código pede NOT NULL, mas ${tab} já tem ${rows[0].n} linha(s)`
      );
      console.log(`       preencha os valores e rode: ALTER TABLE ${id(tab)} ALTER COLUMN ${id(c.nome)} SET NOT NULL;`);
    }
  }

  /* ── SEED de unidade de venda (PEÇA 0 do PLANO-PORTAL-CLIENTE) ──
     A família de adesivos (ADES-%) vende por CARTELA — o próprio dono
     escreveu na descrição de cada produto: "Vendido por CARTELA com
     60 adesivos". A cartela desses produtos É a folha A4, por isso o
     seed copia pieces_per_sheet. Só preenche NULL: editou no
     formulário, este script nunca mais toca no valor. */
  await semearUnidadeVenda();
  await preencherUrlPublica();

  /* ── 3. Reconferir ────────────────────────────────────────────
     Dizer "pronto" sem verificar foi exatamente o erro que nos
     trouxe até aqui. */
  const tab2 = new Set(
    (await q(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).map((r) => r.tablename)
  );
  const col2 = new Set(
    (
      await q(
        `SELECT table_name||'.'||column_name AS c
           FROM information_schema.columns WHERE table_schema='public'`
      )
    ).map((r) => r.c)
  );
  const enum2 = new Set((await q(`SELECT typname FROM pg_type WHERE typtype='e'`)).map((r) => r.typname));

  const aindaFalta = [
    ...Object.keys(esperado.enums).filter((e) => !enum2.has(e)).map((e) => `tipo ${e}`),
    ...[...todasEsperadas].filter((t) => !tab2.has(t)).map((t) => `tabela ${t}`),
    ...Object.entries(esperado.tabelas).flatMap(([t, cols]) =>
      tab2.has(t) ? cols.filter((c) => !col2.has(`${t}.${c.nome}`)).map((c) => `coluna ${t}.${c.nome}`) : []
    ),
  ];

  console.log(`\n  ${feitos.length} objeto(s) criado(s).`);

  if (aindaFalta.length) {
    console.log("\n  ✖ Ainda faltando:");
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
