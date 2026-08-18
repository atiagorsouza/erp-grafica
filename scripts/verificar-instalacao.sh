#!/usr/bin/env bash
# =============================================================================
# PrintFlow ERP · Verificação da instalação
#
# Compara os arquivos que existem no servidor com os que a versão atual
# deveria ter, e aponta ARQUIVOS ÓRFÃOS: sobras de versões antigas que o
# tar/unzip não apaga (eles só sobrescrevem o que existe no pacote).
#
# Motivo de existir: na v3.46.0 uma cópia antiga de produtos/page.tsx
# ficou num caminho paralelo. O Next compilou a errada e o build quebrou
# com "Property 'laborHourlyRate' is missing" — erro que sobreviveu a
# reinstalar em .tar.gz e em .zip, porque o problema não estava no
# pacote, e sim no que sobrou embaixo dele.
#
# Uso:  bash scripts/verificar-instalacao.sh
# =============================================================================
set -uo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

banner
step "Verificação da instalação"

problemas=0

# ---------------------------------------------------------------- rotas ----
# No App Router, cada rota é um page.tsx. Dois page.tsx que resolvem para
# a MESMA url é conflito: o Next escolhe um e ignora o outro.
log "Procurando rotas duplicadas..."
dup=$(find "$APP_DIR/src/app" -name "page.tsx" -type f 2>/dev/null \
  | sed -E 's|.*/src/app/||; s|/page\.tsx$||; s|\([^)]*\)/||g' \
  | sort | uniq -d)

if [ -n "$dup" ]; then
  err "Rotas duplicadas encontradas:"
  while read -r rota; do
    [ -z "$rota" ] && continue
    printf '   url "/%s" atendida por:\n' "$rota"
    find "$APP_DIR/src/app" -name "page.tsx" -type f 2>/dev/null | while read -r f; do
      limpo=$(echo "$f" | sed -E 's|.*/src/app/||; s|/page\.tsx$||; s|\([^)]*\)/||g')
      [ "$limpo" = "$rota" ] && printf '     - %s\n' "${f#$APP_DIR/}"
    done
    problemas=$((problemas + 1))
  done <<< "$dup"
  echo
  warn "Duas páginas para a mesma url: o Next compila UMA e ignora a outra."
  warn "Se a ignorada for a nova, o build quebra com erro que não faz sentido."
else
  ok "Nenhuma rota duplicada"
fi

# --------------------------------------------------------------- backup ----
log "Procurando arquivos de backup/rascunho no código..."
lixo=$(find "$APP_DIR/src" \( -name "*.bak" -o -name "*.bak-*" -o -name "*.old" \
  -o -name "*.orig" -o -name "*~" -o -name "*.rej" -o -name "* copy*" \
  -o -name "*copia*" -o -name "*.tsx.*" -o -name "*.ts.*" \) -type f 2>/dev/null)

if [ -n "$lixo" ]; then
  warn "Arquivos que não deveriam estar em src/:"
  echo "$lixo" | while read -r f; do printf '   %s\n' "${f#$APP_DIR/}"; done
  echo
  warn "Se terminarem em .tsx ou .ts, o TypeScript os compila junto."
  problemas=$((problemas + 1))
else
  ok "Nenhum arquivo de backup em src/"
fi

# -------------------------------------------------------------- volume ----
log "Conferindo volume de arquivos..."
n_src=$(find "$APP_DIR/src" -type f 2>/dev/null | wc -l)
n_app=$(find "$APP_DIR/src/app/(app)" -type f 2>/dev/null | wc -l)
printf '   src/           : %s\n' "$n_src"
printf '   src/app/(app)/ : %s\n' "$n_app"

if [ "$n_app" -lt 10 ]; then
  err "Poucos arquivos em src/app/(app) — extração provavelmente incompleta."
  err "Esse diretório tem parênteses; alguns FTP e descompactadores o pulam."
  problemas=$((problemas + 1))
else
  ok "Volume compatível"
fi

# ---------------------------------------------------------------- cache ----
if [ -d "$APP_DIR/.next" ]; then
  idade=$(( ($(date +%s) - $(stat -c %Y "$APP_DIR/.next" 2>/dev/null || echo 0)) / 86400 ))
  if [ "$idade" -gt 1 ]; then
    warn ".next tem $idade dias — cache velho pode mascarar mudança de código."
    warn "Antes de investigar erro estranho: rm -rf .next && npm run build"
  else
    ok "Cache de build recente"
  fi
fi

# ----------------------------------------------------------------- fim ----
echo
hr
if [ "$problemas" -eq 0 ]; then
  ok "Instalação consistente — v$(app_version)"
else
  err "$problemas ponto(s) para revisar antes do próximo build"
fi
hr
