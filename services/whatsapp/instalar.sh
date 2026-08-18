#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
#  Instala o serviço WhatsApp e deixa rodando sob PM2.
#
#    cd services/whatsapp && bash instalar.sh
#
#  Precisa rodar sempre, inclusive depois de reiniciar o servidor —
#  por isso PM2 com startup. Se o processo morrer, ele volta sozinho
#  e a sessão continua (está no banco, não em arquivo).
# ────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

VERDE=$'\e[32m'; VERM=$'\e[31m'; AMAR=$'\e[33m'; FIM=$'\e[0m'
ok()   { echo "  ${VERDE}✔${FIM} $*"; }
er()   { echo "  ${VERM}✖${FIM} $*"; }
warn() { echo "  ${AMAR}!${FIM} $*"; }

echo "────────────────────────────────────────────────────"
echo "  Serviço WhatsApp — instalação"
echo "────────────────────────────────────────────────────"

# ── Node 20+ ────────────────────────────────────────────────────────
V="$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)"
if [ -z "$V" ] || [ "$V" -lt 20 ]; then
  er "Baileys exige Node 20 ou mais novo (aqui: $(node -v 2>/dev/null || echo nenhum))"
  exit 1
fi
ok "Node $(node -v)"

# ── .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f ../../.env ]; then
    # O serviço precisa do mesmo banco do ERP: a sessão e as conversas
    # ficam lá. Reaproveitamos DATABASE_URL em vez de duplicar.
    grep -E '^DATABASE_URL=' ../../.env > .env
    ok ".env criado a partir do ERP"
  else
    er "Não achei o .env do ERP. Crie services/whatsapp/.env com DATABASE_URL."
    exit 1
  fi
fi

if ! grep -q '^WA_TOKEN=' .env; then
  TOKEN="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  echo "WA_TOKEN=$TOKEN" >> .env
  ok "WA_TOKEN gerado"

  # O ERP precisa do MESMO token para falar com o serviço.
  if [ -f ../../.env ] && ! grep -q '^WA_TOKEN=' ../../.env; then
    echo "WA_TOKEN=$TOKEN" >> ../../.env
    ok "mesmo token copiado para o .env do ERP"
  fi
else
  ok "WA_TOKEN já definido"
fi

grep -q '^WA_PORT=' .env || echo "WA_PORT=3101" >> .env
grep -q '^WA_EMPRESA=' .env || echo "WA_EMPRESA=VTDIGITAL" >> .env

# ── dependências ────────────────────────────────────────────────────
echo
echo "▸ Instalando dependências (Baileys e afins)…"
if npm install --no-audit --no-fund >/tmp/wa-npm.log 2>&1; then
  ok "$(ls node_modules 2>/dev/null | wc -l) pacotes"
else
  er "npm install falhou"; tail -15 /tmp/wa-npm.log; exit 1
fi

# ── PM2 ─────────────────────────────────────────────────────────────
echo
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete printflow-whatsapp >/dev/null 2>&1
  pm2 start src/index.mjs --name printflow-whatsapp \
    --time --max-memory-restart 400M >/dev/null 2>&1
  pm2 save >/dev/null 2>&1
  ok "rodando sob PM2 como 'printflow-whatsapp'"

  if ! pm2 startup 2>/dev/null | grep -q "already"; then
    warn "para subir sozinho depois de reiniciar o servidor, rode:"
    echo "       pm2 startup    (e execute a linha que ele mostrar)"
  fi
else
  warn "PM2 não está instalado — recomendado em produção"
  echo "       npm install -g pm2"
  echo
  echo "  Por enquanto, suba manualmente com: npm start"
fi

echo
echo "────────────────────────────────────────────────────"
ok "Pronto."
echo "────────────────────────────────────────────────────"
echo "  Abra o ERP em  →  Operação · WhatsApp"
echo "  Leia o QR com o celular e o bot começa a atender."
echo
echo "  Acompanhar:  pm2 logs printflow-whatsapp"
echo "  Reiniciar :  pm2 restart printflow-whatsapp"
echo "────────────────────────────────────────────────────"
