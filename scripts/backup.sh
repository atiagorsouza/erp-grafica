#!/usr/bin/env bash
# Backup compactado do banco + manifest da versão. Uso: bash scripts/backup.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
banner
backup_db
ok "Backups existentes: $(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)"
