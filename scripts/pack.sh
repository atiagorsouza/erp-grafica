#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PrintFlow ERP — EMPACOTAMENTO DE RELEASE
#
# Uso: bash scripts/pack.sh [destino]        (padrão: ../release)
#
# Por que este script existe:
#   Os pacotes v3.21.0 a v3.25.0 foram gerados à mão com `tar -czf ...
#   erp-grafica`, o que grava o prefixo `erp-grafica/` dentro do .tar.gz.
#   O LEIA-ME manda extrair com `tar -xzf pacote.tar.gz -C .`, formato do
#   v3.20.0, cujos caminhos são relativos à raiz do projeto. Com o prefixo,
#   a extração cria `printflow-erp/erp-grafica/...` e NÃO substitui nada:
#   o usuário fica com código novo em arquivos que ninguém carrega e código
#   velho rodando — exatamente o sintoma de "função não existe".
#
#   Este script grava sempre no formato correto (conteúdo na raiz) e valida
#   o resultado antes de publicar.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$(cd "$ROOT/.." && pwd)/release}"
cd "$ROOT"

VERSION="$(head -n1 VERSION | tr -d '[:space:]')"
[ -n "$VERSION" ] || { echo "✖ VERSION vazio"; exit 1; }

mkdir -p "$DEST"
PKG="$DEST/printflow-erp-v$VERSION.tar.gz"

echo "Empacotando v$VERSION..."

# `-C "$ROOT" .` mantém os caminhos relativos à raiz do projeto, como o
# v3.20.0. Assim `tar -xzf ... -C .` sobrescreve os arquivos no lugar.
tar --exclude="./node_modules" \
    --exclude="./.next" \
    --exclude="./.git" \
    --exclude="./dist" \
    --exclude="./coverage" \
    --exclude="./.env" \
    --exclude="./tsconfig.tsbuildinfo" \
    -czf "$PKG" -C "$ROOT" .

# ---- validação: o pacote precisa extrair NA RAIZ, sem prefixo ----
# `head -1` fecha o pipe e o SIGPIPE aborta sob `pipefail`; lê a
# listagem inteira uma vez e guarda em variável.
LISTA="$(tar -tzf "$PKG")"
FIRST="$(printf '%s\n' "$LISTA" | sed -n 1p)"
if [ "$FIRST" != "./" ]; then
  echo "✖ Formato errado: o pacote começa em '$FIRST' (esperado './')."
  echo "  Extrair com -C . criaria uma pasta aninhada e o update não teria efeito."
  rm -f "$PKG"
  exit 1
fi

for f in package.json VERSION src/db/schema.ts scripts/update.sh; do
  printf '%s\n' "$LISTA" | grep -qx "./$f" || { echo "✖ Faltando no pacote: $f"; rm -f "$PKG"; exit 1; }
done

( cd "$DEST" && sha256sum "printflow-erp-v$VERSION.tar.gz" > "printflow-erp-v$VERSION.tar.gz.sha256" )

echo "✔ $PKG"
echo "  $(cd "$DEST" && cat "printflow-erp-v$VERSION.tar.gz.sha256")"
echo "  raiz: $FIRST · $(du -h "$PKG" | cut -f1)"
