#!/usr/bin/env bash
# =============================================================================
# Deploy da v3.46.6 — executa e PROVA o resultado.
#
# Uso, na pasta do app, com o .zip ou .tar.gz ao lado:
#   bash deploy.sh
#
# Escrito porque as últimas atualizações "subiram com sucesso" mas o
# /api/version continuou respondendo a versão antiga. Este script mata o
# processo antigo antes de reconstruir e confere o resultado no fim — se
# a versão não mudar, ele avisa em vez de dizer que deu certo.
# =============================================================================
set -uo pipefail

APP="${1:-$(pwd)}"
ALVO="3.46.6"
PORTA="${PORT:-3000}"
cd "$APP" || { echo "✖ pasta não encontrada: $APP"; exit 1; }

ok(){ printf '\033[1;32m✔\033[0m %s\n' "$*"; }
er(){ printf '\033[1;31m✖\033[0m %s\n' "$*"; }
step(){ printf '\033[1;36m→\033[0m %s\n' "$*"; }
hr(){ printf '%s\n' "──────────────────────────────────────────────"; }

hr; echo "  Deploy v$ALVO em $APP"; hr

# ---------------------------------------------------------------- 0. antes --
ANTES="$(curl -s --max-time 5 "localhost:$PORTA/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4)"
step "versão no ar agora: ${ANTES:-(nada respondendo)}"

# --------------------------------------------------------------- 1. backup --
if [ -n "${DATABASE_URL:-}" ] || [ -f .env ]; then
  [ -f .env ] && set -a && . ./.env && set +a
fi
if command -v pg_dump >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  DEST="$HOME/backup-antes-$ALVO-$(date +%Y%m%d-%H%M%S).sql"
  if pg_dump "$DATABASE_URL" > "$DEST" 2>/dev/null && [ -s "$DEST" ]; then
    ok "backup: $DEST ($(du -h "$DEST" | cut -f1))"
  else
    er "backup FALHOU — parando por segurança"; exit 1
  fi
else
  er "sem pg_dump ou DATABASE_URL — faça o backup à mão antes"; exit 1
fi

# ------------------------------------------------- 2. matar o que está no ar --
# O passo que costuma faltar: sem isto o processo velho continua servindo
# o build antigo da memória, e o /api/version nunca muda.
step "parando processos..."
pm2 stop printflow    >/dev/null 2>&1
pm2 delete printflow  >/dev/null 2>&1
pkill -9 -f "next start"      2>/dev/null
pkill -9 -f "next-server"     2>/dev/null
pkill -9 -f "next/dist/bin"   2>/dev/null
sleep 3
# Rede de segurança: em produção o processo aparece como "next-server",
# não como "next start" — um pkill pelo comando original não o alcança.
# É por isso que builds novos "subiam" e o /api/version não mudava.
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORTA}/tcp" 2>/dev/null
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti ":${PORTA}" 2>/dev/null | xargs -r kill -9
fi
sleep 2
if curl -s --max-time 3 "localhost:$PORTA/api/version" >/dev/null 2>&1; then
  er "ainda tem algo servindo a porta $PORTA — descubra com: lsof -i :$PORTA"
  exit 1
fi
ok "porta $PORTA livre"

# -------------------------------------------------------------- 3. extrair --
PKG=""
for c in "printflow-erp-v$ALVO.zip" "printflow-erp-v$ALVO.tar.gz"; do
  [ -f "$c" ] && PKG="$c" && break
done
[ -z "$PKG" ] && { er "pacote da v$ALVO não encontrado nesta pasta"; exit 1; }
step "extraindo $PKG"
case "$PKG" in
  *.zip)    unzip -oq "$PKG" -d "$APP" ;;
  *.tar.gz) tar -xzf "$PKG" -C "$APP" ;;   # SEM --strip-components
esac
VER_ARQ="$(tr -d '[:space:]' < VERSION 2>/dev/null)"
[ "$VER_ARQ" != "$ALVO" ] && { er "VERSION diz '$VER_ARQ', esperado '$ALVO'"; exit 1; }
ok "arquivos da v$ALVO no lugar"

# ------------------------------------------------------------- 4. sobras ----
if [ -f scripts/verificar-instalacao.sh ]; then
  bash scripts/verificar-instalacao.sh || true
fi

# ---------------------------------------------------------------- 5. build --
step "instalando dependências (inclui tailwind-merge)..."
NODE_ENV=development npm install --include=dev --no-audit --no-fund >/dev/null 2>&1 || {
  er "npm install falhou"; exit 1; }
ok "dependências ok"

step "build limpo..."
rm -rf .next
# O build do Next roda o TypeScript num worker que consome bastante RAM.
# Em servidor pequeno o kernel mata o processo (SIGKILL) e o build falha
# sem erro de código. Reservar heap evita isso.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
if ! npm run build > /tmp/build-$ALVO.log 2>&1; then
  if grep -q "SIGKILL\|out of memory\|heap out of memory" /tmp/build-$ALVO.log; then
    er "build morreu por FALTA DE MEMÓRIA, não por erro de código."
    echo "   Tente parar outros serviços e rodar de novo, ou:"
    echo "     NODE_OPTIONS=--max-old-space-size=4096 npm run build"
    echo "   Se o servidor tiver pouca RAM, criar swap resolve:"
    echo "     sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile"
    echo "     sudo mkswap /swapfile && sudo swapon /swapfile"
  else
    er "build FALHOU — últimas linhas:"; tail -20 /tmp/build-$ALVO.log
  fi
  exit 1
fi
ok "build concluído"

# ---------------------------------------------------------------- 6. subir --
step "subindo..."
if [ -f ecosystem.config.js ] && command -v pm2 >/dev/null 2>&1; then
  pm2 start ecosystem.config.js >/dev/null 2>&1
else
  nohup ./node_modules/.bin/next start -H 0.0.0.0 -p "$PORTA" > /tmp/next-$ALVO.log 2>&1 &
fi
for i in $(seq 1 30); do
  curl -s --max-time 2 "localhost:$PORTA/api/version" >/dev/null 2>&1 && break
  sleep 1
done

# ---------------------------------------------------------------- 7. PROVA --
hr; echo "  Verificação"; hr
DEPOIS="$(curl -s --max-time 5 "localhost:$PORTA/api/version" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)"
if [ "$DEPOIS" = "$ALVO" ]; then
  ok "/api/version = $DEPOIS"
else
  er "/api/version = ${DEPOIS:-(nada)} — esperado $ALVO. O build novo NÃO está no ar."
  exit 1
fi

# O teste que importa: o campo escuro não pode mais trazer bg-white.
HTML="$(curl -s --max-time 10 "localhost:$PORTA/pdv" 2>/dev/null)"
CONFLITO="$(printf '%s' "$HTML" | grep -oE '<input[^>]{0,500}' | grep 'bg-white' | grep -c 'bg-ink-' || true)"
ESCUROS="$(printf '%s' "$HTML" | grep -oE '<input[^>]{0,500}' | grep -c 'bg-ink-9' || true)"

echo "  campos escuros no PDV        : $ESCUROS"
echo "  campos com bg-white + bg-ink : $CONFLITO   (tem que ser 0)"

if [ "${CONFLITO:-1}" = "0" ]; then
  ok "campo 'Recebido R\$' legível — correção aplicada"
else
  er "ainda há conflito de cor: o build antigo ficou em algum lugar"
  exit 1
fi

hr
ok "v$ALVO no ar (antes: ${ANTES:-nenhuma})"
echo
echo "No navegador: PDV → item → Dinheiro → digite 100,00 em Recebido R\$"
echo "Se parecer branco AGORA, é cache do navegador: Ctrl+Shift+R"
hr
