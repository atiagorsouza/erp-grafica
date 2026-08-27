#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   agente-verificar.mjs — radar de atualização para o agente do SERVIDOR

   Uso:      node scripts/agente-verificar.mjs
   Natureza: SOMENTE LEITURA (um SELECT no banco; nada é gravado)

   Compara a versão instalada (settings.app_version) com a do código
   (VERSION) e lista os boletins UPDATES/*.md pendentes, na ordem.
   Faz parte do protocolo do AGENTE-SERVIDOR.md (§2).
   ────────────────────────────────────────────────────────────────── */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

/* Versão do código (fonte da verdade da casa). */
const repoVersion = readFileSync(join(RAIZ, "VERSION"), "utf8")
  .trim()
  .split("\n")[0]
  .trim();

/* ── versão instalada no banco ─────────────────────────────────── */
let installed = null;
let bancoOk = true;
if (!process.env.DATABASE_URL) {
  bancoOk = false;
  console.log("! DATABASE_URL ausente no ambiente — impossível ler a versão instalada.");
  console.log("  O update exige .env na raiz (regra §6.6 do AGENTE-SERVIDOR.md).");
} else {
  try {
    const pg = (await import("pg")).default;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const { rows } = await client.query(
      "select value from settings where key='app_version' limit 1"
    );
    installed = rows[0]?.value?.trim() || null;
    await client.end();
  } catch (e) {
    bancoOk = false;
    console.log(`! Banco não respondeu: ${e.message}`);
    console.log("  Banco inalcançável ANTES de atualizar é incidente, não etapa —");
    console.log("  resolva primeiro (docs/SOCORRO-SITE-FORA.md).");
  }
}

/* Sem carimbo nunca gravado (ex.: instalação antiga): o check-version
   grava sozinho na próxima execução — é seguro e aditivo. */
if (bancoOk && installed === null) {
  console.log("! Banco sem settings.app_version (nunca carimbado).");
  console.log("  Rode `node scripts/check-version.mjs` para carimbar pela primeira vez.");
}

/* ── comparação semântica simples ──────────────────────────────── */
const semver = (v) => String(v || "0").split("-")[0].split(".").map(Number);
const cmp = (a, b) => {
  const A = semver(a), B = semver(b);
  for (let i = 0; i < 3; i++) {
    if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
  }
  return 0;
};

/* ── boletins UPDATES/ mais novos que o instalado ──────────────── */
const dirUpdates = join(RAIZ, "UPDATES");
const todos = existsSync(dirUpdates)
  ? readdirSync(dirUpdates)
      .filter((f) => /^\d+\.\d+\.\d+[-0-9A-Za-z.]*\.md$/.test(f))
      .map((f) => f.replace(/\.md$/, ""))
      .sort(cmp)
  : [];

const base = installed || "0.0.0";
const pendentes = todos.filter((v) => cmp(v, base) > 0);
const codeBehind = cmp(repoVersion, base) < 0; // banco na frente do código?

const lerMeta = (v) => {
  try {
    const txt = readFileSync(join(RAIZ, "UPDATES", `${v}.md`), "utf8");
    const meta = {};
    for (const linha of txt.split("---")[1]?.split("\n") || []) {
      const m = linha.match(/^(\w+):\s*(.+)$/);
      if (m) meta[m[1]] = m[2].split("#")[0].trim();
    }
    return meta;
  } catch {
    return {};
  }
};

/* ── relatório ──────────────────────────────────────────────────── */
console.log("\n🤖 Agente do servidor — verificação de atualização");
console.log("─".repeat(58));
console.log(`Código no repositório (VERSION): ${repoVersion}`);
console.log(`Instalado no banco:              ${installed ?? "(sem carimbo)"}`);
console.log("─".repeat(58));

if (codeBehind) {
  console.log("⚠ BANCO NA FRENTE DO CÓDIGO — alguém voltou o código sem voltar o");
  console.log("  banco (ou carimbou errado). Não atualize; reporte ao dono.");
} else if (pendentes.length === 0 && installed && cmp(repoVersion, installed) === 0) {
  console.log("✅ ATUALIZADO — produção na mesma versão do repositório.");
} else if (pendentes.length > 0) {
  console.log(`⏳ DESATUALIZADO — ${pendentes.length} versão(ões) pendente(s).`);
  console.log("\nBoletins a ler, NA ORDEM (migração / reseed):");
  for (const v of pendentes) {
    const m = lerMeta(v);
    console.log(`  ${v} — mig.banco: ${m.migracao_banco || "?"} · reseed: ${m.reseed || "nunca"} · ${m.data || ""}`);
  }
  console.log("\nFluxo (AGENTE-SERVIDOR.md §4 — não pule etapas):");
  console.log("  git pull origin main");
  console.log("  bash scripts/update.sh");
  console.log("  pm2 restart <nome>            # ou: bash scripts/start.sh");
  console.log("  set -a; source .env; set +a && npm run e2e:smoke");
  console.log("  node scripts/check-version.mjs");
  console.log("  node scripts/agente-verificar.mjs   # deve dizer ATUALIZADO");
} else {
  console.log("ℹ Sem boletins pendentes no momento.");
}

console.log("\nRegras que valem sempre: AGENTE-SERVIDOR.md (raiz do repo).\n");
