# Atualização de versão — PrintFlow ERP

Fluxo único, reversível e com backup automático do banco antes de qualquer migração.

## Atualizar (caminho normal)

```bash
cd erp-grafica
bash scripts/update.sh
```

Etapas executadas:

1. **Pré-requisitos** — Node/npm/psql, `.env` e conexão com o banco.
2. **Download** — `git fetch` + `git pull --ff-only` (tag opcional via `--v X.Y.Z`).
3. **Backup** — `pg_dump | gzip` em `backups/pre-update-<versão>-<timestamp>.sql.gz`
   (mantém os 10 mais recentes). Se o backup falhar, a atualização é **abortada**.
4. **Dependências** — `npm ci`.
5. **Migração** — `drizzle-kit push` (schema sempre alinhado com `src/db/schema.ts`) e
   validação de versionamento (`scripts/check-version.mjs`).
6. **Build** — `npm run build`.
7. **Publicação** — grava `settings.app_version` / `app_updated_at`, reinicia o processo
   (PM2/systemd/nohup) e espera `/api/health` responder `{"ok":true}`.

Flags:

| Flag | Efeito |
|---|---|
| `--v X.Y.Z` | Atualiza para tag específica, se existir |
| `--skip-pull` | Não faz `git pull` (deploy de bundle/artefato) |
| `--no-backup` | Pula o backup (**não recomendado**) |
| `--yes` | Sem confirmação interativa |

Atalho: `npm run update`.

## Verificar depois de atualizar

```bash
bash scripts/healthcheck.sh
curl -s localhost:3000/api/version | jq
```

`upToDate: true` significa que a versão no banco é igual à da build.

## Rollback (voltar versão anterior)

```bash
ls -1t backups/ | head        # escolha o backup anterior à atualização
bash scripts/restore.sh backups/pre-update-3.0.0-20260101-120000.sql.gz
git checkout v3.0.0
bash scripts/update.sh --skip-pull --no-backup --yes
```

## Lançar uma nova versão (mantenedor)

```bash
bash scripts/release.sh 3.1.0 "Correções no PDV e motor de custo"
git push --follow-tags
```

O `release.sh` atualiza `VERSION`, `src/lib/version.ts`, `package.json`, acrescenta a entrada no
`CHANGELOG.md`, faz o commit e cria a tag anotada. Nada mais precisa ser editado à mão.

### Regras de versão

| Incremento | Quando usar | Ação no servidor |
|---|---|---|
| `PATCH` | correção de bug | `npm run update` |
| `MINOR` | nova funcionalidade/módulo | `npm run update` (schema novo é aditivo) |
| `MAJOR` | estrutura incompatível | backup obrigatório + `npm run update` |

## Operação auxiliar

```bash
npm run backup           # backup imediato
npm run restore -- <arquivo.sql.gz>
npm run check            # healthcheck rápido
npm run db:push          # reaplicar schema
npm run db:seed          # recarregar catálogo (usa ON CONFLICT, preserva dados)
npm run db:reset         # APAGA tudo e recria (bloqueado se APP_ENV=production)
```
