# Atualização — PrintFlow ERP

Como subir de uma versão para outra **sem perder dados**.

## Princípios

- O updater **nunca** roda seed de novo
- Sempre tenta backup antes de alterar deps/schema/build
- Schema via `drizzle-kit push` (idempotente)
- Versão canônica em `VERSION` + `package.json`

## Fluxo padrão

```bash
cd /caminho/do/printflow-erp

# 1. Coloque o código da nova versão
#    git pull
#    ou rsync / tarball sobre a pasta

# 2. Atualize
bash scripts/update.sh

# 3. Reinicie o processo de produção
#    (pare o processo antigo e)
bash scripts/start.sh
```

## O que o `update.sh` faz

1. Lê `VERSION`
2. Carrega `.env`
3. Backup em `.printflow/backups/<timestamp>_vX_to_vY/`
   - tarball do código (sem `node_modules` / `.next`)
   - `pg_dump` custom
   - fallback para dump SQL
   - fallback final JSON (`database-fallback.json`) se `pg_dump` falhar/ausente
4. Instala dependências com `NODE_ENV=development npm ci --include=dev` para garantir ferramentas de build/Drizzle mesmo em servidor com `.env NODE_ENV=production`
5. `node scripts/preflight.mjs`
6. `drizzle-kit push`
7. Scripts de reparo (`ensure-settings`, contadores, módulos)
8. `rm -rf .next && npm run build`
9. Atualiza `.printflow/install.json`

## Rollback rápido

```bash
BACKUP=$(cat .printflow/last-backup.path)

# Código
tar -xzf "$BACKUP/app-source.tgz" -C /caminho/temporario
# restaure os arquivos necessários

# Banco (se houver dump custom)
pg_restore --clean --if-exists -d "$DATABASE_URL" "$BACKUP/database.dump"

# Rebuild / start
bash scripts/update.sh   # ou só npm run build + start
```

## Checklist antes de atualizar

- [ ] Backup externo do PostgreSQL (além do automático)
- [ ] Janela de manutenção comunicada
- [ ] `.env` intacto
- [ ] Disco com espaço para backup + `node_modules` + `.next`
- [ ] Node.js ainda na faixa suportada (20+)

## Atualização com zero-downtime (avançado)

1. Suba a nova versão em pasta paralela
2. Rode `install.sh` ou `update.sh` lá
3. Aponte o reverse proxy para a nova instância
4. Encerre a antiga

## Erros comuns

| Erro | Causa / solução |
|------|-----------------|
| `.env não encontrado` | Instalação incompleta — rode `install.sh` |
| Push alterou enum incompatível | Revise migrations manuais / restore dump |
| Build falha após update | `rm -rf .next node_modules && npm ci && npm run build` |
