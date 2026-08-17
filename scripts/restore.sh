#!/usr/bin/env bash
# Restaura um backup. Uso: bash scripts/restore.sh backups/pre-update-3.0.0-XXXX.sql.gz
set -euo pipefail
FILE="${1:-}"
[ -n "$FILE" ] || { echo "Uso: bash scripts/restore.sh <arquivo.sql.gz>"; exit 1; }
[ -f "$FILE" ] || { echo "✖ Arquivo não encontrado: $FILE"; exit 1; }
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
banner
load_env
app_stop
gunzip -c "$FILE" | psql "$(db_url)"
app_start
wait_healthy || die "Restaurado, mas healthcheck falhou."
ok "Backup restaurado: $FILE"
