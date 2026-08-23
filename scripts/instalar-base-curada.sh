#!/usr/bin/env bash
# ===================================================================
#  INSTALA A BASE CURADA NO SERVIDOR
#
#    bash instalar-base-curada.sh
#
#  Substitui a base de demonstração pela configuração real: painel,
#  categorias, parque gráfico, materiais conferidos e produtos com
#  suas faixas de preço.
#
#  O QUE APAGA: orçamentos, pedidos, vendas do PDV, lançamentos
#  financeiros, movimentos de estoque, compras, kanban, leads,
#  produtos, materiais, impressoras e configurações.
#
#  O QUE NÃO APAGA: CLIENTES. Eles são seus, e o script nem toca na
#  tabela.
#
#  FAZ BACKUP ANTES, sempre. Se algo der errado, a última linha da
#  tela mostra o comando exato para voltar atrás.
# ===================================================================
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="$AQUI/../base-curada.sql"
[ -f "$SQL" ] || SQL="$AQUI/base-curada.sql"

if [ ! -f "$SQL" ]; then
  echo "ERRO: base-curada.sql não encontrado ao lado do script."
  exit 1
fi

# A senha nunca vai no comando: o psql lê de PGPASSWORD ou pergunta.
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-app_db}"
export PGHOST PGPORT PGUSER PGDATABASE

BACKUP="$HOME/backup-antes-base-curada-$(date +%Y%m%d-%H%M%S).sql"

echo
echo "  ┌──────────────────────────────────────────────────────┐"
echo "  │  INSTALAR BASE CURADA                                │"
echo "  └──────────────────────────────────────────────────────┘"
echo
echo "  Banco:   $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"
echo "  Arquivo: $SQL"
echo

echo "  → Conferindo a conexão…"
psql -tAc "select 1" >/dev/null
echo "    conectado."

# ── TRAVA DE SCHEMA ────────────────────────────────────────────────
# O arquivo é gerado a partir do schema da versão nova. Se o banco
# ainda estiver no schema antigo, o primeiro INSERT que citar uma
# coluna nova aborta a transação inteira — e o resultado é uma base
# VAZIA (materiais 0, produtos 0) sem nenhum aviso claro.
#
# Aconteceu de verdade no deploy da 3.67.0: a parte 1 subiu o código
# mas a migração não rodou, e a parte 2 pareceu funcionar.
echo
echo "  → Conferindo se o banco tem o schema da versão nova…"
FALTANDO=""
for PAR in "suppliers:state_registration" \
           "customers:document_waiver_reason" \
           "customers:document_waiver_at" \
           "sellers:commission_rate"; do
  TAB="${PAR%%:*}"; COL="${PAR##*:}"
  TEM="$(psql -tAc "select count(*) from information_schema.columns
                     where table_name='$TAB' and column_name='$COL'")"
  [ "$TEM" = "1" ] || FALTANDO="$FALTANDO\n      $TAB.$COL"
done

if [ -n "$FALTANDO" ]; then
  echo
  echo "  ✖ O banco está com o schema ANTIGO. Falta:"
  printf "$FALTANDO\n"
  echo
  echo "    A carga não pode continuar: ela falharia no meio e deixaria"
  echo "    o sistema sem materiais e sem produtos."
  echo
  echo "    Rode a migração primeiro, DENTRO da pasta do sistema:"
  echo
  echo "      cd /www/wwwroot/erp-grafica"
  echo "      npx drizzle-kit push --force"
  echo "      node scripts/migrar-banco.mjs --aplicar"
  echo
  echo "    Depois rode este instalador de novo."
  echo
  exit 1
fi
echo "    schema em dia."

echo
echo "  → O que existe hoje:"
psql -tAc "
  select '      clientes:      '||count(*) from customers;
  select '      produtos:      '||count(*) from products;
  select '      orçamentos:    '||count(*) from quotes;
  select '      pedidos:       '||count(*) from orders;
  select '      vendas no PDV: '||count(*) from sales;"

echo
echo "  ⚠  Tudo isso, EXCETO OS CLIENTES, será apagado e substituído."
echo
read -r -p "  Digite CONFIRMO para continuar: " RESP
if [ "$RESP" != "CONFIRMO" ]; then
  echo "  Cancelado. Nada foi alterado."
  exit 0
fi

echo
echo "  → Backup completo em:"
echo "    $BACKUP"
pg_dump --no-owner --no-privileges > "$BACKUP"
echo "    $(du -h "$BACKUP" | cut -f1) gravados."

echo
echo "  → Carregando a base curada…"
# ON_ERROR_STOP: se uma linha falhar, o begin/commit do arquivo
# garante que NADA é gravado pela metade.
psql -v ON_ERROR_STOP=1 -q -f "$SQL"

echo
echo "  → Como ficou:"
psql -tAc "
  select '      clientes:    '||count(*) from customers;
  select '      produtos:    '||count(*) from products;
  select '      materiais:   '||count(*) from materials;
  select '      impressoras: '||count(*) from printers;
  select '      faixas:      '||count(*) from product_price_tiers;
  select '      config:      '||count(*) from settings;"

# ── CONFERÊNCIA ────────────────────────────────────────────────────
# "Rodou sem erro" não é o mesmo que "carregou". Conferir de fato.
PROD="$(psql -tAc "select count(*) from products")"
MAT="$(psql -tAc "select count(*) from materials")"
if [ "$PROD" -lt 1 ] || [ "$MAT" -lt 1 ]; then
  echo
  echo "  ✖ A carga NÃO funcionou: produtos=$PROD, materiais=$MAT."
  echo "    Restaure o backup e me avise:"
  echo "      psql -f $BACKUP"
  echo
  exit 1
fi

echo
echo "  ✔ Base curada instalada."
echo
echo "  Reinicie o aplicativo:   pm2 restart printflow"
echo
echo "  Se algo estiver errado, para voltar ao que era antes:"
echo "    psql -f $BACKUP"
echo
