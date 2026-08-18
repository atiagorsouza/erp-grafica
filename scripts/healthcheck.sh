#!/usr/bin/env bash
# Verifica /api/health e /api/version. Uso: bash scripts/healthcheck.sh [porta]
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
PORT="${1:-${PORT:-3000}}"
printf "%-12s " "health:"
H="$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null || echo '{"ok":false}')"
echo "$H" | grep -q '"ok":true' && echo "OK" || { echo "FALHOU — $H"; exit 1; }
printf "%-12s " "versão:"
curl -fsS "http://127.0.0.1:$PORT/api/version" 2>/dev/null || echo "indisponível"
