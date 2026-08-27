#!/usr/bin/env bash
# =============================================================================
# PrintFlow ERP · Instalação limpa (primeira vez)
# Versão: leia o arquivo VERSION na raiz do projeto
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(tr -d '[:space:]' < VERSION 2>/dev/null || echo "0.0.0")"
APP_NAME="PrintFlow ERP"
NODE_MIN_MAJOR=20

c_info()  { printf '\033[1;36m→\033[0m %s\n' "$*"; }
c_ok()    { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
c_warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
c_err()   { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }
die()     { c_err "$*"; exit 1; }

banner() {
  cat <<EOF

╔══════════════════════════════════════════════════╗
║   ${APP_NAME}  ·  v${VERSION}                   
║   Instalação de produção (primeira vez)          
╚══════════════════════════════════════════════════╝

EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Comando obrigatório não encontrado: $1"
}

check_node() {
  need_cmd node
  need_cmd npm
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if (( major < NODE_MIN_MAJOR )); then
    die "Node.js >= ${NODE_MIN_MAJOR} é obrigatório (encontrado: $(node -v))"
  fi
  c_ok "Node.js $(node -v) · npm $(npm -v)"
}

ensure_env() {
  if [[ ! -f .env ]]; then
    if [[ -f .env.example ]]; then
      c_info "Criando .env a partir de .env.example"
      cp .env.example .env
    else
      die "Arquivo .env não encontrado. Crie um com DATABASE_URL antes de instalar."
    fi
  fi

  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a

  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL não definido no .env"
  c_ok "DATABASE_URL configurado"
}

wait_postgres() {
  c_info "Aguardando PostgreSQL..."
  local tries=0
  until node -e '
    const { Client } = require("pg");
    require("dotenv").config();
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    c.connect()
      .then(() => c.query("select 1"))
      .then(() => c.end())
      .catch((e) => { console.error(e.message); process.exit(1); });
  ' >/dev/null 2>&1; do
    tries=$((tries + 1))
    if (( tries > 30 )); then
      die "Não foi possível conectar ao PostgreSQL com DATABASE_URL"
    fi
    sleep 1
  done
  c_ok "PostgreSQL acessível"
}

install_deps() {
  c_info "Instalando dependências npm (produção + build)..."
  # IMPORTANTE: .env pode ter NODE_ENV=production. Forçamos dev deps porque
  # drizzle-kit, TypeScript e build tooling são necessários durante install/update.
  if [[ -f package-lock.json ]]; then
    NODE_ENV=development npm ci --include=dev
  else
    NODE_ENV=development npm install --include=dev
  fi
  c_ok "Dependências instaladas"
}

setup_database() {
  c_info "Aplicando schema (drizzle-kit push)..."
  npx drizzle-kit push
  c_ok "Schema aplicado"

  if [[ "${SKIP_SEED:-0}" == "1" ]]; then
    c_warn "SKIP_SEED=1 — seed ignorado"
    return
  fi

  c_info "Populando dados iniciais (seed)..."
  node scripts/seed.mjs
  node scripts/seed-calendar.mjs
  node scripts/ensure-settings.mjs
  node scripts/repair-document-counters.mjs
  node scripts/repair-print-engine.mjs
  node scripts/repair-products.mjs
  node scripts/repair-pricing-tables.mjs
  node scripts/repair-services.mjs
  node scripts/repair-quotes.mjs
  node scripts/repair-orders.mjs
  node scripts/repair-crm.mjs
  node scripts/repair-kanban.mjs
  node scripts/repair-calendar.mjs
  node scripts/repair-stock.mjs
  node scripts/repair-finance.mjs
  node scripts/repair-shipping.mjs
  node scripts/repair-payments.mjs

  # Identidade e carimbo de versão (v3.69.2): uma instalação do zero
  # nascia SEM as logos da VTDIGITAL e SEM settings.app_version — o
  # e2e-smoke reprova as duas coisas (seção 11.995) e a marca só
  # aparecia depois de alguém subir a logo na mão.
  node scripts/aplicar-logo.mjs --aplicar
  node scripts/check-version.mjs
  c_ok "Seed concluído"
}

build_app() {
  c_info "Gerando build de produção..."
  npm run build
  c_ok "Build gerado em .next/"
}

write_install_meta() {
  mkdir -p .printflow
  cat > .printflow/install.json <<EOF
{
  "version": "${VERSION}",
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "node": "$(node -v)",
  "npm": "$(npm -v)"
}
EOF
  c_ok "Metadados gravados em .printflow/install.json"
}

print_next_steps() {
  cat <<EOF

${APP_NAME} v${VERSION} instalado com sucesso.

Próximos passos:
  1. Inicie o servidor:     bash scripts/start.sh
     (ou)                  npm run start
  2. Healthcheck:          curl -s http://127.0.0.1:3000/api/health
  3. Atualizações futuras: bash scripts/update.sh

Variáveis úteis:
  PORT=3000                 porta HTTP
  SKIP_SEED=1               pular seed na instalação
  HOSTNAME=0.0.0.0          bind address (via start.sh)

EOF
}

main() {
  banner
  check_node
  ensure_env
  install_deps
  node scripts/preflight.mjs
  wait_postgres
  setup_database
  build_app
  write_install_meta
  print_next_steps
}

main "$@"
