# 🤖 AGENTE DO SERVIDOR — manual de operação permanente

> **Este arquivo é para o agente (IA ou humano) que mantém o ERP rodando
> no servidor da gráfica.** Leia-o INTEIRO na primeira vez. Nas seguintes,
> basta rodar a verificação (§2) e ler os boletins pendentes (§3).
>
> Se você recebeu uma mensagem do tipo *"atualize para a versão X"* —
> ela vem do agente de desenvolvimento. O que ele mudou está descrito em
> `UPDATES/X.md`. Este manual diz COMO aplicar sem quebrar a produção.

---

## 1. Onde você está (contexto do servidor)

| Item | Valor |
|---|---|
| Pasta do ERP | `/www/wwwroot/erp-grafica` |
| Processo | pm2 sob root (`pm2 ls` para ver o nome) |
| Banco | PostgreSQL **18.0 (aPanel)** em `/www/server/pgsql` — conexão no `.env` (`DATABASE_URL`). O `pg_dump` CERTO é `/www/server/pgsql/bin/pg_dump` (o do PATH é 17 e não serve; desde a 3.70.3 o `update.sh` acha sozinho) |
| ⚠️ Cluster 17 local | `/usr/lib/postgresql/17` **não é o banco do ERP** (é instalação antiga do sistema). Não use, não delete — só mexa com go-ahead do dono |
| URL pública | `https://app.vtdigital.site` (túnel Cloudflare) |
| Healthcheck | `curl -s http://127.0.0.1:3000/api/health` → `{"ok":true}` |
| Versão rodando | `curl -s http://127.0.0.1:3000/api/version` → `upToDate` |

Documentos da casa que valem ouro (leia quando o assunto aparecer):
`docs/MANUAL-DO-PROGRAMADOR.md` (as 5 regras), `docs/UPDATE.md`,
`docs/SOCORRO-SITE-FORA.md`, `docs/SOCORRO-502.md`,
`docs/INCIDENTE-2026-08-24.md` e `docs/INCIDENTE-2026-08-25-CONVERSAS.md`
(cada regra deste manual nasceu de um incidente real).

---

## 2. Rotina de verificação (sempre comece por aqui)

```bash
cd /www/wwwroot/erp-grafica
git fetch origin
node scripts/agente-verificar.mjs
```

O `agente-verificar.mjs` é **somente leitura**: compara a versão do
banco com a do repositório e lista os boletins `UPDATES/*.md` que você
ainda não aplicou, na ordem. Ele não altera nada.

---

## 3. Boletins de atualização (`UPDATES/`)

Cada versão liberada tem um boletim `UPDATES/<versão>.md` com:

```yaml
---
versao: 3.70.0
data: 2026-08-27
commit: <hash>
migracao_banco: sim|nao     # "sim" = o update.sh aplica (drizzle-kit push)
reseed: nunca               # produção JAMAIS roda seed
---
```

…seguido de: o que mudou, o que você deve fazer, como validar e como
voltar atrás. **Leia todos os boletins mais novos que a versão instalada
antes de atualizar.**

---

## 4. O fluxo de atualização (não pule etapas)

```bash
cd /www/wwwroot/erp-grafica

# 1. Estado limpo — se houver mudança local, PARE e reporte
git status

# 2. Código novo (SOMENTE main — ver §6)
git pull origin main

# 3. Update oficial: backup obrigatório → deps → schema → build
#    (aborta sozinho se não conseguir fazer backup restaurável)
bash scripts/update.sh

# 4. Reinicie o processo como o servidor já roda
pm2 restart <nome-do-processo>     # confira com: pm2 ls
#   (alternativa: bash scripts/start.sh)

# 5. Prove que subiu
ls -la .next/BUILD_ID              # deve existir (regra 1.3 do manual)
curl -s http://127.0.0.1:3000/api/version    # "version" nova E "upToDate": true

# 6. Carimbo de versão consistente — ANTES do smoke: a checagem 11.8
#    do smoke compara o carimbo com o código (desde a 3.70.3 o próprio
#    update.sh já carimba; este passo é a rede de segurança)
node scripts/check-version.mjs     # deve terminar "✔ Versionamento consistente"

# 7. Smoke ponta a ponta (cria e remove os PRÓPRIOS dados de teste)
set -a; source .env; set +a
npm run e2e:smoke                  # deve terminar "🎉 concluído com sucesso"
```

**Se qualquer etapa falhar: PARE.** Não invente caminho alternativo,
não force flag nenhuma. Reporte a última saída de tela para o dono.
O `update.sh` só encosta no banco DEPOIS de ter backup restaurável —
se ele abortou, havia motivo.

---

## 5. As regras que não se quebram (todas custaram um incidente)

1. **Backup antes de tudo** que toque o banco. Update sem backup
   restaurável **aborta** — está certo assim (incidente 24/08).
2. **NUNCA rode seed em produção** (`db:seed`, `seed.mjs`,
   `base-curada.sql`, `zerar-e-semear.mjs`). Seed APAGA dados. O
   updater nunca re-semeia; você também não.
3. **NUNCA rode `drizzle-kit push --force` na mão.** Migração é papel
   do `update.sh` (incidente 25/08: push forçado quase derrubou as
   tabelas de conversas do WhatsApp).
4. **Nunca `npm install --omit=dev`** — TypeScript/Tailwind são
   devDependencies e o build precisa deles (derrubou o site em 19/08).
5. **Nenhum comando destrutivo no banco** (`DROP`, `TRUNCATE`,
   `pg_restore`) sem go-ahead explícito do dono.
6. **`.env` é do servidor, não do repositório.** Se clonar do zero,
   copie o `.env` da instalação anterior ANTES de qualquer update.
7. **Confira o `BUILD_ID`**, não a mensagem de sucesso do build.
8. **Deploy se prova com smoke + `/api/version` `upToDate: true`** —
   "subiu" sem provar não é subiu.

---

## 6. Políticas de branch e de entrega

- **Produção atualiza apenas a partir de `main`.**
- O agente de desenvolvimento trabalha em branches `arena/*` e abre
  **Pull Request** para `main`. O dono (Tiago) aprova/mergeia.
- **Você nunca faz pull de `arena/*`**, nunca faz push para `main` e
  nunca comita direto na pasta de produção. Se `git status` sujar,
   descubra por quê antes de seguir.
- Uma versão no `main` sem boletim em `UPDATES/` é anomalia: reporte.

---

## 7. Rollback (quando a nova versão não presta)

```bash
BACKUP=$(cat .printflow/last-backup.path)
ls -lh "$BACKUP"                   # confira que existe e tem tamanho

# 1. Pare o processo
pm2 stop <nome-do-processo>

# 2. Restaure o banco (se o problema for dado)
pg_restore --clean --if-exists -d "$DATABASE_URL" "$BACKUP/database.dump"

# 3. Restaure o código (se o problema for código)
mkdir -p /tmp/rollback && tar -xzf "$BACKUP/app-source.tgz" -C /tmp/rollback
rsync -a --delete --exclude '.env' --exclude 'node_modules' --exclude '.next' \
  /tmp/rollback/ /www/wwwroot/erp-grafica/

# 4. Rebuild e sobe
npm install && npm run build && pm2 restart <nome-do-processo>
```

Em caso de dúvida, os passos completos estão em `docs/UPDATE.md` e em
`docs/SOCORRO-SITE-FORA.md`.

---

## 8. Portal do cliente (Hostinger) — fluxo SEPARADO

O portal público do cliente **não roda no servidor da gráfica**: é
hospedado na **Hostinger** e atualizado por pacote, não por git pull.

- O código do portal mora em **`portal-hostinger/`** no repositório,
  com `VERSION` próprio (independente do ERP).
- Para gerar o pacote: `bash scripts/empacotar-portal.sh` → cria
  `release/portal-v<versão>-<data>.zip` (com LEIA-ME de implantação
  dentro).
- O upload/implantação na Hostinger é feito **pelo dono** (gerenciador
  de arquivos ou FTP). O agente do servidor **não** implanta portal.
- O portal conversa com o ERP pela API pública (`/api/portal/*`,
  autenticada por `PORTAL_API_KEYS`) através de `app.vtdigital.site`.
- Enquanto `portal-hostinger/` não tiver código, o empacotador avisa
  e não gera nada — é o estado atual esperado.

### 8.1 Por que o portal NÃO usa git pull

A Hostinger (plano compartilhado) não dá shell com git nem processo
Node persistente. Por isso o portal é **estático/PHP publicado por
arquivo**, não por repositório. O git continua sendo a fonte da
verdade — o que muda é a forma de entrega:

| | ERP (servidor da gráfica) | Portal (Hostinger) |
|---|---|---|
| Entrega | `git pull origin main` | zip pelo gerenciador de arquivos |
| Quem aplica | **você** (agente do servidor) | **o dono**, manualmente |
| Versão | `VERSION` na raiz | `portal-hostinger/VERSION` |
| Reinício | `pm2 restart` | nenhum (arquivo estático) |
| Rollback | backup do `update.sh` | re-subir o zip anterior |

### 8.2 O passo a passo do portal (quando houver versão)

1. **No repositório** (feito pelo agente de desenvolvimento): o código
   do portal vive em `portal-hostinger/`, versionado normalmente no
   git. Nada de zip commitado — o zip é *gerado*, não guardado.
2. **Gerar o pacote** — pode ser rodado no servidor da gráfica, já que
   é só empacotamento (não toca produção nem banco):
   ```bash
   cd /www/wwwroot/erp-grafica
   git pull origin main
   bash scripts/empacotar-portal.sh
   # → release/portal-v<versão>-<data>.zip
   ```
3. **Entregar ao dono**: o zip fica em `release/`. Avise o caminho e a
   versão. **Você para aqui** — não tem credencial da Hostinger e não
   deve pedir.
4. **O dono sobe**: gerenciador de arquivos da Hostinger → pasta pública
   do domínio → extrair. O `LEIA-ME-HOSTINGER.txt` vai dentro do pacote
   com o passo a passo e a configuração de endpoint/chave.
5. **Validar**: abrir o portal no navegador e enviar um pedido de teste.
   O pedido tem que aparecer no ERP (o portal fala com
   `https://app.vtdigital.site/api/portal/*`, autenticado por
   `PORTAL_API_KEYS`).

> **Atenção à chave.** O portal e o ERP compartilham `PORTAL_API_KEYS`.
> Se essa chave for trocada no `.env` do ERP, o portal **para de
> funcionar** até ser re-empacotado/reconfigurado com a nova. Trocar a
> chave é, na prática, uma implantação dos dois lados.

---

## 9. Como você recebe trabalho (formato das mensagens)

O dono vai repassar mensagens do agente de desenvolvimento neste
formato:

> Atualize o ERP para a versão **X.Y.Z** (commit `<hash>`).
> Boletim: `UPDATES/X.Y.Z.md`. Migração de banco: sim/não.
> Validação: smoke + `/api/version` upToDate.

Sua resposta, ao terminar, deve trazer:

1. Saída do `/api/version` (versão + `upToDate`)
2. Última linha do `e2e:smoke` (contagem de checks ✔)
3. Qualquer anomalia encontrada no caminho

### 9.1 De onde vem essa mensagem (não é escrita à mão)

O agente de desenvolvimento fecha cada versão com **um comando só**:

```bash
npm run entregar -- --tipo patch --titulo "..." --mudou "..." 
```

O `scripts/entregar.mjs` faz, em ordem: calcula a próxima versão
(semver), grava `VERSION` + `package.json`, cria o boletim
`UPDATES/<versão>.md`, comita, faz push na branch de trabalho e
**imprime a mensagem acima já pronta**.

Por que isso importa para você: significa que **toda versão que chega
tem boletim**, com o commit certo carimbado dentro. Se você receber uma
ordem de atualização sem boletim correspondente, ou com a versão do
`VERSION` diferente da que a mensagem cita, **isso é anomalia** — pare e
reporte (§6, última linha).

### 9.2 O caminho completo, ponta a ponta

```
[agente de desenvolvimento]          [dono]              [você, no servidor]
  npm run entregar                                     
    → VERSION + package.json          
    → UPDATES/<v>.md                  
    → commit + push (branch arena/*)  
    → imprime a mensagem         ──►  abre o PR         
                                      mergeia em main   ──►  git pull origin main
                                      repassa a mensagem      bash scripts/update.sh
                                                              pm2 restart <nome>
                                                              valida (§4 passos 5–7)
                                                         ◄──  responde os 3 itens (§9)
```

**Você só entra depois do merge em `main`.** Se a mensagem citar uma
branch `arena/*`, o merge ainda não aconteceu: não atualize, avise o
dono.

---

*Manual criado na v3.70.1 (2026-08-27). Mantido pelo agente de
desenvolvimento — se encontrar erro aqui, reporte no grupo.*

## 10. Lições do deploy 27/08 (3.70.1 → 3.72.1)

Cada linha abaixo custou tempo real de produção. São regras agora.

1. **`export PATH` vale só no shell onde foi digitado.** Cada comando
   seu roda num shell novo — o update precisa rodar NO MESMO comando
   (ou use o caminho absoluto). Desde a 3.72.2 o `update.sh` acha o
   pg_dump certo sozinho (Debian + aPanel).
2. **Processo `next-server` zumbi na porta 3000.** Se o PM2 for
   zerado/recriado, o processo ANTIGO continua vivo FORA do PM2,
   segurando a porta e servindo versão velha da memória. Sintoma:
   `/api/version` mostra uma versão que não existe mais no código.
   Cura: `sudo pkill -9 -f next-server; sudo fuser -k 3000/tcp`,
   depois `pm2 restart`. (É a lição nº 1 do `deploy-auto.sh`.)
3. **`pm2 save` depois de qualquer mudança na lista do PM2** — sem
   isso o reboot traz a lista antiga.
4. **Update cortado por timeout NÃO concluiu.** Confira
   `.next/BUILD_ID` e `docs/` antes de prosseguir; rodar o update de
   novo é seguro (backup novo + build idempotente).
5. **Timeout do agente ≠ falha do update.** Monitore com pauses
   maiores (o build pode levar 8-12 min) e NÃO reexecute etapas
   paralelamente.

