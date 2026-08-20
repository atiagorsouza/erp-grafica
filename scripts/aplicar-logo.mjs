#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   Grava as logos da VTDIGITAL no Painel.

     node scripts/aplicar-logo.mjs             (mostra o que faria)
     node scripts/aplicar-logo.mjs --aplicar

   As três variantes vêm em `deploy/logos/` e são gravadas como data
   URI em `settings`, categoria `empresa`:

     company_logo       horizontal, para documentos e cabeçalho
     company_logo_dark  para fundo escuro (cupom do PDV, sidebar)
     company_logo_icon  quadrada, para favicon e miniatura

   Só grava onde está VAZIO. Logo já configurada pelo dono não é
   sobrescrita — use --forcar para trocar mesmo assim.

   Lembrete da v3.53.1: estas chaves NUNCA trafegam inteiras para o
   navegador. O servidor troca por "__SET__" e a imagem sai por
   /api/upload/logo. Foi o que derrubou a tela de configurações
   quando as logos tinham 2 MB cada.
   ────────────────────────────────────────────────────────────────── */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const AQUI = dirname(fileURLToPath(import.meta.url));
const APLICAR = process.argv.includes("--aplicar");
const FORCAR = process.argv.includes("--forcar");

/* Onde procurar: primeiro o pacote de deploy, depois a pasta solta do
   workspace (útil em desenvolvimento). */
const PASTAS = [join(AQUI, "..", "deploy", "logos"), join(AQUI, "..", "..", "logos")];

const LOGOS = [
  { chave: "company_logo",      arquivo: "logo-principal.png", desc: "horizontal (documentos)" },
  { chave: "company_logo_dark", arquivo: "logo-escuro.png",    desc: "fundo escuro (cupom)" },
  { chave: "company_logo_icon", arquivo: "logo-icone.png",     desc: "ícone quadrado" },
];

/* Teto de segurança. Acima disso a página de configurações fica
   pesada demais para o navegador — foi o bug da 3.53.1. */
const LIMITE_KB = 400;

async function achar(nome) {
  for (const p of PASTAS) {
    try {
      return { buf: await readFile(join(p, nome)), caminho: join(p, nome) };
    } catch { /* tenta a próxima */ }
  }
  return null;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  console.log("\n" + "═".repeat(62));
  console.log(`  LOGOS DA VTDIGITAL  ${APLICAR ? "(aplicando)" : "(simulação)"}`);
  console.log("═".repeat(62));

  const { rows } = await client.query(
    `SELECT key, coalesce(value,'') v FROM settings WHERE key = ANY($1)`,
    [LOGOS.map((l) => l.chave)]
  );
  const atual = new Map(rows.map((r) => [r.key, r.v]));

  let gravadas = 0;
  let mantidas = 0;

  for (const logo of LOGOS) {
    const tem = String(atual.get(logo.chave) ?? "").trim();

    if (tem && !FORCAR) {
      console.log(`  = ${logo.chave.padEnd(20)} já configurada (${Math.round(tem.length / 1024)} KB)`);
      mantidas++;
      continue;
    }

    const achou = await achar(logo.arquivo);
    if (!achou) {
      console.log(`  ! ${logo.chave.padEnd(20)} ${logo.arquivo} não encontrado`);
      continue;
    }

    const kb = Math.round(achou.buf.length / 1024);
    if (kb > LIMITE_KB) {
      console.log(`  ✖ ${logo.chave.padEnd(20)} ${kb} KB — acima do limite de ${LIMITE_KB} KB`);
      console.log(`     reduza a imagem antes; logo pesada trava a tela de configurações`);
      continue;
    }

    const dataUri = `data:image/png;base64,${achou.buf.toString("base64")}`;
    console.log(`  + ${logo.chave.padEnd(20)} ${logo.desc} · ${kb} KB`);
    gravadas++;

    if (APLICAR) {
      await client.query(
        `INSERT INTO settings (key, value, category) VALUES ($1, $2, 'empresa')
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [logo.chave, dataUri]
      );
    }
  }

  console.log("\n" + "  " + "─".repeat(58));
  if (APLICAR) {
    console.log(`✅ ${gravadas} logo(s) gravada(s)${mantidas ? `, ${mantidas} mantida(s)` : ""}.`);
    console.log("   Confira em Painel → Identidade da empresa.\n");
  } else {
    console.log("→ Simulação. Nada foi gravado.");
    console.log("→ Para aplicar: node scripts/aplicar-logo.mjs --aplicar\n");
  }
} catch (e) {
  console.error("\n✖ falhou:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
