#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
#  Confere se o download chegou inteiro ANTES de instalar.
#
#    bash CONFERIR.sh
#
#  Existe porque em 20/08/2026 o dono baixou o pacote e recebeu ~23 KB
#  em vez de 700 KB. Arquivo truncado instala pela metade e o erro só
#  aparece depois, no meio do deploy — quando já é tarde.
#
#  Trinta segundos aqui evitam meia hora de confusão lá.
# ──────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1

VERDE=$'\e[32m'; VERM=$'\e[31m'; AMAR=$'\e[33m'; CINZA=$'\e[90m'; FIM=$'\e[0m'
ok() { echo "  ${VERDE}✔${FIM} $*"; }
er() { echo "  ${VERM}✖${FIM} $*"; }
hr() { echo "${CINZA}$(printf '─%.0s' {1..58})${FIM}"; }

PACOTE="$(ls printflow-erp-v*.tar.gz 2>/dev/null | head -1)"
FALHOU=0

echo
hr
echo "  CONFERÊNCIA DO PACOTE"
hr

# ── 1. O arquivo veio? ─────────────────────────────────────────────
if [ -z "$PACOTE" ] || [ ! -f "$PACOTE" ]; then
  er "não achei nenhum printflow-erp-v*.tar.gz nesta pasta"
  echo "     baixe o pacote e coloque aqui"
  exit 1
fi

BYTES="$(stat -c%s "$PACOTE" 2>/dev/null || stat -f%z "$PACOTE")"
KB=$(( BYTES / 1024 ))

echo "  arquivo : $PACOTE"
echo "  tamanho : ${KB} KB"
echo

# ── 2. Tamanho plausível? ──────────────────────────────────────────
# O pacote real tem ~700 KB. Abaixo de 300 KB é download interrompido
# ou página de erro salva com nome de arquivo.
if [ "$KB" -lt 300 ]; then
  er "TAMANHO ERRADO — o pacote tem cerca de 700 KB"
  echo
  echo "     ${AMAR}O download veio incompleto.${FIM} O que costuma resolver:"
  echo "       · baixar de novo, esperando a barra terminar"
  echo "       · usar outro navegador (ou aba anônima)"
  echo "       · se for por wget/curl no servidor, acrescentar  -C -"
  echo
  if head -c 200 "$PACOTE" | grep -qiE "<html|<!doctype|<head"; then
    er "e o conteúdo é uma PÁGINA WEB, não um pacote"
    echo "     o link expirou ou pediu login — baixe novamente"
  fi
  exit 1
fi
ok "tamanho plausível"

# ── 3. Checksum ────────────────────────────────────────────────────
if [ -f "${PACOTE}.sha256" ]; then
  if sha256sum -c "${PACOTE}.sha256" >/dev/null 2>&1; then
    ok "checksum confere — é byte a byte o arquivo original"
  else
    er "CHECKSUM NÃO CONFERE — o arquivo chegou corrompido"
    echo "     esperado: $(cut -d' ' -f1 "${PACOTE}.sha256" | head -c 20)…"
    echo "     recebido: $(sha256sum "$PACOTE" | cut -d' ' -f1 | head -c 20)…"
    FALHOU=1
  fi
else
  echo "  ${AMAR}!${FIM} sem arquivo .sha256 para comparar"
fi

# ── 4. Abre? ───────────────────────────────────────────────────────
if tar -tzf "$PACOTE" >/dev/null 2>&1; then
  N="$(tar -tzf "$PACOTE" | wc -l | tr -d ' ')"
  ok "abre sem erro — $N arquivos dentro"
  if [ "$N" -lt 300 ]; then
    er "poucos arquivos: o pacote completo tem cerca de 375"
    FALHOU=1
  fi
else
  er "NÃO ABRE — arquivo corrompido"
  FALHOU=1
fi

# ── 5. Tem o que precisa? ──────────────────────────────────────────
ESSENCIAIS="./package.json ./VERSION ./src/db/schema.ts ./scripts/deploy-auto.sh"
LISTA="$(tar -tzf "$PACOTE" 2>/dev/null)"
FALTAM=""
for f in $ESSENCIAIS; do
  printf '%s\n' "$LISTA" | grep -qx "$f" || FALTAM="$FALTAM $f"
done
if [ -n "$FALTAM" ]; then
  er "faltam arquivos essenciais:$FALTAM"
  FALHOU=1
else
  ok "arquivos essenciais presentes"
fi

VERSAO="$(tar -xzOf "$PACOTE" ./VERSION 2>/dev/null | tr -d '[:space:]')"
[ -n "$VERSAO" ] && ok "versão no pacote: v$VERSAO"

echo
hr
if [ "$FALHOU" -eq 0 ]; then
  echo "  ${VERDE}✔ PACOTE ÍNTEGRO — pode instalar${FIM}"
  hr
  echo "  Agora rode:"
  echo "    bash deploy-auto.sh"
else
  echo "  ${VERM}✖ NÃO INSTALE — baixe o pacote de novo${FIM}"
  hr
fi
echo
exit "$FALHOU"
