#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
#  deploy-auto.sh — instala uma versão do PrintFlow e PROVA que subiu
#
#  Substitui os deploy.sh soltos de cada pacote. Faz tudo:
#    backup → derruba o processo antigo DE VERDADE → extrai → deps →
#    build → migrações → sobe → verifica → (se falhar) volta atrás
#
#  Uso:
#    bash scripts/deploy-auto.sh                      (usa o .tar.gz mais novo)
#    bash scripts/deploy-auto.sh pacote.tar.gz
#    bash scripts/deploy-auto.sh --porta 3001
#    bash scripts/deploy-auto.sh --sem-rollback
#
#  Duas lições que este script carrega:
#
#  1) "pkill -f 'next start'" NÃO mata o servidor. Em produção o
#     processo se chama "next-server". Era por isso que builds novos
#     eram gerados e o /api/version continuava mostrando a versão
#     velha — o processo antigo seguia servindo da memória. Aqui
#     matamos pelo NOME e pela PORTA.
#
#  2) Contar "bg-white" no HTML não detecta campo ilegível. Um PDV tem
#     campos claros e escuros por design. A validação real mede
#     CONTRASTE (verificar-contraste.mjs).
# ────────────────────────────────────────────────────────────────────
set -uo pipefail

# RAIZ = a pasta do SITE, não a pasta do script.
#
# Antes era `dirname $0/..`, o que só funciona se o script estiver em
# scripts/ DENTRO do site. Rodando o deploy-auto.sh que vem solto no
# pacote (ex.: /www/wwwroot/vtdigital-3.59.1/deploy-auto.sh) o RAIZ
# virava /www/wwwroot — e o backup tentava copiar a pasta errada e
# falhava, sem dizer por quê. Aconteceu em produção em 20/08/2026.
#
# Agora procuramos o site de verdade, na ordem:
#   1. --raiz passado à mão
#   2. o diretório atual, se tiver package.json do projeto
#   3. a pasta acima do script (caso clássico: scripts/ dentro do site)
ehSite() { [ -f "$1/package.json" ] && grep -q '"next"' "$1/package.json" 2>/dev/null; }

RAIZ=""
for i in "$@"; do
  [ "${ANTERIOR:-}" = "--raiz" ] && RAIZ="$i" && break
  ANTERIOR="$i"
done
unset ANTERIOR

if [ -z "$RAIZ" ]; then
  AQUI="$(pwd)"
  ACIMA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
  if ehSite "$AQUI"; then
    RAIZ="$AQUI"
  elif ehSite "$ACIMA"; then
    RAIZ="$ACIMA"
  else
    echo "✖ não achei a pasta do site (nenhum package.json com Next por perto)."
    echo "  Rode de dentro da pasta do ERP, ou passe:  --raiz /caminho/do/erp"
    exit 1
  fi
fi
cd "$RAIZ" || { echo "✖ não consegui entrar em $RAIZ"; exit 1; }

PORTA=3000
PACOTE=""
ROLLBACK=1
FORCAR=0

while [ $# -gt 0 ]; do
  case "$1" in
    --porta)         PORTA="$2"; shift 2 ;;
    --raiz)          shift 2 ;;   # já lido acima, antes do cd
    --forcar)        FORCAR=1; shift ;;
    --sem-rollback)  ROLLBACK=0; shift ;;
    -h|--help)       sed -n '2,26p' "$0"; exit 0 ;;
    *)               PACOTE="$1"; shift ;;
  esac
done

VERDE=$'\e[32m'; VERM=$'\e[31m'; AMAR=$'\e[33m'; CINZA=$'\e[90m'; FIM=$'\e[0m'
hr()   { echo "${CINZA}────────────────────────────────────────────────────────${FIM}"; }
step() { echo; echo "${CINZA}▸${FIM} $*"; }
ok()   { echo "  ${VERDE}✔${FIM} $*"; }
er()   { echo "  ${VERM}✖${FIM} $*"; }
warn() { echo "  ${AMAR}!${FIM} $*"; }

# ── DATABASE_URL: achar ou PARAR (v3.68.4) ──────────────────────────
# Incidente 24/08 (deploy da 3.68.3): a variável vivia no ambiente do
# pm2, não no SSH nem num .env. Sem ela o deploy "pulava o banco"
# CALADO — nenhuma migração rodou e o smoke caiu em 4/179, com
# rollback. Agora a ordem é: shell → .env da raiz → pm2 (e anota no
# .env para o futuro). Não achou? Para ANTES de encostar em qualquer
# coisa — melhor não deployar que deployar sem banco.
resolve_database_url() {
  [ -n "${DATABASE_URL:-}" ] && return 0
  if [ -f .env ] && grep -q '^DATABASE_URL=' .env 2>/dev/null; then
    DATABASE_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"\r')"
    export DATABASE_URL
    ok "DATABASE_URL veio do .env da raiz"
    return 0
  fi
  if command -v pm2 >/dev/null 2>&1; then
    achado="$(pm2 jlist 2>/dev/null | tr ',' '\n' | grep '"DATABASE_URL"' | head -1 | sed 's/.*:[[:space:]]*"//; s/"[[:space:]]*$//')"
    if [ -n "$achado" ]; then
      DATABASE_URL="$achado"
      export DATABASE_URL
      grep -q '^DATABASE_URL=' .env 2>/dev/null || echo "DATABASE_URL=$achado" >> .env
      ok "DATABASE_URL veio do pm2 (anotado no .env para o futuro)"
      return 0
    fi
  fi
  er "DATABASE_URL não achado: nem no shell, nem no .env, nem no pm2."
  er "Exporte e rode de novo:"
  er '  export DATABASE_URL="postgresql://usuario:senha@127.0.0.1:5432/banco"'
  er "Deploy sem banco não roda — sem migração e sem teste é o incidente de novo."
  exit 1
}
resolve_database_url

BACKUP_DIR=""
FALHOU=""

# Cópia de árvore sem depender de rsync — que NÃO existe em toda
# instalação Debian enxuta. Descoberto em teste: o backup ficava
# vazio silenciosamente e o rollback não tinha o que restaurar.
EXCLUIR=(node_modules .next backups logs .git .printflow)
copiar_arvore() {
  local origem="$1" destino="$2"
  mkdir -p "$destino"
  local args=()
  for e in "${EXCLUIR[@]}"; do args+=(--exclude="./$e"); done
  ( cd "$origem" && tar -cf - "${args[@]}" . ) | ( cd "$destino" && tar -xf - )
}

# Em qualquer saída não-zero, explica e (se possível) volta atrás.
finalizar() {
  local code=$?
  [ $code -eq 0 ] && return 0
  echo
  hr
  er "DEPLOY FALHOU${FALHOU:+ — $FALHOU}"
  if [ -n "$BACKUP_DIR" ] && [ "$ROLLBACK" = "1" ]; then
    warn "restaurando a versão anterior de $BACKUP_DIR"
    matar_servidor
    copiar_arvore "$BACKUP_DIR" "$RAIZ" 2>/dev/null
    ( cd "$RAIZ" && npm run build >/dev/null 2>&1 )
    subir_servidor
    warn "versão anterior de volta no ar. Nada foi perdido."
  else
    warn "backup em: ${BACKUP_DIR:-(não criado)}"
  fi
  hr
  exit $code
}
trap finalizar EXIT

# ── Matar o servidor DE VERDADE ─────────────────────────────────────
matar_servidor() {
  pm2 delete printflow >/dev/null 2>&1
  pkill -9 -f "next start"    2>/dev/null
  pkill -9 -f "next-server"   2>/dev/null
  pkill -9 -f "next/dist/bin" 2>/dev/null
  sleep 2
  # Rede de segurança: o processo real chama-se "next-server" e escapa
  # de um pkill pelo comando original. Matar por porta não deixa escapar.
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORTA}/tcp" 2>/dev/null
  elif command -v lsof >/dev/null 2>&1; then
    lsof -ti ":${PORTA}" 2>/dev/null | xargs -r kill -9
  else
    ps ax -o pid=,command= | grep -E "next-server|next start" | grep -v grep \
      | awk '{print $1}' | xargs -r kill -9 2>/dev/null
  fi
  sleep 2
}

porta_livre() {
  ! curl -s --max-time 3 "http://127.0.0.1:${PORTA}/api/version" >/dev/null 2>&1
}

subir_servidor() {
  if command -v pm2 >/dev/null 2>&1 && [ -f ecosystem.config.js ]; then
    pm2 start ecosystem.config.js >/dev/null 2>&1 && return 0
  fi
  mkdir -p logs
  setsid ./node_modules/.bin/next start -H 0.0.0.0 -p "$PORTA" \
    >> logs/server.log 2>&1 &
  disown 2>/dev/null || true
}

esperar_subir() {
  for _ in $(seq 1 40); do
    sleep 2
    curl -s --max-time 3 "http://127.0.0.1:${PORTA}/api/version" >/dev/null 2>&1 && return 0
  done
  return 1
}

versao_no_ar() {
  curl -s --max-time 5 "http://127.0.0.1:${PORTA}/api/version" 2>/dev/null \
    | grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' \
    | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1
}

hr
echo "  DEPLOY AUTOMÁTICO — PrintFlow ERP"
hr

ANTES="$(versao_no_ar || true)"
echo "  versão no ar agora : ${ANTES:-nenhuma}"
echo "  porta              : $PORTA"

# ── 1. Localizar o pacote ───────────────────────────────────────────
step "1/9  Localizando o pacote"
if [ -z "$PACOTE" ]; then
  PACOTE="$(ls -1t \
      "$RAIZ"/../update-*/printflow-erp-v*.tar.gz \
      "$RAIZ"/../release/printflow-erp-v*.tar.gz \
      "$RAIZ"/printflow-erp-v*.tar.gz \
      2>/dev/null | head -1)"
fi
if [ -z "$PACOTE" ] || [ ! -f "$PACOTE" ]; then
  FALHOU="nenhum pacote .tar.gz encontrado"
  er "$FALHOU"; er "passe o caminho: bash scripts/deploy-auto.sh caminho/pacote.tar.gz"
  exit 1
fi
ALVO="$(basename "$PACOTE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
ok "$(basename "$PACOTE")  →  alvo v${ALVO}"

if [ -f "${PACOTE}.sha256" ]; then
  ( cd "$(dirname "$PACOTE")" && sha256sum -c "$(basename "$PACOTE").sha256" >/dev/null 2>&1 ) \
    && ok "checksum confere" || warn "checksum não confere (seguindo mesmo assim)"
fi

# Reinstalar a MESMA versão derruba o site por 1–2 minutos sem entregar
# nada de novo. Em 20/08/2026 isso aconteceu duas vezes seguidas em
# produção: na primeira o script escolheu sozinho um pacote antigo e
# reinstalou a versão que já estava no ar; na segunda, rodou de novo a
# mesma 3.59.1 "por garantia". Site fora do ar à toa nas duas.
if [ -n "${ANTES:-}" ] && [ "$ANTES" = "$ALVO" ]; then
  echo
  warn "a versão v${ALVO} JÁ está no ar."
  warn "reinstalar vai derrubar o site por 1–2 min e não muda nada."
  if [ "$FORCAR" = "1" ]; then
    warn "--forcar informado: seguindo mesmo assim."
  elif [ -t 0 ]; then
    printf "  Reinstalar mesmo assim? [s/N] "
    read -r resposta
    case "$resposta" in
      s|S|sim|SIM) ok "seguindo a pedido" ;;
      *) echo; ok "nada foi alterado — o site continua no ar."; exit 0 ;;
    esac
  else
    echo
    er "rodando sem terminal: não vou reinstalar por conta própria."
    er "se for mesmo o que você quer:  bash deploy-auto.sh --forcar $PACOTE"
    exit 0
  fi
fi

if [ "$ALVO" = "$ANTES" ]; then
  warn "v$ALVO já está no ar — reinstalando por cima"
fi

# ── 2. Backup ───────────────────────────────────────────────────────
step "2/9  Backup da instalação atual"
BACKUP_DIR="$RAIZ/backups/pre-deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
if copiar_arvore "$RAIZ" "$BACKUP_DIR" 2>/tmp/backup-erro.log && [ -f "$BACKUP_DIR/package.json" ]; then
  ok "código salvo em $(basename "$BACKUP_DIR") ($(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1))"
else
  # Sem backup não há rollback. Melhor parar agora do que descobrir
  # depois de já ter derrubado o servidor.
  #
  # O erro ia para /dev/null e o script só dizia "não consegui criar o
  # backup" — justamente quando dá problema, escondia o motivo. Em
  # 20/08/2026 isso custou várias tentativas às cegas em produção.
  FALHOU="não consegui criar o backup"
  er "$FALHOU"
  echo
  er "  pasta do site : $RAIZ"
  er "  destino       : $BACKUP_DIR"
  [ -f "$BACKUP_DIR/package.json" ] || er "  package.json NÃO chegou no backup"
  if [ -s /tmp/backup-erro.log ]; then
    er "  o que o sistema disse:"
    sed 's/^/      /' /tmp/backup-erro.log | head -10
  fi
  echo
  er "  confira:  df -h \"$RAIZ\"   (espaço)"
  er "            ls -ld \"$RAIZ/backups\"   (permissão)"
  exit 1
fi

if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$DATABASE_URL" 2>/dev/null | gzip > "$BACKUP_DIR/banco.sql.gz" \
    && ok "banco salvo ($(du -h "$BACKUP_DIR/banco.sql.gz" | cut -f1))" \
    || warn "pg_dump falhou — só o código foi salvo"
else
  warn "pg_dump indisponível — só o código foi salvo"
fi

# ── 3. Derrubar o servidor ──────────────────────────────────────────
step "3/9  Derrubando o servidor antigo"
matar_servidor
if porta_livre; then
  ok "porta $PORTA livre"
else
  FALHOU="a porta $PORTA continua ocupada"
  er "$FALHOU"
  er "algo segura a porta. Veja: lsof -i :$PORTA"
  exit 1
fi

# ── 4. Extrair ──────────────────────────────────────────────────────
step "4/9  Extraindo o pacote"
# Sem --strip-components: estes pacotes já vêm com a raiz correta.
tar -xzf "$PACOTE" -C "$RAIZ" || { FALHOU="tar falhou"; er "$FALHOU"; exit 1; }
ok "arquivos no lugar"

if [ -f scripts/verificar-instalacao.sh ]; then
  if bash scripts/verificar-instalacao.sh >/tmp/verif.log 2>&1; then
    ok "instalação consistente"
  else
    FALHOU="verificar-instalacao.sh reprovou"
    er "$FALHOU"; tail -12 /tmp/verif.log; exit 1
  fi
fi

# ── 5. Dependências ─────────────────────────────────────────────────
step "5/9  Dependências"
if NODE_ENV=development npm install --include=dev --no-audit --no-fund >/tmp/npm.log 2>&1; then
  ok "$(ls node_modules 2>/dev/null | wc -l) pacotes"
else
  FALHOU="npm install falhou"; er "$FALHOU"; tail -15 /tmp/npm.log; exit 1
fi

# ── 6. Build ────────────────────────────────────────────────────────
step "6/9  Build (pode levar alguns minutos)"
rm -rf .next
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
if npm run build >/tmp/build.log 2>&1 && [ -f .next/BUILD_ID ]; then
  ok "build concluído (BUILD_ID $(cat .next/BUILD_ID 2>/dev/null | head -c 12))"
elif [ ! -f .next/BUILD_ID ] && ! grep -qiE "SIGKILL|out of memory|heap out of memory|Killed|Module not found|Build failed" /tmp/build.log; then
  # O build disse que deu certo mas não deixou BUILD_ID. Isso é build
  # pela metade: o `next start` sai na hora reclamando que não achou
  # build de produção, e o pm2 fica em loop de restart.
  #
  # Aconteceu em produção em 19/08/2026: `npm install --omit=dev` pulou
  # TypeScript e Tailwind (que são devDependencies e são necessários
  # para COMPILAR), o webpack não resolveu os atalhos @/ do tsconfig e
  # o .next ficou sem manifesto. Conferir o arquivo é mais confiável
  # do que confiar no código de saída.
  FALHOU="build terminou sem gerar .next/BUILD_ID (build incompleto)"
  er "$FALHOU"
  echo
  echo "     Quase sempre é dependência faltando. Rode:"
  echo "       rm -rf .next node_modules"
  echo "       npm install          # TUDO, sem --omit=dev"
  echo "       npm run build"
  echo
  tail -20 /tmp/build.log
  exit 1
else
  if grep -qiE "SIGKILL|out of memory|heap out of memory|Killed" /tmp/build.log; then
    FALHOU="o build morreu por FALTA DE MEMÓRIA (não é erro de código)"
    er "$FALHOU"
    echo
    echo "     Crie swap e rode de novo:"
    echo "       sudo fallocate -l 2G /swapfile"
    echo "       sudo chmod 600 /swapfile && sudo mkswap /swapfile"
    echo "       sudo swapon /swapfile"
  elif grep -qiE "Module not found|Cannot find module" /tmp/build.log; then
    FALHOU="faltam dependências para compilar"
    er "$FALHOU"
    echo
    echo "     TypeScript e Tailwind são devDependencies e o build precisa"
    echo "     deles. Se você usou --omit=dev, foi isso. Rode:"
    echo "       rm -rf .next node_modules"
    echo "       npm install          # sem --omit=dev"
    echo "       npm run build"
    echo
    grep -E "Module not found|Can't resolve" /tmp/build.log | head -6
  else
    FALHOU="erro de build"
    er "$FALHOU"; tail -25 /tmp/build.log
  fi
  exit 1
fi

# ── 7. Migrações e reparos ──────────────────────────────────────────
step "7/9  Banco de dados"
if [ -n "${DATABASE_URL:-}" ]; then
  # `drizzle-kit push` é interativo. Rodando por SSH sem TTY ele pode
  # não concluir E AINDA ASSIM sair como sucesso — foi o que houve em
  # 19/08/2026: código da 3.54.0 no ar, tabelas de campanha nunca
  # criadas, /api/campanhas devolvendo 500.
  #
  # Por isso ele agora é só a primeira tentativa. Quem decide é o
  # `migrar-banco.mjs`, que CONFERE o que o código precisa e cria o
  # que faltar com SQL explícito — sem terminal interativo.
  npx drizzle-kit push --force >/tmp/drizzle.log 2>&1 \
    && ok "schema atualizado (drizzle)" \
    || warn "drizzle-kit push não concluiu — o passo seguinte resolve"

  if node scripts/migrar-banco.mjs --aplicar >/tmp/migrar.log 2>&1; then
    if grep -q "Banco em dia" /tmp/migrar.log; then
      ok "schema conferido: nada faltando"
    else
      ok "schema completado: $(grep -cE '^   · ' /tmp/migrar.log) item(ns) criado(s)"
      grep -E '^   · ' /tmp/migrar.log | head -6
    fi
  else
    # Aqui é falha de verdade: o código espera algo que não existe no
    # banco. Seguir em frente só produz erro 500 na cara do cliente.
    FALHOU="o banco não tem o schema que esta versão precisa"
    er "$FALHOU"; tail -12 /tmp/migrar.log; exit 1
  fi

  # Backfill de telefone: só avisa, nunca grava sozinho — fundir
  # cliente duplicado é decisão de negócio, não de script.
  if [ -f scripts/backfill-phone-e164.mjs ]; then
    saida="$(node scripts/backfill-phone-e164.mjs 2>&1)"
    conflitos="$(printf '%s' "$saida" | grep -oE 'EM CONFLITO[ .]*[0-9]+' | grep -oE '[0-9]+$')"
    if [ "${conflitos:-0}" != "0" ]; then
      warn "há ${conflitos} telefone(s) duplicado(s) — o índice único não foi criado"
      warn "rode: node scripts/backfill-phone-e164.mjs   (para ver a lista)"
    else
      node scripts/backfill-phone-e164.mjs --aplicar >/dev/null 2>&1 \
        && ok "telefones canônicos preenchidos"
    fi
  fi

  for r in scripts/repair-*.mjs; do
    [ -e "$r" ] || continue
    node "$r" >/dev/null 2>&1 || warn "$(basename "$r") reclamou"
  done
  ok "reparos executados"
  [ -f scripts/ensure-settings.mjs ] && node scripts/ensure-settings.mjs >/dev/null 2>&1 \
    && ok "configurações garantidas"

  # Migrações pontuais de configuração (v3.51.0+).
  #
  # `ensure-settings` só CRIA chave que falta — nunca sobrescreve, e
  # está certo: senão todo deploy apagaria o ajuste de quem
  # configurou. Quando um PADRÃO MEU estava errado (o corte era 15h,
  # o real é 17h), a correção precisa de um script próprio, que só
  # troca se o valor ainda for o padrão antigo.
  for m in scripts/migrar-*.mjs; do
    [ -e "$m" ] || continue
    node "$m" --aplicar >/dev/null 2>&1 \
      && ok "$(basename "$m" .mjs) aplicado" \
      || warn "$(basename "$m") reclamou — rode na mão para ver o motivo"
  done

  # Prazos sugeridos por tipo de trabalho.
  #
  # Só toca em produto que ainda está no padrão de fábrica (criação 0,
  # produção 1, acabamento 0). Quem já ajustou o prazo na tela não é
  # tocado — por isso é seguro rodar em todo deploy, e não faz sentido
  # exigir um comando manual que o usuário vai esquecer.
  if [ -f scripts/seed-prazos.mjs ]; then
    saida="$(node scripts/seed-prazos.mjs --aplicar 2>&1 || true)"
    ajustados="$(printf '%s' "$saida" | grep -oE '^✅ [0-9]+' | grep -oE '[0-9]+' || true)"
    if [ -n "${ajustados:-}" ] && [ "${ajustados:-0}" != "0" ]; then
      ok "prazos aplicados em ${ajustados} produto(s) que estavam no padrão"
    else
      ok "prazos conferidos (nada a mudar)"
    fi
  fi

  # ── Categorias de material (v3.57.0) ────────────────────────────
  #
  # Mesma lógica do seed de prazos: só CRIA categoria que falta e só
  # classifica material que está SEM categoria. O que o dono
  # classificou à mão fica intocado, então roda em todo deploy sem
  # risco.
  if [ -f scripts/seed-categorias-materiais.mjs ]; then
    saida="$(node scripts/seed-categorias-materiais.mjs --aplicar 2>&1 || true)"
    resumo="$(printf '%s' "$saida" | grep -oE '^✅ .*$' || true)"
    if [ -n "${resumo:-}" ]; then
      ok "categorias de material: ${resumo#✅ }"
    else
      ok "categorias de material conferidas"
    fi
  fi

  # ── Árvore de categorias de produto (v3.58.0) ───────────────────
  #
  # Idempotente: cria o que falta, realinha ícone/ordem/pai e só
  # remapeia produto cujo nome está na lista. Categoria criada à mão
  # pelo dono não é tocada.
  if [ -f scripts/seed-categorias-produtos.mjs ]; then
    saida="$(node scripts/seed-categorias-produtos.mjs --aplicar 2>&1 || true)"
    resumo="$(printf '%s' "$saida" | grep -oE '^✅ .*$' || true)"
    if [ -n "${resumo:-}" ]; then
      ok "categorias de produto: ${resumo#✅ }"
    else
      ok "categorias de produto conferidas"
    fi
  fi

  # ── Logos da empresa (v3.59.0) ──────────────────────────────────
  #
  # Só grava onde está VAZIO: logo trocada pelo dono no Painel nunca é
  # sobrescrita por um deploy.
  if [ -f scripts/aplicar-logo.mjs ]; then
    saida="$(node scripts/aplicar-logo.mjs --aplicar 2>&1 || true)"
    resumo="$(printf '%s' "$saida" | grep -oE '^✅ .*$' || true)"
    [ -n "${resumo:-}" ] && ok "logos: ${resumo#✅ }" || ok "logos conferidas"
  fi

  # ── Carimbo da versão no banco ──────────────────────────────────
  #
  # BUG v3.53.2: isto nunca era feito. `settings.app_version` ficava
  # NULL para sempre, então /api/version devolvia installedVersion:null
  # e upToDate:null — e não havia como saber, olhando o sistema, qual
  # update já tinha entrado. Eu mesmo me confundi por causa disso e
  # fiquei repetindo que o servidor estava numa versão antiga.
  #
  # check-version.mjs compara VERSION, package.json, lib/version.ts e
  # o banco, e grava quando o banco está diferente.
  if [ -f scripts/check-version.mjs ]; then
    node scripts/check-version.mjs >/tmp/version.log 2>&1 \
      && ok "versão carimbada no banco (v$ALVO)" \
      || warn "check-version reclamou (veja /tmp/version.log)"
  fi
else
  warn "DATABASE_URL ausente — pulando banco"
fi

# ── 8. Subir ────────────────────────────────────────────────────────
step "8/9  Subindo o servidor"
subir_servidor
if esperar_subir; then
  ok "servidor respondendo"
else
  FALHOU="o servidor não respondeu em 80s"
  er "$FALHOU"; tail -20 logs/server.log 2>/dev/null; exit 1
fi

# ── 9. PROVA ────────────────────────────────────────────────────────
step "9/9  Verificação"

DEPOIS="$(versao_no_ar || true)"
echo "  versão respondida  : ${DEPOIS:-(nada)}"
if [ "$DEPOIS" = "$ALVO" ]; then
  ok "v$ALVO confirmada no ar"
else
  FALHOU="/api/version diz '${DEPOIS:-nada}', esperado '$ALVO'"
  er "$FALHOU"
  er "o processo antigo sobreviveu ou o build não trocou"
  exit 1
fi

# Contraste — a checagem honesta, que mede luminância em vez de
# contar classes. "bg-white" no HTML não é defeito.
if [ -f scripts/verificar-contraste.mjs ]; then
  if BASE_URL="http://127.0.0.1:${PORTA}" node scripts/verificar-contraste.mjs >/tmp/contraste.log 2>&1; then
    ok "contraste dos campos aprovado ($(grep -oE 'campos medidos[ .]*[0-9]+' /tmp/contraste.log | grep -oE '[0-9]+$') campos)"
  else
    FALHOU="há campo ilegível"
    er "$FALHOU"; sed -n '/campo(s) ilegível/,$p' /tmp/contraste.log
    exit 1
  fi
fi

if [ -f scripts/e2e-smoke.mjs ]; then
  n="$(BASE_URL="http://127.0.0.1:${PORTA}" npm run e2e:smoke 2>&1 | grep -c '✅' || true)"
  if [ "${n:-0}" -ge 150 ]; then
    ok "testes de fumaça: $n checagens"
  else
    FALHOU="e2e:smoke passou só $n checagens (mínimo 150)"
    er "$FALHOU"; exit 1
  fi
fi

# Varredura de saúde: não reprova o deploy, mas mostra o que precisa
# de atenção. Vale mais aqui, com o sistema recém-subido, do que num
# comando manual que ninguém lembra de rodar.
DIAG=""
if [ -f scripts/diagnosticar-sistema.mjs ]; then
  if BASE_URL="http://127.0.0.1:${PORTA}" node scripts/diagnosticar-sistema.mjs >/tmp/diag.log 2>&1; then
    DIAG="$(grep -oE '[0-9]+ problema\(s\) · [0-9]+ aviso\(s\)|Sistema saudável' /tmp/diag.log | tail -1)"
    ok "varredura: ${DIAG:-sem problemas}"
  else
    DIAG="$(grep -oE '[0-9]+ problema\(s\) · [0-9]+ aviso\(s\)' /tmp/diag.log | tail -1)"
    warn "varredura encontrou algo: ${DIAG:-veja /tmp/diag.log}"
    grep -E '^  ✖' /tmp/diag.log | head -8
  fi
fi

trap - EXIT
echo
hr
echo "  ${VERDE}✔ v$ALVO NO AR${FIM}   (antes: ${ANTES:-nenhuma})"
hr
echo "  backup .......... $(basename "$BACKUP_DIR")"
[ -n "$DIAG" ] && echo "  varredura ....... $DIAG"
echo "  detalhes ........ node scripts/diagnosticar-sistema.mjs"
echo "  se algo estranhar no navegador, é cache: Ctrl+Shift+R"
hr

# Avisos que dependem de decisão sua — nunca aplicados sozinhos.
if [ -f /tmp/diag.log ] && grep -q '^  ⚠' /tmp/diag.log; then
  echo "  ${AMAR}Pendências${FIM} (não impedem o uso):"
  grep -E '^  ⚠' /tmp/diag.log | head -6 | sed 's/^  ⚠/   ·/'
  hr
fi
