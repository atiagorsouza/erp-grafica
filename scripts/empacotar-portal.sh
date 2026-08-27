#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
#  empacotar-portal.sh — gera o pacote do PORTAL DO CLIENTE (Hostinger)
#
#  O portal não roda no servidor da gráfica: é hospedado na Hostinger
#  e atualizado por PACOTE (zip), não por git pull. Este script cria:
#
#    release/portal-v<versão>-<data>.zip
#
#  …com o conteúdo de portal-hostinger/ + um LEIA-ME de implantação.
#  O upload na Hostinger é feito pelo dono (gerenciador/FTP).
#  Ver AGENTE-SERVIDOR.md §8.
# ────────────────────────────────────────────────────────────────────
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTAL="$RAIZ/portal-hostinger"
RELEASE="$RAIZ/release"

# Versão do portal: VERSION próprio, se existir; senão a do ERP.
if [ -f "$PORTAL/VERSION" ]; then
  VER="$(tr -d '[:space:]' < "$PORTAL/VERSION")"
else
  VER="$(tr -d '[:space:]' < "$RAIZ/VERSION")-erp"
fi
DATA="$(date +%Y%m%d)"
DESTINO="$RELEASE/portal-v${VER}-${DATA}.zip"

if [ ! -d "$PORTAL" ] || [ -z "$(ls -A "$PORTAL" 2>/dev/null | grep -v '^README\.md$' || true)" ]; then
  echo "! portal-hostinger/ ainda não tem código — nada para empacotar."
  echo "  Convenção (AGENTE-SERVIDOR.md §8): o portal do cliente mora em"
  echo "  portal-hostinger/ com VERSION próprio. Quando o desenvolvimento"
  echo "  entregar a primeira versão, este script gera o zip para a Hostinger."
  exit 0
fi

mkdir -p "$RELEASE"
mkdir -p /tmp/portal-pkg
rm -rf /tmp/portal-pkg/*
cp -r "$PORTAL"/. /tmp/portal-pkg/

cat > /tmp/portal-pkg/LEIA-ME-HOSTINGER.txt <<EOF
PORTAL DO CLIENTE VTDIGITAL — v${VER} (${DATA})
================================================

1. No gerenciador de arquivos da Hostinger, envie este zip na pasta
   pública do domínio do portal e extraia (ou extraia antes e envie
   o conteúdo).
2. Confira a configuração de conexão com o ERP:
   - endpoint: https://app.vtdigital.site/api/portal
   - chave: definida em PORTAL_API_KEYS no .env do ERP (Painel → Integrações)
3. Teste: abrir o portal no navegador e submeter um pedido de teste.

Dúvidas de operação: AGENTE-SERVIDOR.md §8 no repositório do ERP.
EOF

if command -v zip >/dev/null 2>&1; then
  (cd /tmp/portal-pkg && zip -qr "$DESTINO" .)
else
  tar -czf "${DESTINO%.zip}.tar.gz" -C /tmp/portal-pkg .
  DESTINO="${DESTINO%.zip}.tar.gz"
  echo "! comando zip ausente — gerei tar.gz no lugar."
fi
rm -rf /tmp/portal-pkg

echo "✅ Pacote do portal gerado: $DESTINO"
echo "   Próximo passo (dono): subir na Hostinger — LEIA-ME dentro do pacote."
