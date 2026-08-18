#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PrintFlow ERP — biblioteca compartilhada dos scripts de operação
# ---------------------------------------------------------------------------

set -euo pipefail

APP_NAME="erp-grafica"
APP_LABEL="PrintFlow ERP"
# Este arquivo mora em scripts/lib/, então a raiz do app está DOIS níveis
# acima — não um. Com "/.." o APP_DIR virava .../scripts e backup.sh,
# restore.sh, db-reset.sh e healthcheck.sh morriam com ".env não
# encontrado" (e mostravam a versão como 0.0.0, por ler o VERSION errado).
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$APP_DIR/.env"
VERSION_FILE="$APP_DIR/VERSION"
BACKUP_DIR="$APP_DIR/backups"
LOG_DIR="$APP_DIR/logs"
NODE_MIN=20

cd "$APP_DIR"

# ----------------------------- output -------------------------------------
if [ -t 1 ]; then
  C_RESET="\033[0m"; C_DIM="\033[2m"; C_OK="\033[1;32m"; C_INFO="\033[1;36m"
  C_WARN="\033[1;33m"; C_ERR="\033[1;31m"; C_STEP="\033[1;35m"
else
  C_RESET=""; C_DIM=""; C_OK=""; C_INFO=""; C_WARN=""; C_ERR=""; C_STEP=""
fi

log()  { printf "${C_INFO}▸${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_OK}✔${C_RESET} %s\n" "$*"; }
warn() { printf "${C_WARN}⚠${C_RESET} %s\n" "$*"; }
err()  { printf "${C_ERR}✖${C_RESET} %s\n" "$*" >&2; }
step() { printf "\n${C_STEP}━━ %s ━━${C_RESET}\n" "$*"; }
die()  { err "$*"; exit 1; }

hr() { printf "${C_DIM}──────────────────────────────────────────────${C_RESET}\n"; }

banner() {
  printf "\n"
  hr
  printf "  %s — %s\n" "$APP_LABEL" "$(app_version)"
  hr
}

# ----------------------------- helpers -------------------------------------
app_version() { [ -f "$VERSION_FILE" ] && head -n1 "$VERSION_FILE" | tr -d '[:space:]' || echo "0.0.0"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Comando obrigatório ausente: $1 — instale antes de continuar."
}

check_node() {
  require_cmd node
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt "$NODE_MIN" ]; then
    die "Node.js $NODE_MIN+ necessário (encontrado $(node -v))."
  fi
}

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_FILE.example" ]; then
      cp "$ENV_FILE.example" "$ENV_FILE"
      warn ".env criado a partir de .env.example — revise as credenciais."
    else
      die "Arquivo .env não encontrado em $APP_DIR."
    fi
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

db_url() {
  [ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL não definido no .env."
  printf '%s' "$DATABASE_URL"
}

psql_run() { psql "$(db_url)" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

db_reachable() { psql_run "select 1" >/dev/null 2>&1; }

db_table_exists() {
  [ "$(psql_run "select count(*) from information_schema.tables where table_schema='public' and table_name='$1'")" = "1" ]
}

db_count() {
  db_table_exists "$1" || { echo 0; return; }
  psql_run "select count(*) from $1"
}

npm_install() {
  if [ -f package-lock.json ]; then
    log "Instalando dependências (npm ci)…"
    npm ci --no-audit --no-fund >/dev/null
  else
    log "Instalando dependências (npm install)…"
    npm install --no-audit --no-fund >/dev/null
  fi
}

push_schema() {
  log "Sincronizando schema do banco (drizzle-kit push)…"
  if npx --no-install drizzle-kit push --force >/dev/null 2>&1; then
    return
  fi
  npx --no-install drizzle-kit push
}

build_app() {
  log "Compilando build de produção…"
  npm run build >/dev/null
}

# ----------------------- gerenciamento de processo -------------------------
detect_pm() {
  if command -v pm2 >/dev/null 2>&1; then echo pm2; return; fi
  if [ -d /etc/systemd/system ] && systemctl list-unit-files 2>/dev/null | grep -q "^${APP_NAME}.service"; then echo systemd; return; fi
  echo node
}

app_start() {
  local pm; pm="$(detect_pm)"
  case "$pm" in
    pm2)
      log "Iniciando com pm2…"
      pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --update-env >/dev/null
      pm2 save >/dev/null 2>&1 || true
      ;;
    systemd)
      log "Reiniciando serviço systemd…"
      sudo systemctl restart "$APP_NAME"
      ;;
    *)
      log "Iniciando em segundo plano (nohup)…"
      mkdir -p "$LOG_DIR"
      (nohup npm run start >"$LOG_DIR/app.log" 2>&1 &)
      ;;
  esac
}

app_stop() {
  local pm; pm="$(detect_pm)"
  case "$pm" in
    pm2) pm2 stop "$APP_NAME" >/dev/null 2>&1 || true ;;
    systemd) sudo systemctl stop "$APP_NAME" >/dev/null 2>&1 || true ;;
    node) pkill -f "next start" >/dev/null 2>&1 || true ;;
  esac
}

wait_healthy() {
  local port="${PORT:-3000}" tries=45
  log "Aguardando healthcheck em :$port/api/health…"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS "http://127.0.0.1:${port}/api/health" 2>/dev/null | grep -q '"ok":true'; then
      ok "Aplicação saudável."
      return 0
    fi
    sleep 2
  done
  err "Healthcheck falhou após $((tries * 2))s."
  return 1
}

# ----------------------------- backup --------------------------------------
backup_db() {
  mkdir -p "$BACKUP_DIR"
  load_env
  local stamp file
  stamp="$(date +%Y%m%d-%H%M%S)"
  file="$BACKUP_DIR/pre-update-$(app_version)-$stamp.sql.gz"
  step "Backup do banco de dados"
  require_cmd pg_dump
  if pg_dump "$(db_url)" | gzip > "$file"; then
    ok "Backup salvo: $file"
    # mantém os 10 backups mais recentes
    ls -1t "$BACKUP_DIR"/pre-update-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
  else
    die "Falha ao gerar backup — atualização abortada por segurança."
  fi
}
