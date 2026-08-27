#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   entregar.mjs — fecha uma versão e gera a ORDEM DE SERVIÇO para o
   agente do servidor.

   Este é o elo que faltava. Antes: o agente de desenvolvimento mudava
   o código, e a mensagem para o agente do servidor era escrita à mão —
   o que significa versão esquecida, boletim faltando, e o servidor
   descobrindo a mudança pelo susto.

   Agora um comando só faz o caminho inteiro:

     node scripts/entregar.mjs --tipo patch --titulo "Conserto do SKU" \
       --mudou "SKU duplicado devolvia 500" \
       --fazer "git pull + update.sh" \
       --validar "smoke 308"

   O que ele faz, em ordem:
     1. Calcula a próxima versão (semver) a partir de VERSION
     2. Grava VERSION + package.json
     3. Cria UPDATES/<versão>.md (o boletim que o agente do servidor lê)
     4. Comita e faz push na branch de trabalho
     5. Imprime a MENSAGEM PRONTA para você repassar ao agente

   Nada aqui toca produção. Quem aplica é o agente do servidor, pelo
   fluxo do AGENTE-SERVIDOR.md §4.

   Opções:
     --tipo major|minor|patch   (padrão: patch)
     --versao X.Y.Z             (versão explícita; ignora --tipo)
     --titulo "..."             (título do boletim)
     --mudou "..."              (repetível — o que mudou)
     --fazer "..."              (repetível — o que o agente deve fazer)
     --validar "..."            (repetível — como validar)
     --migracao sim|nao         (padrão: nao)
     --portal                   (marca que o portal Hostinger mudou)
     --sem-push                 (só prepara; não comita nem envia)
   ────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

/* ── leitura dos argumentos (repetíveis viram lista) ─────────────── */
const argv = process.argv.slice(2);
const opt = (nome, padrao = null) => {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : padrao;
};
const optAll = (nome) => {
  const saida = [];
  argv.forEach((a, i) => {
    if (a === `--${nome}` && argv[i + 1] && !argv[i + 1].startsWith("--")) saida.push(argv[i + 1]);
  });
  return saida;
};
const flag = (nome) => argv.includes(`--${nome}`);

const tipo = opt("tipo", "patch");
const titulo = opt("titulo", "Manutenção");
const mudou = optAll("mudou");
const fazer = optAll("fazer");
const validar = optAll("validar");
const migracao = opt("migracao", "nao");
const tocaPortal = flag("portal");
const semPush = flag("sem-push");

if (!["major", "minor", "patch"].includes(tipo)) {
  console.error(`✗ --tipo inválido: ${tipo} (use major, minor ou patch)`);
  process.exit(1);
}
if (!["sim", "nao"].includes(migracao)) {
  console.error(`✗ --migracao inválida: ${migracao} (use sim ou nao)`);
  process.exit(1);
}

/* ── versão atual → próxima ──────────────────────────────────────── */
const atual = readFileSync(join(RAIZ, "VERSION"), "utf8").trim().split("\n")[0].trim();
const [ma, mi, pa] = atual.split(".").map(Number);

let proxima = opt("versao");
if (!proxima) {
  if (tipo === "major") proxima = `${ma + 1}.0.0`;
  else if (tipo === "minor") proxima = `${ma}.${mi + 1}.0`;
  else proxima = `${ma}.${mi}.${pa + 1}`;
}
if (!/^\d+\.\d+\.\d+$/.test(proxima)) {
  console.error(`✗ versão inválida: ${proxima}`);
  process.exit(1);
}

const hoje = new Date().toISOString().slice(0, 10);
const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: RAIZ }).toString().trim();

console.log(`\n📦 Entrega ${atual} → ${proxima}  (${tipo})`);
console.log(`   branch: ${branch}\n`);

/* ── 1. VERSION + package.json ───────────────────────────────────── */
writeFileSync(join(RAIZ, "VERSION"), `${proxima}\n`);
const pkgPath = join(RAIZ, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = proxima;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`✓ VERSION e package.json → ${proxima}`);

/* ── 2. boletim UPDATES/<versão>.md ──────────────────────────────── */
const dirUpdates = join(RAIZ, "UPDATES");
if (!existsSync(dirUpdates)) mkdirSync(dirUpdates, { recursive: true });

const lista = (itens, vazio) =>
  itens.length ? itens.map((t, i) => `${i + 1}. ${t}`).join("\n") : vazio;

const boletim = `---
versao: ${proxima}
data: ${hoje}
commit: (preenchido no commit)
tipo: ${tipo}
migracao_banco: ${migracao}
reseed: nunca
de: ${atual}
portal: ${tocaPortal ? "sim" : "nao"}
---

# Boletim ${proxima} — ${titulo}

## O que mudou

${lista(mudou, "1. (sem detalhamento — ver git log)")}

## O que você (agente do servidor) deve fazer

${lista(
  fazer,
  `1. Fluxo padrão do AGENTE-SERVIDOR.md §4 — não pule etapas:

\`\`\`bash
cd /www/wwwroot/erp-grafica
git status                      # tem que estar limpo
git pull origin main
bash scripts/update.sh          # backup → deps → schema → build
pm2 restart <nome-do-processo>  # confira com: pm2 ls
\`\`\``
)}

## Como validar

${lista(
  validar,
  `1. \`ls -la .next/BUILD_ID\` — tem que existir (regra 1.3)
2. \`curl -s http://127.0.0.1:3000/api/version\` → \`"version":"${proxima}"\` e \`"upToDate": true\`
3. \`set -a; source .env; set +a && npm run e2e:smoke\` → "🎉 concluído com sucesso"
4. \`node scripts/agente-verificar.mjs\` → situação **ATUALIZADO**`
)}

## Migração de banco

${
  migracao === "sim"
    ? `**SIM** — o \`update.sh\` aplica o schema (drizzle-kit push) depois de
fazer o backup. Não rode \`drizzle-kit push --force\` na mão (regra 3).`
    : `**NÃO** — nenhuma alteração de schema nesta versão. O \`update.sh\`
roda mesmo assim (é idempotente) e o backup continua obrigatório.`
}

## Portal do cliente (Hostinger)

${
  tocaPortal
    ? `**Esta versão mexe no portal.** O agente do servidor **não** implanta o
portal. Fluxo separado (AGENTE-SERVIDOR.md §8):

\`\`\`bash
bash scripts/empacotar-portal.sh     # gera release/portal-v<versão>-<data>.zip
\`\`\`

O zip é enviado à Hostinger **pelo dono** (gerenciador de arquivos ou
FTP). O LEIA-ME de implantação vai dentro do pacote.`
    : `Não afetado nesta versão — nada a fazer na Hostinger.`
}

## Rollback

Se a versão não prestar (AGENTE-SERVIDOR.md §7):

\`\`\`bash
BACKUP=$(cat .printflow/last-backup.path)
ls -lh "$BACKUP"                 # confirme que existe e tem tamanho
pm2 stop <nome-do-processo>
${
  migracao === "sim"
    ? `pg_restore --clean --if-exists -d "$DATABASE_URL" "$BACKUP/database.dump"`
    : `# banco não mudou — restaure só o código`
}
mkdir -p /tmp/rollback && tar -xzf "$BACKUP/app-source.tgz" -C /tmp/rollback
rsync -a --delete --exclude '.env' --exclude 'node_modules' --exclude '.next' \\
  /tmp/rollback/ /www/wwwroot/erp-grafica/
npm install && npm run build && pm2 restart <nome-do-processo>
\`\`\`
`;

const caminhoBoletim = join(dirUpdates, `${proxima}.md`);
writeFileSync(caminhoBoletim, boletim);
console.log(`✓ boletim criado: UPDATES/${proxima}.md`);

/* ── 3. commit + push ────────────────────────────────────────────── */
let commit = "(não commitado)";
if (semPush) {
  console.log("\n! --sem-push: nada foi commitado nem enviado.");
} else {
  try {
    execSync("git add -A", { cwd: RAIZ, stdio: "inherit" });
    const msg = `v${proxima} — ${titulo}`;
    execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: RAIZ, stdio: "inherit" });
    commit = execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim();

    /* Carimba o hash real dentro do boletim e emenda no mesmo commit. */
    writeFileSync(caminhoBoletim, boletim.replace("commit: (preenchido no commit)", `commit: ${commit}`));
    execSync(`git add ${JSON.stringify(caminhoBoletim)}`, { cwd: RAIZ });
    execSync("git commit --amend --no-edit", { cwd: RAIZ, stdio: "inherit" });
    commit = execSync("git rev-parse --short HEAD", { cwd: RAIZ }).toString().trim();

    execSync(`git push origin ${branch}`, { cwd: RAIZ, stdio: "inherit" });
    console.log(`\n✓ enviado para origin/${branch} (${commit})`);
  } catch (e) {
    console.error(`\n✗ falhou no git: ${e.message}`);
    console.error("  A versão e o boletim ficaram gravados no disco.");
    process.exit(1);
  }
}

/* ── 4. a mensagem pronta para o agente do servidor ──────────────── */
const linha = "═".repeat(66);
console.log(`\n${linha}`);
console.log("  MENSAGEM PARA O AGENTE DO SERVIDOR — copie daqui para baixo");
console.log(linha);
console.log(`
Atualize o ERP para a versão ${proxima} (commit ${commit}).

Boletim: UPDATES/${proxima}.md
Migração de banco: ${migracao}
Reseed: NUNCA
Portal Hostinger: ${tocaPortal ? "SIM — gerar pacote (§8), quem sobe é o dono" : "não afetado"}

O que mudou:
${mudou.length ? mudou.map((m) => `  - ${m}`).join("\n") : "  - ver boletim"}

Passos (AGENTE-SERVIDOR.md §4 — não pule etapas):
  cd /www/wwwroot/erp-grafica
  git status                      # tem que estar limpo
  git pull origin main
  bash scripts/update.sh
  pm2 restart <nome>              # confira com: pm2 ls
  ls -la .next/BUILD_ID
  curl -s http://127.0.0.1:3000/api/version
  set -a; source .env; set +a && npm run e2e:smoke
  node scripts/agente-verificar.mjs

Me responda com:
  1. a saída do /api/version (versão + upToDate)
  2. a última linha do e2e:smoke
  3. qualquer anomalia no caminho

Se qualquer etapa falhar: PARE e me mande a tela. Não force flag nenhuma.
`);
console.log(linha);
console.log(`
⚠ Lembre: produção só atualiza de \`main\`. Esta entrega está em
  \`${branch}\` — abra o Pull Request e faça o merge antes de mandar a
  mensagem acima para o agente do servidor:

    gh pr create --fill --base main --head ${branch}
`);
