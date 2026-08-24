#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
#  SOCORRO — "o site caiu, e agora?"
#
#    bash scripts/socorro.sh              diagnostica (não muda nada)
#    bash scripts/socorro.sh --consertar  diagnostica e conserta
#
#  Feito depois do apagão de 19/08/2026, quando `npm install --omit=dev`
#  deixou o .next pela metade e o site ficou fora do ar. O diagnóstico
#  levou vários comandos manuais; este script faz tudo de uma vez e
#  responde em português o que está errado.
#
#  Sem --consertar, ele NÃO toca em nada. Só olha e conta.
# ──────────────────────────────────────────────────────────────────
set -uo pipefail

CONSERTAR=0
[ "${1:-}" = "--consertar" ] && CONSERTAR=1

VERDE=$'\e[32m'; VERM=$'\e[31m'; AMAR=$'\e[33m'; CINZA=$'\e[90m'; FIM=$'\e[0m'
ok()   { echo "  ${VERDE}✔${FIM} $*"; }
er()   { echo "  ${VERM}✖${FIM} $*"; }
av()   { echo "  ${AMAR}!${FIM} $*"; }
hr()   { echo "${CINZA}$(printf '─%.0s' {1..62})${FIM}"; }
step() { echo; echo "${CINZA}▸${FIM} $*"; }

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ" || exit 1
PORTA="${PORT:-3000}"
PROBLEMAS=()

echo
hr
echo "  SOCORRO — PrintFlow ERP   $([ $CONSERTAR = 1 ] && echo '(modo conserto)' || echo '(só diagnóstico)')"
hr
echo "  pasta: $RAIZ"

# ── 1. O site responde? ────────────────────────────────────────────
step "1  O site está no ar?"
CODIGO="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PORTA}/api/version" 2>/dev/null | tail -c 3)"
CODIGO="${CODIGO:-000}"
if [ "$CODIGO" = "200" ]; then
  V="$(curl -s --max-time 5 "http://127.0.0.1:${PORTA}/api/version" 2>/dev/null)"
  CODE_V="$(echo "$V" | grep -oE '"version":"[^"]+"' | cut -d'"' -f4)"
  BANCO_V="$(echo "$V" | grep -oE '"installedVersion":"[^"]+"' | cut -d'"' -f4)"
  ok "respondendo na porta ${PORTA} — versão ${CODE_V:-?}"
  if [ -n "$BANCO_V" ] && [ "$BANCO_V" != "$CODE_V" ]; then
    av "banco diz ${BANCO_V} e o código diz ${CODE_V} — deploy pela metade"
    PROBLEMAS+=("versao-divergente")
  fi
  # Site no ar: o resto é bônus, mas vale conferir.
else
  er "nada respondendo na porta ${PORTA} (HTTP ${CODIGO})"
  PROBLEMAS+=("fora-do-ar")
fi

# ── 2. O build está inteiro? ───────────────────────────────────────
step "2  O build está completo?"
# BUILD_ID é o último arquivo que o Next escreve. Sem ele, o build
# parou no meio — e `next start` nem tenta subir.
if [ -f .next/BUILD_ID ]; then
  ok "BUILD_ID presente ($(head -c 12 .next/BUILD_ID))"
  FALTAM=""
  for f in prerender-manifest.json routes-manifest.json build-manifest.json; do
    [ -f ".next/$f" ] || FALTAM="$FALTAM $f"
  done
  if [ -n "$FALTAM" ]; then
    er "faltam manifestos:$FALTAM"
    PROBLEMAS+=("build-incompleto")
  else
    ok "manifestos no lugar"
  fi
elif [ -d .next ]; then
  er "existe .next MAS sem BUILD_ID — build parou no meio"
  echo "     (é o que derruba o site: o next start sai na hora)"
  PROBLEMAS+=("build-incompleto")
else
  er "não existe .next — nunca foi feito build aqui"
  PROBLEMAS+=("build-incompleto")
fi

# ── 3. As dependências de build existem? ───────────────────────────
step "3  As dependências para compilar estão instaladas?"
# TypeScript e Tailwind são devDependencies e o build PRECISA deles.
# `npm install --omit=dev` os pula, e aí o webpack não resolve os
# atalhos @/ do tsconfig. Foi a causa do apagão de 19/08/2026.
FALTANDO=""
for m in typescript tailwindcss @tailwindcss/postcss postcss; do
  [ -d "node_modules/$m" ] || FALTANDO="$FALTANDO $m"
done
if [ -n "$FALTANDO" ]; then
  er "faltando para compilar:$FALTANDO"
  echo "     provável causa: npm install --omit=dev"
  PROBLEMAS+=("deps-faltando")
else
  ok "typescript, tailwind e postcss presentes"
fi
[ -d node_modules/next ] || { er "o próprio next não está instalado"; PROBLEMAS+=("deps-faltando"); }

# ── 4. O banco responde? ───────────────────────────────────────────
step "4  O banco responde?"
if [ -f .env ] && grep -q "^DATABASE_URL" .env; then
  if node -e "
    require('dotenv').config();
    const pg=require('pg');
    const c=new pg.Client({connectionString:process.env.DATABASE_URL});
    c.connect().then(()=>c.query('select count(*) n from settings'))
     .then(r=>{console.log('  ok '+r.rows[0].n);process.exit(0)})
     .catch(e=>{console.error('  '+e.message);process.exit(1)});
  " >/tmp/socorro-db.log 2>&1; then
    ok "banco acessível ($(grep -oE '[0-9]+' /tmp/socorro-db.log | tail -1) configurações)"
  else
    er "banco não respondeu: $(grep -viE '^\s*$|^Node\.js|^\s+at |throw|\^' /tmp/socorro-db.log | head -1 | cut -c1-70)"
    PROBLEMAS+=("banco")
  fi
else
  er "não achei DATABASE_URL no .env"
  PROBLEMAS+=("env")
fi

# ── 5. Quem está de pé? ────────────────────────────────────────────
step "5  Processos"
if command -v pm2 >/dev/null 2>&1; then
  LISTA="$(pm2 jlist 2>/dev/null || echo '[]')"
  N="$(echo "$LISTA" | grep -o '"name"' | wc -l)"
  if [ "$N" -gt 0 ]; then
    pm2 list 2>/dev/null | grep -E "name|online|errored|stopped" | head -8
    if echo "$LISTA" | grep -q '"status":"errored"'; then
      av "há processo em estado 'errored' — veja: pm2 logs --lines 40"
      PROBLEMAS+=("pm2-errored")
    fi
  else
    av "pm2 instalado mas sem nenhum processo registrado"
    PROBLEMAS+=("pm2-vazio")
  fi
else
  av "pm2 não encontrado"
fi
QUEM="$(ss -ltnp 2>/dev/null | grep ":${PORTA} " || true)"
[ -n "$QUEM" ] && echo "     porta ${PORTA}: $(echo "$QUEM" | head -1 | tr -s ' ')" \
               || echo "     porta ${PORTA}: livre"

# ── 6. Memória ─────────────────────────────────────────────────────
step "6  Memória"
if command -v free >/dev/null 2>&1; then
  free -h | sed -n '1,3p' | sed 's/^/     /'
  LIVRE_MB="$(free -m | awk '/^Mem:/{print $7}')"
  SWAP_MB="$(free -m | awk '/^Swap:/{print $2}')"
  if [ "${LIVRE_MB:-0}" -lt 900 ] && [ "${SWAP_MB:-0}" -lt 500 ]; then
    av "pouca memória livre e quase sem swap — o build pode morrer"
    PROBLEMAS+=("memoria")
  fi
fi
if command -v dmesg >/dev/null 2>&1; then
  MORTOS="$(dmesg -T 2>/dev/null | grep -ci "killed process" 2>/dev/null | head -1 | tr -dc '0-9')"
  [ "${MORTOS:-0}" -gt 0 ] 2>/dev/null && av "o sistema já matou ${MORTOS} processo(s) por falta de memória"
fi

# ── Veredito ───────────────────────────────────────────────────────
echo
hr
if [ ${#PROBLEMAS[@]} -eq 0 ]; then
  echo "  ${VERDE}✔ Nada de errado encontrado.${FIM}"
  hr; echo; exit 0
fi

echo "  ${VERM}✖ ${#PROBLEMAS[@]} problema(s):${FIM} ${PROBLEMAS[*]}"
hr

TEM() { printf '%s\n' "${PROBLEMAS[@]}" | grep -qx "$1"; }

echo
echo "  O QUE FAZER:"
echo

if TEM "deps-faltando" || TEM "build-incompleto"; then
  cat <<'RECEITA'
   O build está incompleto, quase sempre por dependência faltando.
   TypeScript e Tailwind são devDependencies e o build PRECISA deles
   — nunca use --omit=dev para compilar.

     rm -rf .next node_modules
     npm install            # TUDO, sem --omit=dev
     npm run build
     ls -la .next/BUILD_ID  # tem que existir

RECEITA
fi

if TEM "fora-do-ar" || TEM "pm2-vazio" || TEM "pm2-errored"; then
  cat <<RECEITA
   Depois que o build estiver ok, suba o serviço:

     pm2 delete printflow 2>/dev/null
     pm2 start npm --name printflow -- start
     pm2 save                 # <- sem isso não volta após reboot
     curl -s localhost:${PORTA}/api/version

RECEITA
fi

if TEM "versao-divergente"; then
  echo "   Código e banco em versões diferentes: rode o deploy completo"
  echo "     bash scripts/deploy-auto.sh"
  echo
fi

if TEM "memoria"; then
  echo "   Crie swap antes de buildar:"
  echo "     sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile"
  echo "     sudo mkswap /swapfile && sudo swapon /swapfile"
  echo
fi

# ── Conserto automático ────────────────────────────────────────────
if [ $CONSERTAR = 1 ]; then
  hr
  echo "  ${AMAR}Consertando...${FIM}"
  hr

  if TEM "deps-faltando" || TEM "build-incompleto"; then
    step "Reinstalando dependências (com as de desenvolvimento)"
    rm -rf .next
    if NODE_ENV=development npm install --include=dev --no-audit --no-fund >/tmp/socorro-npm.log 2>&1; then
      ok "dependências instaladas"
    else
      er "npm install falhou"; tail -12 /tmp/socorro-npm.log; exit 1
    fi

    step "Refazendo o build"
    export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
    if npm run build >/tmp/socorro-build.log 2>&1 && [ -f .next/BUILD_ID ]; then
      ok "build completo (BUILD_ID $(head -c 12 .next/BUILD_ID))"
    elif grep -qiE "SIGKILL|out of memory|heap out of memory|Killed" /tmp/socorro-build.log; then
      # SIGKILL sem mensagem de erro = o sistema matou por memória.
      # Distinguir isso de erro de código importa: um se resolve com
      # swap, o outro não.
      er "o build foi MORTO por falta de memória (não é erro de código)"
      echo
      echo "     Crie swap e rode de novo:"
      echo "       sudo fallocate -l 2G /swapfile"
      echo "       sudo chmod 600 /swapfile && sudo mkswap /swapfile"
      echo "       sudo swapon /swapfile"
      echo "       bash scripts/socorro.sh --consertar"
      echo
      echo "     Se não puder criar swap, derrube o que estiver rodando"
      echo "     antes de buildar — dois Node competindo pela RAM é o"
      echo "     jeito mais comum de chegar aqui."
      exit 1
    else
      er "o build falhou de novo"
      grep -E "Module not found|Can't resolve|Error:|error" /tmp/socorro-build.log | head -10
      echo "     log completo: /tmp/socorro-build.log"
      exit 1
    fi
  fi

  step "Subindo o serviço"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete printflow >/dev/null 2>&1
    if pm2 start npm --name printflow -- start >/dev/null 2>&1; then
      pm2 save >/dev/null 2>&1
      ok "processo 'printflow' iniciado e salvo no pm2"
    else
      er "pm2 não conseguiu subir"; exit 1
    fi
  else
    av "sem pm2 — suba manualmente com: npm start"
  fi

  step "Conferindo"
  for i in $(seq 1 20); do
    C="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${PORTA}/api/version" 2>/dev/null || echo 000)"
    [ "$C" = "200" ] && break
    sleep 2
  done
  if [ "$C" = "200" ]; then
    V="$(curl -s "http://127.0.0.1:${PORTA}/api/version")"
    ok "no ar: $(echo "$V" | grep -oE '"version":"[^"]+"' | cut -d'"' -f4)"
    node scripts/check-version.mjs 2>/dev/null | tail -1
    echo
    hr
    echo "  ${VERDE}✔ SITE DE VOLTA${FIM}"
    hr
  else
    er "ainda não responde. Veja: pm2 logs printflow --lines 40"
    exit 1
  fi
fi
echo
