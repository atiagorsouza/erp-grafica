#!/usr/bin/env bash
# =============================================================================
# PrintFlow ERP · Deploy Seguro
# - Kill garantido do processo antigo
# - Verifica porta libre
# - Build com proteção RAM
# - Validação pós-deploy: /api/version + conflitos CSS
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(tr -d '[:space:]' < VERSION 2>/dev/null || echo "0.0.0")"
PORT="${PORT:-3000}"

c_ok()    { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
c_info()  { printf '\033[1;36m→\033[0m %s\n' "$*"; }
c_warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
c_err()   { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }
die()     { c_err "$*"; exit 1; }

banner() {
  cat <<EOF

╔══════════════════════════════════════════════════╗
║   PrintFlow ERP · Deploy Seguro → v${VERSION}
║   Validação de versão e conflitos de CSS
╚══════════════════════════════════════════════════╝

EOF
}

banner

# 1. MATAR PROCESSO ANTIGO
c_info "Parando processo antigo..."
pkill -9 node 2>/dev/null || true
sleep 1

# 2. CONFIRMAR QUE PORTA FICOU LIVRE
c_info "Verificando porta ${PORT}..."
if lsof -i ":${PORT}" >/dev/null 2>&1; then
  c_warn "Porta ${PORT} ainda ocupada, aguardando..."
  sleep 3
  if lsof -i ":${PORT}" >/dev/null 2>&1; then
    die "Porta ${PORT} ainda ocupada após 3s"
  fi
fi
c_ok "Porta ${PORT} livre"

# 3. INSTALAR DEPENDENCIES
c_info "Instalando dependencies..."
npm install --prefer-offline --no-audit >/dev/null 2>&1 || npm install >/dev/null 2>&1
c_ok "Dependencies instaladas"

# 4. BUILD COM PROTEÇÃO RAM
c_info "Fazendo build (monitorando RAM)..."
export NODE_OPTIONS="--max-old-space-size=1024"

if ! npm run build 2>&1 | tail -20; then
  # Verificar se foi problema de RAM
  if dmesg 2>/dev/null | tail -5 | grep -i "out of memory\|oom\|sigkill" >/dev/null; then
    c_err "Build falhou por falta de memória (SIGKILL)"
    c_warn "Sugestão: ativar swap ou aumentar RAM"
    c_warn "  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
    exit 1
  fi
  die "Build falhou (erro de compilação)"
fi
c_ok "Build completo"

# 5. INICIAR NOVO PROCESSO
c_info "Iniciando servidor..."
nohup npm start > /tmp/erp-deploy.log 2>&1 &
sleep 5

# 6. VALIDAR VERSION
c_info "Validando /api/version..."
ACTUAL_VERSION=$(curl -s http://localhost:${PORT}/api/version 2>/dev/null | grep -o '"version":"[^"]*' | cut -d'"' -f4)

if [ "$ACTUAL_VERSION" != "$VERSION" ]; then
  c_err "Versão incorreta: esperado=$VERSION, obtido=$ACTUAL_VERSION"
  c_warn "Servidor ainda serve build antigo em memória!"
  exit 1
fi
c_ok "Versão correta: $ACTUAL_VERSION"

# 7. VALIDAR CONFLITOS CSS
c_info "Verificando conflitos de CSS..."
HTML=$(curl -s http://localhost:${PORT}/ 2>/dev/null)
CONFLICT_COUNT=$(echo "$HTML" | grep -o 'bg-white.*bg-ink-\|bg-ink-.*bg-white' | wc -l)

if [ "$CONFLICT_COUNT" -gt 0 ]; then
  c_err "Conflitos de CSS encontrados: $CONFLICT_COUNT"
  die "Campo ainda renderiza com conflito de cores"
fi
c_ok "Nenhum conflito de CSS detectado"

# 8. SUCESSO
cat <<EOF

╔══════════════════════════════════════════════════╗
║   ✓ DEPLOY COMPLETO E VALIDADO
║   Versão: v${VERSION}
║   Porta: ${PORT}
║   Conflicts: 0
╚══════════════════════════════════════════════════╝

EOF

exit 0
