#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
#  verificar-tudo.sh — diagnóstico completo em um comando
#
#    npm run verificar
#    npm run verificar -- --url https://app.vtdigital.site
#
#  Responde de uma vez: qual versão está no ar, o build bate com o
#  código, os campos estão legíveis, o banco responde, os testes
#  passam. Serve para conferir depois de um deploy e para diagnosticar
#  "está estranho aqui" sem chute.
#
#  Sai 0 se tudo passou, 1 se algo reprovou.
# ────────────────────────────────────────────────────────────────────
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

BASE="http://127.0.0.1:3000"
while [ $# -gt 0 ]; do
  case "$1" in
    --url) BASE="${2%/}"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) shift ;;
  esac
done

VERDE=$'\e[32m'; VERM=$'\e[31m'; AMAR=$'\e[33m'; CINZA=$'\e[90m'; FIM=$'\e[0m'
PASSOU=0; FALHOU=0; ALERTA=0
ok()   { echo "  ${VERDE}✔${FIM} $*"; PASSOU=$((PASSOU+1)); }
er()   { echo "  ${VERM}✖${FIM} $*"; FALHOU=$((FALHOU+1)); }
warn() { echo "  ${AMAR}!${FIM} $*"; ALERTA=$((ALERTA+1)); }
hr()   { echo "${CINZA}────────────────────────────────────────────────────────${FIM}"; }
tit()  { echo; echo "${CINZA}▸${FIM} $*"; }

hr
echo "  VERIFICAÇÃO GERAL — PrintFlow ERP"
echo "  alvo: $BASE"
hr

# ── Versões ─────────────────────────────────────────────────────────
tit "Versão"
NO_CODIGO="$(node -p "require('./package.json').version" 2>/dev/null)"
NO_AR="$(curl -s --max-time 8 "$BASE/api/version" 2>/dev/null \
        | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"

echo "     no código : ${NO_CODIGO:-?}"
echo "     no ar     : ${NO_AR:-(não respondeu)}"

if [ -z "$NO_AR" ]; then
  er "servidor não respondeu — está no ar?"
elif [ "$NO_AR" = "$NO_CODIGO" ]; then
  ok "código e servidor na mesma versão"
else
  er "DIVERGÊNCIA: o servidor serve $NO_AR mas o código é $NO_CODIGO"
  echo "       O processo antigo provavelmente sobreviveu ao deploy."
  echo "       Note que 'pkill -f \"next start\"' NÃO o mata: em produção"
  echo "       ele se chama 'next-server'. Use:"
  echo "         fuser -k 3000/tcp   ou   npm run deploy"
fi

# ── Processos ───────────────────────────────────────────────────────
tit "Processos"
N="$(ps ax -o command= 2>/dev/null | grep -cE 'next-server|next start' || true)"
N=$((N > 0 ? N - 0 : 0))
VIVOS="$(ps ax -o pid=,command= 2>/dev/null | grep -E 'next-server|next start' | grep -v grep | wc -l)"
if [ "$VIVOS" -eq 0 ]; then
  warn "nenhum processo Next rodando localmente (normal se o alvo é remoto)"
elif [ "$VIVOS" -eq 1 ]; then
  ok "1 processo Next (correto)"
else
  er "$VIVOS processos Next ao mesmo tempo — um serve build velho"
  ps ax -o pid=,command= | grep -E 'next-server|next start' | grep -v grep | sed 's/^/       /'
fi

# ── Contraste ───────────────────────────────────────────────────────
tit "Contraste dos campos"
if [ -f scripts/verificar-contraste.mjs ]; then
  if SAIDA="$(BASE_URL="$BASE" node scripts/verificar-contraste.mjs 2>&1)"; then
    ok "$(printf '%s' "$SAIDA" | grep -oE 'campos medidos[ .]*[0-9]+' | grep -oE '[0-9]+$') campos legíveis"
  else
    er "campo ilegível encontrado"
    printf '%s\n' "$SAIDA" | sed -n '/ilegível/,$p' | sed 's/^/     /'
  fi
else
  warn "verificar-contraste.mjs ausente"
fi

# ── Instalação ──────────────────────────────────────────────────────
tit "Integridade da instalação"
if [ -f scripts/verificar-instalacao.sh ]; then
  if bash scripts/verificar-instalacao.sh >/tmp/vt-inst.log 2>&1; then
    ok "sem arquivos duplicados ou sobras"
  else
    er "problemas na instalação"; tail -8 /tmp/vt-inst.log | sed 's/^/     /'
  fi
fi

# ── Banco ───────────────────────────────────────────────────────────
tit "Banco de dados"
if [ -n "${DATABASE_URL:-}" ] || grep -q '^DATABASE_URL' .env 2>/dev/null; then
  if node -e '
      require("dotenv").config({quiet:true});
      const pg = require("pg");
      const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
      c.connect()
        .then(() => c.query("select count(*)::int n from customers"))
        .then(r => { console.log(r.rows[0].n); return c.end(); })
        .catch(e => { console.error(e.message); process.exit(1); });
    ' >/tmp/vt-db.log 2>&1; then
    ok "conectado — $(tail -1 /tmp/vt-db.log) clientes"

    # Telefones sem chave canônica: o bot do WhatsApp não acha essas pessoas.
    if node -e '
        require("dotenv").config({quiet:true});
        const pg = require("pg");
        const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
        c.connect()
         .then(() => c.query(`select count(*)::int n from information_schema.columns
                               where table_name='"'"'customers'"'"' and column_name='"'"'phone_e164'"'"'`))
         .then(async r => {
            if (!r.rows[0].n) { console.log("SEM_COLUNA"); return c.end(); }
            const q = await c.query(`select count(*)::int n from customers
                                      where coalesce(phone_e164,'"'"''"'"') = '"'"''"'"'
                                        and coalesce(whatsapp, phone, '"'"''"'"') <> '"'"''"'"'`);
            console.log(q.rows[0].n); return c.end();
         })
         .catch(() => { console.log("ERRO"); process.exit(0); });
      ' >/tmp/vt-tel.log 2>&1; then
      T="$(tail -1 /tmp/vt-tel.log)"
      case "$T" in
        SEM_COLUNA) warn "coluna phone_e164 ausente — instale a v3.46.6+" ;;
        ERRO|"")    warn "não consegui checar os telefones" ;;
        0)          ok "todos os telefones com chave canônica" ;;
        *)          warn "$T cliente(s) com telefone mas SEM chave canônica"
                    echo "       o bot não encontraria essas pessoas. Rode:"
                    echo "         node scripts/backfill-phone-e164.mjs" ;;
      esac
    fi
  else
    er "não conectou: $(head -1 /tmp/vt-db.log)"
  fi
else
  warn "DATABASE_URL não configurada"
fi

# ── Testes ──────────────────────────────────────────────────────────
tit "Testes de fumaça"
if [ -f scripts/e2e-smoke.mjs ]; then
  N="$(BASE_URL="$BASE" node scripts/e2e-smoke.mjs 2>&1 | grep -c '✅' || true)"
  if [ "${N:-0}" -ge 150 ]; then
    ok "$N checagens"
  else
    er "só $N checagens passaram (esperado ~179)"
    BASE_URL="$BASE" node scripts/e2e-smoke.mjs 2>&1 | grep '❌' | head -3 | sed 's/^/     /'
  fi
fi

# ── Backup ──────────────────────────────────────────────────────────
tit "Backup automático"
if crontab -l 2>/dev/null | grep -q "backup-auto"; then
  ok "cron de backup ativo"
else
  warn "backup automático NÃO está ativo"
  echo "       ative com: bash scripts/backup-auto.sh --instalar-cron"
fi

# ── Veredito ────────────────────────────────────────────────────────
echo
hr
if [ "$FALHOU" -eq 0 ] && [ "$ALERTA" -eq 0 ]; then
  echo "  ${VERDE}✔ TUDO CERTO${FIM}  — $PASSOU verificações"
elif [ "$FALHOU" -eq 0 ]; then
  echo "  ${VERDE}✔ FUNCIONANDO${FIM}  — $PASSOU ok, ${AMAR}$ALERTA aviso(s)${FIM}"
  echo "  Os avisos não impedem o uso, mas valem atenção."
else
  echo "  ${VERM}✖ $FALHOU PROBLEMA(S)${FIM}  — $PASSOU ok, $ALERTA aviso(s)"
fi
hr
[ "$FALHOU" -eq 0 ]
