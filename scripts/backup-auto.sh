#!/usr/bin/env bash
# =============================================================================
# PrintFlow ERP · Backup automático (para rodar via cron)
#
# Diferente do backup.sh, que é feito à mão antes de um update, este roda
# sozinho todo dia e mantém uma rotação:
#   - 7 diários
#   - 4 semanais (o de domingo é promovido a semanal)
#
# Uso manual:   bash scripts/backup-auto.sh
# Instalar cron: bash scripts/backup-auto.sh --instalar-cron
# Testar restauração: bash scripts/backup-auto.sh --verificar
# =============================================================================
set -euo pipefail

. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

DIARIO_DIR="$BACKUP_DIR/diario"
SEMANAL_DIR="$BACKUP_DIR/semanal"
LOG_FILE="$LOG_DIR/backup-auto.log"

MANTER_DIARIOS=7
MANTER_SEMANAIS=4

# Cópia externa: se BACKUP_EXTERNO estiver definido no .env, o backup do dia
# é copiado para lá. Backup no mesmo disco do banco não protege contra o
# disco falhar — que é justamente o caso mais comum.
EXTERNO="${BACKUP_EXTERNO:-}"

registrar() {
  mkdir -p "$LOG_DIR"
  printf '%s | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
}

# ---------------------------------------------------------------- backup ----
gerar_backup() {
  mkdir -p "$DIARIO_DIR" "$SEMANAL_DIR"
  load_env
  require_cmd pg_dump

  local stamp arquivo tamanho
  stamp="$(date +%Y%m%d-%H%M%S)"
  arquivo="$DIARIO_DIR/diario-$(app_version)-${stamp}.sql.gz"

  step "Backup automático"

  # pipefail está ligado, então uma falha do pg_dump derruba o pipe inteiro
  # em vez de gerar um .gz vazio e "bem-sucedido".
  if ! pg_dump "$(db_url)" | gzip > "$arquivo"; then
    rm -f "$arquivo"
    registrar "ERRO: pg_dump falhou"
    die "Falha ao gerar backup."
  fi

  # Um dump vazio ou minúsculo indica erro silencioso. 1 KB é generoso:
  # qualquer banco com schema passa disso.
  tamanho=$(stat -c%s "$arquivo" 2>/dev/null || echo 0)
  if [ "$tamanho" -lt 1024 ]; then
    rm -f "$arquivo"
    registrar "ERRO: backup gerado com apenas ${tamanho} bytes"
    die "Backup suspeito (${tamanho} bytes) — descartado."
  fi

  ok "Backup: $arquivo ($(numfmt --to=iec "$tamanho" 2>/dev/null || echo "${tamanho}B"))"
  registrar "OK: $arquivo (${tamanho} bytes)"

  # Domingo vira o backup semanal.
  if [ "$(date +%u)" = "7" ]; then
    cp "$arquivo" "$SEMANAL_DIR/semanal-$(app_version)-${stamp}.sql.gz"
    ok "Cópia semanal criada"
    registrar "OK: cópia semanal"
  fi

  copiar_externo "$arquivo"
  rotacionar
}

copiar_externo() {
  local arquivo="$1"
  [ -n "$EXTERNO" ] || { warn "BACKUP_EXTERNO não definido no .env — backup só existe neste servidor"; return 0; }

  if [ -d "$EXTERNO" ]; then
    cp "$arquivo" "$EXTERNO/" && ok "Cópia externa: $EXTERNO"
    registrar "OK: cópia externa em $EXTERNO"
  else
    warn "BACKUP_EXTERNO aponta para um caminho que não existe: $EXTERNO"
    registrar "AVISO: destino externo inacessível"
  fi
}

# Remove os mais antigos de um diretório, mantendo os N mais recentes.
# Escrito com `find`+`sort` em vez de `ls | tail` porque common.sh liga
# `pipefail`: quando a pasta está vazia o `ls` falha, o pipe inteiro
# retorna erro e o script morre em silêncio antes de terminar a rotação.
podar() {
  local dir="$1" padrao="$2" manter="$3" total sobra=0
  [ -d "$dir" ] || { echo 0; return 0; }

  total=$(find "$dir" -maxdepth 1 -name "$padrao" -type f 2>/dev/null | wc -l)
  if [ "$total" -gt "$manter" ]; then
    sobra=$((total - manter))
    find "$dir" -maxdepth 1 -name "$padrao" -type f -printf '%T@ %p\n' 2>/dev/null \
      | sort -n | head -n "$sobra" | cut -d' ' -f2- \
      | while read -r velho; do rm -f "$velho"; done
  fi
  echo "$sobra"
}

contar() {
  find "$1" -maxdepth 1 -name '*.sql.gz' -type f 2>/dev/null | wc -l
}

rotacionar() {
  local removidos
  removidos=$(podar "$DIARIO_DIR" 'diario-*.sql.gz' "$MANTER_DIARIOS")
  podar "$SEMANAL_DIR" 'semanal-*.sql.gz' "$MANTER_SEMANAIS" >/dev/null

  ok "Retenção: $(contar "$DIARIO_DIR") diários, $(contar "$SEMANAL_DIR") semanais"
  [ "$removidos" -gt 0 ] && registrar "rotação: $removidos diário(s) removido(s)" || true
}

# ------------------------------------------------------------ verificação ----
# Backup que nunca foi restaurado não é backup. Isto restaura o dump mais
# recente num banco descartável e confere se as tabelas principais têm
# dados. Não toca no banco de produção.
verificar() {
  load_env
  require_cmd psql

  local ultimo banco_teste url_base
  ultimo="$(ls -1t "$DIARIO_DIR"/diario-*.sql.gz 2>/dev/null | head -1)"
  [ -n "$ultimo" ] || die "Nenhum backup diário encontrado para verificar."

  step "Verificando se o backup restaura de verdade"
  log "Arquivo: $ultimo"

  banco_teste="printflow_verifica_$$"
  url_base="$(db_url | sed 's#/[^/]*$##')"

  psql "$(db_url)" -v ON_ERROR_STOP=1 -qAt -c "create database ${banco_teste};" >/dev/null \
    || die "Não foi possível criar o banco de verificação."

  local falhou=0
  if ! gunzip -c "$ultimo" | psql "${url_base}/${banco_teste}" -v ON_ERROR_STOP=1 -q >/dev/null 2>&1; then
    err "A restauração falhou."
    falhou=1
  else
    local resumo
    resumo=$(psql "${url_base}/${banco_teste}" -qAt -c \
      "select 'clientes='||(select count(*) from customers)||' produtos='||(select count(*) from products)||' vendas='||(select count(*) from sales);" 2>/dev/null || echo "")
    if [ -n "$resumo" ]; then
      ok "Restaurou: $resumo"
      registrar "VERIFICAÇÃO OK: $resumo"
    else
      err "Restaurou, mas as tabelas principais não responderam."
      falhou=1
    fi
  fi

  psql "$(db_url)" -qAt -c "drop database if exists ${banco_teste};" >/dev/null 2>&1 || true

  if [ "$falhou" = "1" ]; then
    registrar "VERIFICAÇÃO FALHOU: $ultimo"
    die "Backup NÃO confiável. Investigue antes de precisar dele."
  fi
  ok "Backup verificado — este arquivo restaura."
}

# ------------------------------------------------------------------ cron ----
instalar_cron() {
  local linha_backup linha_verifica
  linha_backup="0 2 * * * cd $APP_DIR && bash scripts/backup-auto.sh >> $LOG_DIR/cron.log 2>&1"
  linha_verifica="30 3 * * 0 cd $APP_DIR && bash scripts/backup-auto.sh --verificar >> $LOG_DIR/cron.log 2>&1"

  step "Instalando agendamento no cron"

  if crontab -l 2>/dev/null | grep -q "backup-auto.sh"; then
    warn "Já existe agendamento do backup-auto.sh. Removendo o antigo antes."
    crontab -l 2>/dev/null | grep -v "backup-auto.sh" | crontab -
  fi

  { crontab -l 2>/dev/null; echo "$linha_backup"; echo "$linha_verifica"; } | crontab -

  ok "Backup diário às 02:00"
  ok "Verificação de restauração aos domingos às 03:30"
  echo
  log "Conferir com:  crontab -l"
  log "Acompanhar:    tail -f $LOG_FILE"
}

# ------------------------------------------------------------------ main ----
case "${1:-}" in
  --instalar-cron) banner; instalar_cron ;;
  --verificar)     banner; verificar ;;
  --ajuda|-h)
    cat <<EOF

Backup automático do PrintFlow ERP

  bash scripts/backup-auto.sh                  gera o backup do dia
  bash scripts/backup-auto.sh --instalar-cron  agenda no cron (diário 02:00)
  bash scripts/backup-auto.sh --verificar      testa se o backup restaura

Retenção: ${MANTER_DIARIOS} diários + ${MANTER_SEMANAIS} semanais (domingo).
Cópia externa: defina BACKUP_EXTERNO no .env com um caminho de destino.

EOF
    ;;
  *) banner; gerar_backup ;;
esac
