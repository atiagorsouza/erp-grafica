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
  /* ANTES da v3.69.2 esta etapa chamava o BINÁRIO `psql` e engolia
     qualquer falha (inclusive psql ausente) em silêncio — o banco
     ficava sem carimbo e o script ainda dizia "consistente"
     (fio pendente anotado em ONDE-ESTAMOS.md, 3.68.2).

     Agora usa o MESMO driver `pg` da aplicação: se o DATABASE_URL
     aponta para um banco que o app alcança, o check alcança também.
     E falha de conexão passou a ser ERRO BARULHENTO — banco
     inalcançável com DATABASE_URL configurado não é "opcional",
     é sintoma de incidente (ver docs/INCIDENTE-DEPLOY-3.68.3.md). */
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "select value from settings where key='app_version' limit 1"
    );
    const out = (rows[0]?.value ?? "").trim();
    /* `out` vazio = a chave NUNCA existiu.

       Bug v3.53.2: a condição era `out && out !== version`, então a
       primeira gravação nunca acontecia — e o banco ficava sem
       `app_version` para sempre. Com isso /api/version devolvia
       installedVersion:null e não havia como saber, olhando o
       sistema, qual update já tinha entrado.

       Gravar quando está AUSENTE não precisa de --fix: não há valor
       do usuário para sobrescrever, só um vazio para preencher. */
    if (!out) {
      await pool.query(
        "insert into settings (key,value,category) values ('app_version',$1,'sistema') " +
        "on conflict (key) do update set value=excluded.value, updated_at=now()",
        [version]
      );
      console.log(`↻ settings.app_version gravado pela primeira vez: ${version}`);
    } else if (out !== version) {
      if (!fix) die(`Banco gravado em ${out}, VERSION é ${version}. Rode scripts/update.sh ou --fix`);
      await pool.query(
        "insert into settings (key,value,category) values ('app_version',$1,'sistema') " +
        "on conflict (key) do update set value=excluded.value, updated_at=now()",
        [version]
      );
      console.log(`↻ settings.app_version atualizado para ${version}`);
    }
  } catch (e) {
    console.error(`✖ DATABASE_URL está configurado mas o banco não respondeu: ${e.message}`);
    console.error("  Isto costuma ser sintoma de ambiente errado (ver docs/INCIDENTE-DEPLOY-3.68.3.md).");
    await pool.end().catch(() => {});
    process.exit(1);
  }
  await pool.end();
} else {
  console.log("! DATABASE_URL ausente — checagem de banco pulada (ok em máquina sem banco)");
}

console.log(`✔ Versionamento consistente: v${version}`);
