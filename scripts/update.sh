#!/usr/bin/env bash
# =============================================================================
# PrintFlow ERP · Atualização de versão
# - Faz backup do estado atual
# - Instala deps, aplica schema e rebuild
# - NÃO reexecuta seed (preserva dados de produção)
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(tr -d '[:space:]' < VERSION 2>/dev/null || echo "0.0.0")"
APP_NAME="PrintFlow ERP"
BACKUP_ROOT="${BACKUP_DIR:-$ROOT_DIR/.printflow/backups}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"

c_info()  { printf '\033[1;36m→\033[0m %s\n' "$*"; }
c_ok()    { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
c_warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
c_err()   { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }
die()     { c_err "$*"; exit 1; }

banner() {
  cat <<EOF

╔══════════════════════════════════════════════════╗
║   ${APP_NAME}  ·  Update → v${VERSION}           
║   Atualização segura (sem reseed)                
╚══════════════════════════════════════════════════╝

EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Comando obrigatório não encontrado: $1"
}

load_env() {
  [[ -f .env ]] || die ".env não encontrado — execute a instalação primeiro (scripts/install.sh)"
  # shellcheck disable=SC1091
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
  [[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL não definido no .env"
}

previous_version() {
  if [[ -f .printflow/install.json ]]; then
    node -e 'const fs=require("fs"); try{const j=JSON.parse(fs.readFileSync(".printflow/install.json","utf8")); process.stdout.write(j.version||"unknown")}catch{process.stdout.write("unknown")}'
  else
    printf 'unknown'
  fi
}

# ──────────────────────────────────────────────────────────────────
# escolher_pgdump (v3.70.3)
#
# pg_dump se recusa quando o CLIENTE é mais antigo que o SERVIDOR.
# Em produção (27/08/2026): cliente 17.11 × servidor 18.0 →
# "aborting because of server version mismatch" → update travou no
# backup (e travar no backup é o comportamento CERTO — incidente
# 24/08). O que faltava era achar o binário certo: em máquinas com
# o servidor 18 instalado localmente, o pg_dump 18 costuma existir
# em /usr/lib/postgresql/18/bin — apenas fora do PATH.
#
# Aqui descobrimos o major do SERVIDOR e escolhemos o candidato:
#   1º major exato → 2º qualquer >= servidor → 3º o do PATH.
# Detecção falhou? Comportamento anterior (pg_dump do PATH).
# ──────────────────────────────────────────────────────────────────
escolher_pgdump() {
  PGDUMP_BIN=""
  PG_SERVER_MAJOR=""

  PG_SERVER_MAJOR="$(
    node -e '
      const pg=require("pg");
      (async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});
        try{await c.connect();const r=await c.query("show server_version_num");
          console.log(String(r.rows[0].server_version_num).slice(0,2));await c.end();}
        catch{}})();
    ' 2>/dev/null
  )"
  [[ "$PG_SERVER_MAJOR" =~ ^[0-9]+$ ]] || PG_SERVER_MAJOR=""

  local -a candidatos=()
  local p
  p="$(command -v pg_dump 2>/dev/null || true)"
  [ -n "$p" ] && candidatos+=("$p")
  # Caminhos conhecidos: Debian padrão (/usr/lib/postgresql/<N>/bin) e
  # aPanel (/www/server/pgsql/bin — CONFIRMADO em produção 27/08: o
  # PostgreSQL 18 do ERP mora lá, enquanto o PATH só tem o cliente 17).
  while IFS= read -r b; do candidatos+=("$b"); done < <(
    ls -1rv /usr/lib/postgresql/*/bin/pg_dump /www/server/pgsql*/bin/pg_dump /www/server/postgresql*/bin/pg_dump 2>/dev/null || true
  )

  major_de() { "$1" --version 2>/dev/null | sed -nE 's/^pg_dump \(PostgreSQL\) ([0-9]+).*/\1/p' | head -n1; }
  PGDUMP_BIN="${candidatos[0]:-}"

  if [ -n "$PG_SERVER_MAJOR" ] && [ "${#candidatos[@]}" -gt 0 ]; then
    local c m escolhido=""
    # 1) major exato
    for c in "${candidatos[@]}"; do
      m="$(major_de "$c")"
      if [ "$m" = "$PG_SERVER_MAJOR" ]; then escolhido="$c"; break; fi
    done
    # 2) qualquer >= servidor (pg_dump aceita servidor mais antigo)
    if [ -z "$escolhido" ]; then
      for c in "${candidatos[@]}"; do
        m="$(major_de "$c")"
        if [ -n "$m" ] && [ "$m" -ge "$PG_SERVER_MAJOR" ] 2>/dev/null; then escolhido="$c"; break; fi
      done
    fi
    [ -n "$escolhido" ] && PGDUMP_BIN="$escolhido"
  fi

  if [ -n "$PGDUMP_BIN" ]; then
    c_info "pg_dump: $("$PGDUMP_BIN" --version 2>/dev/null | head -n1)${PG_SERVER_MAJOR:+ · servidor PostgreSQL $PG_SERVER_MAJOR}"
  else
    c_warn "nenhum pg_dump encontrado no PATH nem em /usr/lib/postgresql/*/bin"
  fi
}
backup_state() {
  local from_v backup_dir
  from_v="$(previous_version)"
  backup_dir="${BACKUP_ROOT}/${STAMP}_v${from_v}_to_v${VERSION}"
  mkdir -p "$backup_dir"

  c_info "Backup em ${backup_dir}"

  # Snapshot de arquivos críticos (sem node_modules / .next)
  tar --exclude='./node_modules' \
      --exclude='./.next' \
      --exclude='./.printflow/backups' \
      --exclude='./.git' \
      -czf "${backup_dir}/app-source.tgz" \
      . 2>/dev/null || tar -czf "${backup_dir}/app-source.tgz" \
        package.json package-lock.json VERSION src scripts drizzle.config.json \
        next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs .env.example 2>/dev/null || true

  # Dump do banco com fallback JSON. O fallback não substitui pg_dump para
  # restore perfeito, mas evita update sem nenhuma cópia dos dados.
  #
  # ── REGRA DO INCIDENTE 2026-08-24 ──────────────────────────────────
  # O pg_dump falhou (binário mais antigo que o servidor), o fallback
  # JSON saiu incompleto, e o update SEGUIU assim. Dias depois, uma
  # reinstalação da base curada apagou produção — e o único backup
  # "utilizável" era esse JSON pela metade: produtos e pedidos
  # perdidos, recuperados horas depois do backup pré-apagão.
  # Update sem backup RESTAURÁVEL não roda mais. Aborta na hora.
  dump_ok=0
  escolher_pgdump
  if [ -n "$PGDUMP_BIN" ]; then
    c_info "Exportando banco com pg_dump..."
    if "$PGDUMP_BIN" "$DATABASE_URL" --no-owner --no-acl -F c -f "${backup_dir}/database.dump" >"${backup_dir}/pg_dump.log" 2>&1 && [ -s "${backup_dir}/database.dump" ]; then
      c_ok "Dump custom do banco salvo"
      dump_ok=1
    elif "$PGDUMP_BIN" "$DATABASE_URL" --no-owner --no-acl -f "${backup_dir}/database.sql" >>"${backup_dir}/pg_dump.log" 2>&1 && [ -s "${backup_dir}/database.sql" ]; then
      c_ok "Dump SQL do banco salvo"
      dump_ok=1
    fi
  fi
  if [ "$dump_ok" = "0" ]; then
    c_warn "pg_dump falhou ou indisponível — tentando fallback JSON"
    # v3.70.3 — bug visto NA PRODUÇÃO (27/08): o validador era
    # `require('./${backup_dir}/...')` e, com backup_dir ABSOLUTO, virava
    # `.//www/wwwroot/...` → "Cannot find module". O dump JSON era gravado
    # certinho e a VALIDAÇÃO é que explodia — o update abortava dizendo
    # "sem backup" com o arquivo lá. Como o fallback só roda quando o
    # pg_dump falha, o bug nunca tinha aparecido num update que passasse.
    # Agora o caminho entra por argv (à prova de formato).
    if node scripts/backup-db-json.mjs "${backup_dir}/database-fallback.json" \
       && node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(!j.tables || Object.keys(j.tables).length < 10) process.exit(1)" "${backup_dir}/database-fallback.json"; then
      c_ok "Fallback JSON salvo e VALIDADO (tabelas presentes)"
    else
      die "SEM BACKUP RESTAURÁVEL — update abortado por segurança. Descubra por que o pg_dump falhou (cat ${backup_dir}/pg_dump.log) e rode o update de novo.${PG_SERVER_MAJOR:+ Servidor PostgreSQL ${PG_SERVER_MAJOR} detectado — instale o cliente: apt-get install -y postgresql-client-${PG_SERVER_MAJOR} (ou export PATH=/usr/lib/postgresql/${PG_SERVER_MAJOR}/bin:$PATH; em aPanel: /www/server/pgsql/bin)}"
    fi
  fi

  printf '%s\n' "$backup_dir" > .printflow/last-backup.path
  c_ok "Backup concluído"
}

install_deps() {
  c_info "Atualizando dependências..."
  # .env pode definir NODE_ENV=production; durante update precisamos de
  # drizzle-kit, TypeScript e ferramentas de build (devDependencies).
  if [[ -f package-lock.json ]]; then
    NODE_ENV=development npm ci --include=dev
  else
    NODE_ENV=development npm install --include=dev
  fi
  c_ok "Dependências atualizadas"
}

migrate_schema() {
  c_info "Aplicando mudanças de schema (drizzle-kit push)..."
  npx drizzle-kit push
  c_ok "Schema sincronizado"

  c_info "Garantindo configurações novas sem sobrescrever produção..."
  node scripts/ensure-settings.mjs
  c_ok "Configurações atualizadas"

  c_info "Reparando contadores de documentos..."
  node scripts/repair-document-counters.mjs
  c_ok "Contadores reparados"

  c_info "Reparando motor de Impressoras & Tintas..."
  node scripts/repair-print-engine.mjs
  c_ok "Impressoras & Tintas reparado"

  c_info "Reparando Produtos & Custos..."
  node scripts/repair-products.mjs
  c_ok "Produtos & Custos reparado"

  c_info "Reparando Tabelas de Preços..."
  node scripts/repair-pricing-tables.mjs
  c_ok "Tabelas de Preços reparadas"

  c_info "Reparando Serviços & Acabamentos..."
  node scripts/repair-services.mjs
  c_ok "Serviços & Acabamentos reparado"

  c_info "Reparando dados do módulo Orçamentos..."
  node scripts/repair-quotes.mjs
  c_ok "Orçamentos reparado"

  c_info "Reparando integrações do módulo Pedidos & OS..."
  node scripts/repair-orders.mjs
  c_ok "Pedidos & OS reparado"

  c_info "Reparando dados do módulo Clientes & CRM..."
  node scripts/repair-crm.mjs
  c_ok "Clientes & CRM reparado"

  c_info "Reparando quadro Kanban de Produção..."
  node scripts/repair-kanban.mjs
  c_ok "Kanban reparado"

  c_info "Reparando Calendário Comemorativo..."
  node scripts/repair-calendar.mjs
  c_ok "Calendário reparado"

  c_info "Reparando Estoque & Compras..."
  node scripts/repair-stock.mjs
  node scripts/repair-finance.mjs
  node scripts/repair-shipping.mjs
  node scripts/repair-payments.mjs
  c_ok "Estoque & Compras reparado"
}

rebuild() {
  c_info "Rebuild de produção..."
  rm -rf .next
  npm run build
  c_ok "Build atualizado"
}

write_meta() {
  mkdir -p .printflow
  local prev
  prev="$(previous_version)"
  cat > .printflow/install.json <<EOF
{
  "version": "${VERSION}",
  "previousVersion": "${prev}",
  "updatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "installedAt": "$(node -e 'const fs=require("fs");try{const j=JSON.parse(fs.readFileSync(".printflow/install.json","utf8"));process.stdout.write(j.installedAt||"")}catch{process.stdout.write("")}' 2>/dev/null || true)",
  "node": "$(node -v)",
  "npm": "$(npm -v)"
}
EOF
  # Garante installedAt se estava vazio
  node -e '
    const fs=require("fs");
    const p=".printflow/install.json";
    const j=JSON.parse(fs.readFileSync(p,"utf8"));
    if(!j.installedAt) j.installedAt=j.updatedAt;
    fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
  '
  c_ok "Versão registrada: v${VERSION}"
}

print_done() {
  cat <<EOF

Atualização concluída: ${APP_NAME} → v${VERSION}

Reinicie o processo de produção:
  bash scripts/start.sh
  # ou via PM2/systemd/Docker conforme seu ambiente

Healthcheck:
  curl -s http://127.0.0.1:\${PORT:-3000}/api/health

Último backup:
  $(cat .printflow/last-backup.path 2>/dev/null || echo "(não registrado)")

EOF
}

main() {
  banner
  need_cmd node
  need_cmd npm
  load_env
  mkdir -p .printflow
  backup_state
  install_deps
  node scripts/preflight.mjs
  # Aponta sobras de versões antigas ANTES do build. O tar/unzip não apaga
  # arquivo que saiu do projeto, e uma rota duplicada faz o Next compilar a
  # página errada — foi o que quebrou o deploy da v3.46.0.
  bash scripts/verificar-instalacao.sh || true
  migrate_schema
  rebuild
  write_meta
  carimbar_versao
  print_done
}

# v3.70.3 — o updater precisa DEIXAR O CARIMBO CERTO. Até aqui só o
# deploy-auto tocava em settings.app_version; quem atualizava via
# update.sh ficava com o carimbo da versão ANTERIOR — e o e2e:smoke
# reprovava no final (11.8) depois de 300 checagens verdes, com o
# sistema perfeitamente instalado. Era a pendência #1 do incidente
# 25/08. O --fix aqui é seguro: VERSION é a fonte da verdade e acaba
# de ser entregue pelo git pull.
carimbar_versao() {
  c_info "Carimbando a versão no banco (settings.app_version)..."
  if node scripts/check-version.mjs --fix; then
    c_ok "Versão carimbada: v${VERSION}"
  else
    c_warn "check-version falhou — rode e confira: node scripts/check-version.mjs --fix"
  fi
}

main "$@"
