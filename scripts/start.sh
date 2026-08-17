#!/usr/bin/env bash
# =============================================================================
# PrintFlow ERP · Start de produção
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(tr -d '[:space:]' < VERSION 2>/dev/null || echo "0.0.0")"
PORT="${PORT:-3000}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"

c_info()  { printf '\033[1;36m→\033[0m %s\n' "$*"; }
c_ok()    { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
c_err()   { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }
die()     { c_err "$*"; exit 1; }

if [[ ! -f .env ]]; then
  die ".env não encontrado. Rode scripts/install.sh primeiro."
fi

if [[ ! -d .next ]]; then
  c_info "Build não encontrado — gerando..."
  npm run build
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source .env
set +a

export PORT HOSTNAME
export NODE_ENV=production

c_ok "PrintFlow ERP v${VERSION} · http://${HOSTNAME}:${PORT}"
exec npx next start --hostname "$HOSTNAME" --port "$PORT"
