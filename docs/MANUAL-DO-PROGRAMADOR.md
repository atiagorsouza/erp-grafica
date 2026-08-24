# Manual do programador — VTDIGITAL ERP

Como instalar, atualizar e corrigir **sem quebrar o sistema**.

Escrito a partir do que realmente aconteceu neste projeto: cada aviso
aqui corresponde a um problema que já derrubou a produção pelo menos uma
vez.

- **Versão atual:** 3.63.0
- **Onde roda:** servidor no escritório · Debian · aPanel ·
  `/www/wwwroot/erp-grafica` · pm2 sob root · Cloudflare Tunnel
- **Pilha:** Next.js 16 · React 19 · Drizzle 0.45 · PostgreSQL 17

---

# 1. As cinco regras

Se você só ler uma parte deste documento, leia esta.

### 1.1 Backup antes de qualquer coisa que toque no banco

```bash
pg_dump "$DATABASE_URL" > ~/backup-$(date +%F-%H%M).sql
ls -lh ~/backup-*.sql     # confira o TAMANHO
```

Arquivo de 0 byte não é backup. Confira antes de prosseguir.

**Se der "server version mismatch" (17 vs 18):** o cliente instalado é
mais novo que o servidor e o `pg_dump` se recusa a rodar. Use o binário
da versão certa:

```bash
/usr/lib/postgresql/17/bin/pg_dump "$DATABASE_URL" > ~/backup-$(date +%F-%H%M).sql
```

Se ainda assim falhar, o `deploy-auto.sh` gera um backup próprio em
`.printflow/backups/<data>_v<origem>_to_v<destino>/` (banco em JSON +
código). Serve de rede de segurança — mas **confirme que ele existe**
antes de seguir, não presuma.

### 1.2 Nunca instale sem as dependências de desenvolvimento

```bash
npm install                  # ✅ certo
npm install --omit=dev       # ❌ QUEBRA O BUILD
```

TypeScript e Tailwind são `devDependencies` e são necessários para
**compilar**. Sem eles o webpack não resolve os atalhos `@/` e o `.next`
sai sem manifesto — o build "termina bem" e o sistema não sobe.

Aconteceu em produção em 19/08/2026.

### 1.3 Confira o `BUILD_ID`, não a mensagem de sucesso

```bash
npm run build
ls -la .next/BUILD_ID     # SE NÃO EXISTIR, O BUILD FALHOU
```

O build pode imprimir `✓ Compiled successfully` e ainda assim não gerar
o `BUILD_ID` — foi o que derrubou o site em 20/08/2026. Sem esse
arquivo, o `next start` sai na hora e o pm2 entra em loop infinito.

**O arquivo é a verdade. A mensagem não.**

### 1.4 Aponte o pacote na mão — e saiba QUAL dos dois arquivos

Existem **dois** arquivos, e confundi-los já custou dois deploys:

| Arquivo | O que é |
|---|---|
| `VTDIGITAL-<v>-COMPLETO.tar.gz` | **wrapper** — a caixa: contém a pasta `update-<v>/` com scripts, logos e LEIA-ME |
| `update-<v>/printflow-erp-v<v>.tar.gz` | **o sistema** — é este que o deploy recebe |

Primeiro abra a caixa, confira o que veio, e só então instale:

```bash
tar -xzf VTDIGITAL-3.63.0-COMPLETO.tar.gz
cd update-3.63.0
sha256sum -c printflow-erp-v3.63.0.tar.gz.sha256     # tem que dizer OK
tar -xzOf printflow-erp-v3.63.0.tar.gz ./VERSION     # TEM QUE IMPRIMIR 3.63.0
bash deploy-auto.sh "$PWD/printflow-erp-v3.63.0.tar.gz"
```

**Conferir o `VERSION` antes de instalar leva 1 segundo e evita meia
hora de diagnóstico errado.** Sem isso, um deploy que "passou" pode ter
instalado a versão antiga — e a conclusão apressada vira "o pacote está
corrompido", quando o pacote estava certo.

#### Por que o caminho é obrigatório


```bash
bash deploy-auto.sh /caminho/completo/printflow-erp-v3.62.0.tar.gz   # ✅
bash deploy-auto.sh                                                   # ⚠️
```

Sem o caminho, o script escolhe o arquivo **mais recente por data**
(`ls -1t`) entre várias pastas. Foi assim que ele instalou a 3.60.1
achando que era a 3.61.0: o build passou, mas com a versão errada.

### 1.5 O ERP roda sob **root**

```bash
sudo -i          # SEMPRE antes de mexer
pm2 list         # como root: mostra o printflow
```

Rodar `pm2 list` como usuário comum mostra lista **vazia** mesmo com o
sistema no ar — e subir uma segunda cópia deixa duas aplicações
brigando pela porta 3000.

---

# 2. Instalação do zero

```bash
# 1. Dependências do sistema
sudo apt-get install -y postgresql nodejs npm
sudo npm install -g pm2

# 2. Banco
sudo -u postgres createdb app_db

# 3. Código
cd /www/wwwroot
tar -xzf printflow-erp-v3.62.0.tar.gz -C erp-grafica
cd erp-grafica

# 4. Configuração
cp .env.example .env
nano .env          # DATABASE_URL, APP_TZ=America/Sao_Paulo

# 5. Dependências (SEM --omit=dev)
npm install

# 6. Estrutura do banco
npx drizzle-kit push --force
node scripts/ensure-settings.mjs
node scripts/migrar-banco.mjs --aplicar

# 7. Dados iniciais
node scripts/seed-tabelas-precos.mjs
node scripts/seed-parque-real.mjs
node scripts/seed-categorias-produtos.mjs --aplicar
node scripts/aplicar-logo.mjs --aplicar

# 8. Carimbar a versão no banco
node scripts/check-version.mjs --fix

# 9. Build
npm run build
ls -la .next/BUILD_ID          # tem que existir

# 10. Subir
pm2 start npm --name printflow -- start
pm2 save
pm2 startup                    # para voltar sozinho no reboot

# 11. Conferir
curl -s http://127.0.0.1:3000/api/version
```

Resposta esperada: `"version"` e `"installedVersion"` iguais, e
`"upToDate": true`.

> **Não rode `seed-demo.mjs` em produção** — ele insere clientes e
> pedidos fictícios.

---

# 3. Atualização

```bash
# 1. Virar root
sudo -i
cd /www/wwwroot/erp-grafica

# 2. BACKUP
pg_dump "$DATABASE_URL" > ~/backup-antes-<versão>-$(date +%F-%H%M).sql
ls -lh ~/backup-antes-*.sql

# 3. Conferir o pacote
sha256sum -c printflow-erp-v<versão>.tar.gz.sha256      # tem que dizer OK

# 4. Aplicar (COM o caminho)
bash deploy-auto.sh /caminho/completo/printflow-erp-v<versão>.tar.gz

# 5. Conferir
curl -s http://127.0.0.1:3000/api/version
```

Se `installedVersion` vier `null` ou atrasado:

```bash
node scripts/check-version.mjs --fix
```

E confirme no navegador: **app.vtdigital.site**

### Atualização manual (se o deploy-auto falhar)

```bash
sudo -i && cd /www/wwwroot/erp-grafica
pg_dump "$DATABASE_URL" > ~/backup-$(date +%F-%H%M).sql
pm2 stop printflow
tar -xzf /caminho/printflow-erp-v<versão>.tar.gz -C .
npm install
npx drizzle-kit push --force
node scripts/migrar-banco.mjs --aplicar
node scripts/check-version.mjs --fix
rm -rf .next && npm run build
ls -la .next/BUILD_ID
pm2 restart printflow --update-env
pm2 save
```

---

# 4. Diagnóstico rápido

```bash
sudo -i
pm2 list                                   # ↺ alto = loop de restart
pm2 logs printflow --lines 30 --nostream   # o erro real
systemctl status cloudflared --no-pager    # o túnel
curl -s http://127.0.0.1:3000/api/version  # a aplicação
ls -la /www/wwwroot/erp-grafica/.next/BUILD_ID
```

| Sintoma | Causa provável | Conserto |
|---|---|---|
| 502 no site | app parada, túnel de pé | `pm2 restart printflow` |
| `pm2 list` vazio | você não é root | `sudo -i` |
| `↺` subindo sem parar | falta `BUILD_ID` | rebuild (§5.1) |
| `Could not find a production build` | idem | rebuild (§5.1) |
| `heap out of memory` | checagem de tipos no build | §5.1 |
| `installedVersion: null` | carimbo não rodou | `check-version.mjs --fix` |
| Versão errada após deploy | pacote escolhido por data | regra 1.4 |
| Site fora após reboot | pm2 não salvo | `pm2 save && pm2 startup` |

---

# 5. Problemas conhecidos

## 5.1 Build morre por falta de memória

**Sintoma:**

```
✓ Compiled successfully in 10.6s
  Running TypeScript ..
FATAL ERROR: JavaScript heap out of memory
```

**Leia com atenção:** a compilação **terminou bem**. Quem estoura é a
checagem de tipos, que roda depois, dentro do mesmo processo.

**Não é falta de RAM na máquina.** Foram gastas três tentativas criando
swap de 4 GB numa máquina com 9,8 GB livres — não resolveu, porque o
limite é do **heap do Node**, não da memória do servidor.

Medido:

| | Memória |
|---|---|
| Checagem de tipos sozinha | 388 MB |
| Build com ela dentro | 985 MB (estourava) |
| Build sem ela dentro | 890 MB ✅ |

**Correção (já vem na 3.62.0):** o `next.config.ts` tem
`typescript: { ignoreBuildErrors: true }`.

Se precisar aplicar à mão numa versão antiga:

```bash
export NODE_OPTIONS="--max-old-space-size=4096"
printf 'import type { NextConfig } from "next";\nconst nextConfig: NextConfig = { typescript: { ignoreBuildErrors: true } };\nexport default nextConfig;\n' > next.config.ts
rm -rf .next && npm run build
ls -la .next/BUILD_ID
```

**Isso não afrouxa a qualidade:** a checagem continua obrigatória em
`npm run typecheck`, só roda fora do build.

## 5.2 Deploy instala a versão errada

O `deploy-auto.sh` procura pacotes em `../update-*/`, `../release/` e na
raiz, e pega o **mais recente por data**. Sempre passe o caminho (1.4).

## 5.3 Versão do Next diverge

Servidor **16.3.1**, desenvolvimento **16.2.6** — o `package.json` não
trava a versão exata. Se o build falhar com erro estranho, é o primeiro
suspeito.

---

# 6. Como mexer no código sem quebrar

## 6.1 Antes de fechar qualquer alteração

```bash
npm run typecheck    # tem que sair limpo
npm run lint         # tem que continuar em 11 (baseline)
npm run build        # e gerar BUILD_ID
npm run e2e:smoke    # 257 de 257
```

**Os quatro. Sempre.** O smoke já pegou erro real que passou pelos
outros três.

## 6.2 Armadilhas deste projeto

Cada uma custou tempo pelo menos uma vez:

- **Fuso horário em SQL.** `created_at` é `timestamp without time zone`
  guardando **UTC**. A conversão certa é:
  ```sql
  (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date
  ```
  Pular o `AT TIME ZONE 'UTC'` joga a venda da noite para o dia
  seguinte. Eu cometi esse erro reescrevendo a Visão Geral; só peguei
  porque comparei a tela nova com a antiga, número por número.

- **Contadores de aba vêm de `COUNT`, não da página.** Ao paginar, se os
  contadores passarem a contar só a página, "Atrasados" nunca passa de
  10 — e ninguém percebe que está errado.

- **Busca cobre mais campos do que parece.** Pedidos varre 6 (incluindo
  descrição de item dentro de JSONB); Clientes varre 10 (IE, RG,
  inscrição municipal, contato). Simplificar faz a busca emagrecer **em
  silêncio**: o operador procura "banner" e não acha, sem erro na tela.

- **`import "server-only"`** em `pricing`, `settings`, `mensagens`,
  `campanhas`, `registration-links`, `queries`. Não dá para importar
  desses arquivos em componente de cliente — nem em script de teste
  solto (o `tsx` reclama).

- **Documentos de impressão são intocáveis.** Antes de mexer em
  largura, scroll ou grid, verifique se o pai é `#order-print-a4`,
  `#quote-print-a4` ou `#receipt-print`. A tela e o papel são caminhos
  separados (`isPrint`).

- **Mudou a assinatura de um componente?** Atualize **todos** os pontos
  que o chamam no mesmo patch.

- **Não existe `brl()`** — use `toDecimalString(x, 2)` / `formatBRL`.

- **`PageHeader` exige `eyebrow`.**

- **Grepe `icons.tsx`** antes de usar um ícone novo.

- **HTML colapsa espaços** — use `\u00a0` quando precisar preservar.

- **`awk` com intervalo em `schema.ts` lê além da tabela** — use regex
  Python sobre `pgTable("nome"`.

## 6.3 Alterações no banco

```bash
# 1. Edite src/db/schema.ts
# 2. Aplique
npx drizzle-kit push --force
# 3. Confirme
psql "$DATABASE_URL" -c "\d nome_da_tabela"
```

**Regra do dono: update não pode quebrar o banco dele.** Prefira sempre
adicionar coluna a renomear ou remover. Se precisar transformar dados,
escreva em `scripts/migrar-banco.mjs`, que é idempotente (roda duas
vezes sem estragar).

## 6.4 Fechar uma versão

```bash
git add -A && git commit -m "..."
bash scripts/release.sh 3.63.0 "Resumo em uma linha"
git add -A && git commit -m "chore(release): v3.63.0"   # o release.sh às vezes
git tag -d v3.63.0 && git tag -a v3.63.0 -m "..."       # deixa arquivos soltos
npm run build && npm run e2e:smoke
bash scripts/pack.sh
```

Depois monte `/home/user/update-<versão>/` com o pacote, os scripts, as
logos, o `.sha256` e um LEIA-ME.

> **Confira que a tag aponta para o commit certo.** No fechamento da
> 3.62.0 o `release.sh` deixou `VERSION`, `package.json` e `version.ts`
> sem commitar, e a tag ficou apontando para o commit anterior.

---

# 7. Recuperação de emergência

**Site fora, precisa voltar já:**

```bash
sudo -i && cd /www/wwwroot/erp-grafica
pm2 logs printflow --lines 30 --nostream     # entenda antes de agir
export NODE_OPTIONS="--max-old-space-size=4096"
rm -rf .next && npm install && npm run build
ls -la .next/BUILD_ID
pm2 restart printflow --update-env
pm2 reset printflow && pm2 save              # zera o contador de restarts
curl -s http://127.0.0.1:3000/api/version
```

**Voltar para a versão anterior:**

```bash
pm2 stop printflow
psql "$DATABASE_URL" < ~/backup-antes-<versão>.sql
tar -xzf /caminho/printflow-erp-v<anterior>.tar.gz -C .
npm install && rm -rf .next && npm run build
pm2 restart printflow
```

Há também `scripts/socorro.sh` no pacote de update.

---

# 8. O que NÃO fazer

| ❌ | Por quê |
|---|---|
| `npm install --omit=dev` | quebra o build (regra 1.2) |
| Confiar no "Compiled successfully" | confira o `BUILD_ID` (1.3) |
| Passar o **wrapper** ao deploy | ele espera o pacote interno (1.4) |
| Concluir "pacote corrompido" sem abrir | abra e leia o `VERSION` (1.4) |
| Insistir em consertar sozinho | pare no 1º erro, reporte, decida junto |
| Criar swap para resolver OOM | o limite é do heap, não da RAM (5.1) |
| `deploy-auto.sh` sem caminho | instala versão errada (1.4) |
| `pm2` sem `sudo` | duas cópias na mesma porta (1.5) |
| Atualizar sem backup | sem volta atrás (1.1) |
| `seed-demo.mjs` em produção | insere dados fictícios |
| `npm audit fix --force` | muda versões maiores; suba sozinho |
| Renomear/remover coluna | update não pode quebrar o banco |
| Mexer em impressão sem checar `isPrint` | estraga o documento no papel |
| Dois agentes/pessoas no mesmo servidor | um desfaz o outro no meio do deploy |

---

# 9. Referência

**Scripts** (`scripts/`):

| Script | Para quê |
|---|---|
| `deploy-auto.sh` | atualização completa |
| `check-version.mjs --fix` | sincroniza versão (arquivo ↔ banco) |
| `migrar-banco.mjs --aplicar` | migrações de dados (idempotente) |
| `ensure-settings.mjs` | garante as chaves do painel |
| `e2e-smoke.mjs` | 257 verificações |
| `pack.sh` / `release.sh` | empacotar / versionar |
| `socorro.sh` | recuperação |
| `aplicar-logo.mjs --aplicar` | logos no banco |
| `seed-*.mjs` | dados iniciais (`seed-demo` **só** em teste) |

**Saúde do sistema:**

```bash
curl -s http://127.0.0.1:3000/api/version   # versão + banco
curl -s http://127.0.0.1:3000/api/health    # saúde
```

**Pendências abertas:** ver `AUDITORIA-3.62.0.md`. Os três achados de
maior risco foram corrigidos na 3.63.0; seguem abertas as dependências
com CVE, a versão do Next divergente e o fuso no cliente.
