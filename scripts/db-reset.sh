#!/usr/bin/env bash
# APAGA e recria a base com dados de demonstração. NUNCA use em produção.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"
banner
load_env
[ "${APP_ENV:-development}" = "production" ] && die "Bloqueado em APP_ENV=production."
warn "Isto apaga TODOS os dados do banco."
printf "Confirmar? [digite RESET] "; read -r r
[ "$r" = "RESET" ] || die "Cancelado."
psql "$(db_url)" -qAt -c "drop schema public cascade; create schema public;" >/dev/null
push_schema
node scripts/seed.mjs
node scripts/seed-calendar.mjs
node scripts/check-version.mjs --fix
ok "Base recriada em v$(app_version)."
