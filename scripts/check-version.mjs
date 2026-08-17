#!/usr/bin/env node
/**
 * Valida a integridade do versionamento:
 *   1. arquivo VERSION (fonte da verdade)
 *   2. src/lib/version.ts (exibido na UI / API)
 *   3. package.json (metadados de release)
 *   4. versão gravada no banco (settings.app_version) — quando o banco existe
 *
 * Sai com código 1 se houver divergência, exceto com --fix
 * (reescreve package.json e o banco a partir do VERSION).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import "dotenv/config";

const fix = process.argv.includes("--fix");

const readVersionFile = () => readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim().split("\n")[0].trim();
const die = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

const version = readVersionFile();
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) die(`VERSION inválido: "${version}"`);

/* 1. src/lib/version.ts */
const versionFile = new URL("../src/lib/version.ts", import.meta.url);
const src = readFileSync(versionFile, "utf8");
const declared = src.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (declared !== version) {
  if (!fix) die(`src/lib/version.ts está em ${declared}, VERSION é ${version}. Rode: npm run release -- ${version}`);
  writeFileSync(versionFile, src.replace(/APP_VERSION\s*=\s*"[^"]+"/, `APP_VERSION = "${version}"`));
  console.log(`↻ src/lib/version.ts atualizado para ${version}`);
}

/* 2. package.json */
const pkgPath = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (pkg.version !== version) {
  if (!fix) die(`package.json está em ${pkg.version}, VERSION é ${version}.`);
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`↻ package.json atualizado para ${version}`);
}

/* 3. CHANGELOG.md */
const changelog = new URL("../CHANGELOG.md", import.meta.url);
if (existsSync(changelog) && !readFileSync(changelog, "utf8").includes(`## [${version}]`)) {
  if (!fix) die(`CHANGELOG.md não possui entrada para [${version}]. Rode: npm run release`);
  console.log(`! CHANGELOG.md sem entrada para ${version} — adicione manualmente`);
}

/* 4. banco de dados */
if (process.env.DATABASE_URL) {
  try {
    const out = execFileSync(
      "psql",
      [process.env.DATABASE_URL, "-qAt", "-c", "select value from settings where key='app_version' limit 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    if (out && out !== version) {
      if (!fix) die(`Banco gravado em ${out}, VERSION é ${version}. Rode scripts/update.sh ou --fix`);
      execFileSync("psql", [
        process.env.DATABASE_URL, "-qAt", "-c",
        "insert into settings (key,value,category) values ('app_version','" + version + "','sistema') " +
        "on conflict (key) do update set value=excluded.value, updated_at=now()",
      ], { stdio: "ignore" });
      console.log(`↻ settings.app_version atualizado para ${version}`);
    }
  } catch {
    /* banco ausente/indisponível — validação de banco é opcional */
  }
}

console.log(`✔ Versionamento consistente: v${version}`);
