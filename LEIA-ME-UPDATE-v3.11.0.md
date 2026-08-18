# Atualização para v3.11.0 — Financeiro & Relatórios

**Pacote**: `printflow-erp-v3.11.0.tar.gz` (385 KB · 236 arquivos)
**SHA-256**: `7e4702b44be0f82efd2e3c095ec20322e115e600f8d3243b7a705239a57d17d1`
**De**: v3.10.0 → **Para**: v3.11.0

O pacote **não contém** `.env`, `node_modules`, `.next`, `.git` nem `.printflow`.
Sua configuração e seus dados permanecem intactos.

---

## Passo a passo (segue `docs/UPDATE.md`)

```bash
# 1. Vá para a pasta da instalação atual
cd /caminho/do/printflow-erp

# 2. Confira o arquivo (opcional, mas recomendado)
sha256sum -c printflow-erp-v3.11.0.tar.gz.sha256

# 3. Extraia por cima do código atual
tar -xzf printflow-erp-v3.11.0.tar.gz -C .

# 4. Rode o updater oficial
#    (backup + deps + schema + reparos + rebuild — SEM reseed)
bash scripts/update.sh

# 5. Reinicie o processo de produção
pm2 restart printflow
# ou
sudo systemctl restart printflow
# ou
bash scripts/start.sh
```

## Verificação pós-update

```bash
cat VERSION                  # → 3.11.0
bash scripts/healthcheck.sh  # → health: OK
curl -s http://127.0.0.1:3000/api/version
# → "app":"v3.11.0 · Financeiro & Relatórios"
```

Com o servidor no ar, valide o fluxo completo:

```bash
npm run e2e:smoke            # → 33 verificações
```

---

## O que o `update.sh` faz sozinho

1. Backup em `.printflow/backups/` (código + `pg_dump`, com fallback JSON)
2. `npm ci --include=dev`
3. `node scripts/preflight.mjs`
4. **`drizzle-kit push`** — cria as colunas novas em `transactions`
   (`sale_id`, `order_id`, `purchase_id`, `cash_session_id`, `automatic`,
   `archived_at`, `archive_reason`, `notes`)
5. Todos os scripts de reparo, **incluindo o novo `repair-finance.mjs`**
6. `rm -rf .next && npm run build` (Webpack)

O `repair-finance.mjs` é o que acerta a base existente: normaliza categorias
(`"Vendas"` → `venda`), religa lançamentos antigos aos documentos, marca os
automáticos, aplica o status `atrasado` e **reconstrói a despesa das compras
que já foram recebidas mas nunca lançaram no financeiro**.

Saída esperada, algo como:

```
✅ Financeiro reparado: 4 categorias normalizadas · 1 vínculo de venda ·
   2 vínculos de pedido · 1 despesa de compra reconstruída
```

---

## Atenção — mudança de comportamento

Depois do update, o operador vai notar:

| Antes | Agora |
|---|---|
| Excluía qualquer lançamento | Lançamento gerado pelo PDV/pedido/compra é **bloqueado** (409). Cancele o documento de origem. |
| Excluir apagava de vez | Excluir **arquiva** (reversível pelo botão "Arquivados") |
| Telas mostravam a base inteira | Telas abrem no **mês corrente** — use o seletor de período |
| Faturamento incluía cancelados | Cancelados ficam **fora** de todos os números |
| Compras não apareciam | Compra recebida vira **despesa** — o resultado vai cair, porque agora inclui o custo de insumo que antes era invisível |

Esse último ponto é o que mais chama atenção: o resultado exibido pode ficar
negativo. Não é erro — é o custo de material entrando na conta pela primeira vez.

---

## Rollback

```bash
BACKUP=$(cat .printflow/last-backup.path)
tar -xzf "$BACKUP/app-source.tgz" -C /caminho/temporario
pg_restore --clean --if-exists -d "$DATABASE_URL" "$BACKUP/database.dump"
```

---

## Antes de atualizar

- [ ] Backup externo do PostgreSQL (além do automático do updater)
- [ ] `.env` intacto
- [ ] Node.js 20+
- [ ] Janela de manutenção comunicada

Detalhe técnico completo de cada correção: `docs/AUDIT-FINANCEIRO-RELATORIOS.md`
e `docs/CHANGELOG.md` (entrada `[3.11.0]`), ambos dentro do pacote.
