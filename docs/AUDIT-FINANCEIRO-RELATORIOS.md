# Auditoria e Correção — Módulos Financeiro & Relatórios

**Data**: 2026-08-17 · **Versão auditada**: v3.10.0 · **Versão corrigida**: v3.11.0
**Escopo**: `/financeiro`, `/relatorios` e a integração com PDV, Pedidos/OS, Compras/Estoque, Caixa e Dashboard.

Todos os achados foram reproduzidos com chamada real na instância rodando, e todas as correções foram reverificadas do mesmo modo.

---

## 0. Diagnóstico estrutural (a causa-raiz)

O programador anterior aplicou, de v3.0.2 a v3.0.12, sempre o mesmo padrão em cada módulo: camada server-side em `src/lib/` + script de reparo. **Financeiro e Relatórios eram exatamente os dois que faltavam.** `/api/crud/transactions` era um `crudHandler` cru de 25 linhas escrevendo direto na tabela; Relatórios era cálculo solto dentro do `page.tsx`. Praticamente todos os bugs derivavam disso.

A v3.11.0 fecha essa lacuna:

| Novo arquivo | Papel |
|---|---|
| `src/lib/finance.ts` | Validação Zod, regras de status, arquivamento, lançamento automático idempotente |
| `src/lib/reports.ts` | Agregação em SQL com período e filtro de cancelados |
| `src/lib/period.ts` | Datas no fuso da operação (`APP_TZ`) |
| `src/components/modules/PeriodPicker.tsx` | Seletor de período compartilhado |
| `scripts/repair-finance.mjs` | Normalização de dados legados |

---

## 1. CRÍTICO — corrigido

### 1.1 Valor em padrão brasileiro derrubava o lançamento

`"10,50"` virava NaN no `numeric` → **erro 500 com o SQL inteiro devolvido ao navegador**. O `money.ts` já resolvia isso, mas o Financeiro não o usava.

```
ANTES  amount:"10,50"  → 500 {"error":"Failed query: insert into \"transactions\"…"}
DEPOIS amount:"10,50"  → 200 {"amount":"10.50","category":"venda"}
       amount:"R$ 1.234,56" → 200 {"amount":"1234.56"}
       amount:"abc"    → 400 {"error":"amount: Valor inválido — use por exemplo 1.234,56"}
```

O erro genérico nunca mais expõe a query.

### 1.2 Relatórios contabilizava vendas e pedidos CANCELADOS

```
Venda PDV-2026-0004 de R$ 27,00 cancelada
ANTES  Receita R$ 450,24 · Vendas PDV 2 · ticket R$ 14,04
DEPOIS Receita R$ 423,24 · Vendas PDV 1 · ticket R$ 1,08
       + aviso: "1 venda(s) cancelada(s) somando R$ 27,00 — excluídas"
```

### 1.3 Valor negativo e descrição vazia aceitos

Ambos retornavam 200 OK. Agora 400 com mensagem específica.

### 1.4 Lançamento automático podia ser apagado e adulterado

```
ANTES  delete id:7                          → 200 OK (receita do PDV sumia)
       update {amount:99999, type:despesa}  → 200 OK
DEPOIS delete → 409 "Cancele o documento de origem…" {origin:"venda #1"}
       update → 409 AUTOMATIC_LOCKED
       settle → 200 OK  (a baixa continua permitida — regra correta)
```

Exclusão manual virou **arquivamento** (`archived_at` + motivo), com restauração.

### 1.5 Fuso horário deslocava faturamento para o mês errado

Venda de 31/08 às 21:30 BRT era agrupada em `2026-09`. A conversão agora acontece em SQL, com `AT TIME ZONE` no fuso da loja, antes de cortar o mês.

> **Bug extra encontrado durante a correção**: com o fuso passado como bind param (`$1`), o PostgreSQL recusa a query (`42803` — expressão do `GROUP BY` não reconhecida como idêntica à do `SELECT`). Só apareceu em teste de página real, não no typecheck. Resolvido com literal sanitizado.

---

## 2. INTEGRAÇÃO — corrigido

### 2.1 Compra recebida NÃO virava despesa

A tela prometia "compras, as despesas", mas `receivePurchase()` não tocava em `transactions`: **o custo de insumo nunca entrava no resultado**.

```
DEPOIS  CMP-2026-0003 (10 × R$ 25) recebida
        → despesa "Compra CMP-2026-0003" R$ 250,00 · automatic=t
        receber de novo → continua 1 lançamento (idempotente)
```

### 2.2 Caixa isolado do Financeiro

Sangria, suprimento e a quebra do fechamento cego agora geram lançamento vinculado à sessão:

```
Suprimento de caixa #1 — troco inicial     receita  R$ 50,00
Sangria de caixa #1 — deposito banco       despesa  R$ 30,00
Quebra de caixa · fechamento #1            despesa  R$ 33,50
```

Movimentos usam `dedupe:false` — várias sangrias na mesma sessão são eventos distintos.

### 2.3 Relatórios ignorava o Financeiro

Não importava `transactions`: sem DRE, sem lucro. Agora há **Resultado do período** com receitas e despesas por categoria, resultado por competência, saldo em caixa e margem — conferido contra o banco:

```
Receitas R$ 977,24  (Pedido/OS 422,16 · Venda PDV 305,08 · Serviço 250,00)
Despesas R$ 1.201,00 (Insumo 540 · Energia 380 · Compra 254 · Estorno 27)
Resultado −R$ 223,76 · margem −22,9% · caixa R$ 160,24
```

As compras de insumo, antes invisíveis, agora aparecem.

### 2.5 `ilike` casava o pedido errado

`ilike("Pedido PED-2026-001%")` casava também com `PED-2026-0010`, `0011`… Agora o casamento é por `order_id`. Testado com 11 pedidos: atualizar o PED-001 deixou `PED-0010` (80,00) e `PED-0011` (90,00) intactos.

### 2.6 Sem FK para documento de origem

`transactions` ganhou `sale_id`, `order_id`, `purchase_id`, `cash_session_id` (todas com FK), `automatic`, `archived_at`, `archive_reason`, `notes`.

---

## 3. LÓGICA — corrigido

- **3.1 Status `atrasado` nunca era atribuído** — o enum previa, a UI filtrava, nada escrevia. `refreshOverdue()` marca os vencidos ao abrir a tela. Testado: vencimento em 15/01 → `atrasado`.
- **3.2 "Saldo do período" sem período** — seletor com mês atual, presets e intervalo livre. Janeiro/2026 retorna R$ 0,00; agosto retorna R$ 777,24.
- **3.3 Mix de pagamento quebrava com split** — lia a string `"PIX + Dinheiro"`. Agora lê o JSONB `payments`: PIX R$ 14,58 · Dinheiro R$ 13,50, sem fatia fantasma.
- **3.4 Margem negativa renderizava barra CHEIA** — `width: -37%` é CSS inválido e era descartado. Clamp em [-100, 100], escala por valor absoluto e hachura no negativo.
- **3.5 Ticket médio** não considera mais cancelada no divisor.

---

## 4. LAYOUT E UX — corrigido

1. Loading e tratamento de erro em todas as ações (antes `markPaid`/excluir davam `refresh()` mesmo em falha).
2. `confirm()` nativo → `Modal`, alinhado ao resto do sistema.
3. Paginação (40/página) e busca por descrição no Financeiro.
4. Cartões em vez de tabela no mobile (7 colunas em celular exigiam rolagem constante).
5. Agenda de vencimentos dos próximos 30 dias.
6. Exportação **CSV** (com BOM para o Excel) e impressão em Relatórios.
7. Badge `auto` identificando lançamento do sistema.
8. Categorias canônicas: `"Vendas"`/`"Insumos"` do seed e `"venda"`/`"taxa_cartao"` do código automático eram tratados como distintos.
9. `Donut` não muta mais acumulador durante o render (imutabilidade do React 19) — corrigia também o único erro de lint nos arquivos tocados.

---

## 5. Validação final

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | limpo |
| `npx eslint` nos 10 arquivos tocados | 0 erros, 0 warnings |
| `npm run build` | compila |
| `npm run e2e:smoke` | **33 checkpoints** (era 20) |
| `scripts/healthcheck.sh` | health OK · v3.11.0 |
| 15 páginas do sistema | todas HTTP 200 |
| `node scripts/check-version.mjs` | consistente em v3.11.0 |

Novos checkpoints no smoke, todos passando:

```
✅ Financeiro aceita valor no padrão brasileiro
✅ Financeiro normaliza a categoria para o slug canônico
✅ Financeiro rejeita valor negativo
✅ Financeiro rejeita valor não numérico
✅ Financeiro não vaza SQL na mensagem de erro
✅ lançamento do PDV fica vinculado à venda por FK
✅ lançamento automático não pode ser excluído
✅ exclusão manual vira arquivamento (não destrói)
✅ compra recebida gera despesa no Financeiro
✅ receber a mesma compra duas vezes não duplica a despesa
✅ venda cancelada muda de status
✅ faturamento válido exclui vendas canceladas
✅ página /financeiro responde
✅ relatórios respondem com período personalizado
```

`scripts/repair-finance.mjs` rodou na base existente:

```
4 categorias normalizadas · 2 datas de pagamento · 1 vínculo de venda ·
2 vínculos de pedido · 1 despesa de compra reconstruída
```

Registrado em `install.sh` e `update.sh`, no padrão dos demais reparos.

---

## 6. O que foi preservado

`money.ts` (o gross-up de cartão está matematicamente certo), `createSale` (idempotência por `clientRef`, preço lido do banco, transação atômica), `cancelSale`, `nextDocumentNumber` (atômico via `ON CONFLICT DO UPDATE`) e `expectedInDrawer`. Nenhuma regra correta foi reescrita — apenas passaram a gravar com vínculo de origem.

## 7. Pendências conhecidas (não bloqueiam)

- Erros de lint pré-existentes em outros módulos (`PosClient`, `OrdersClient`, `QuotesClient`, `TopBar`…), fora do escopo desta entrega.
- Vulnerabilidades de `npm audit` já registradas no `AUDIT-2026-08-17.md`.
- `sales.total`/`orders.total` são `numeric(12,4)` e `transactions.amount` é `numeric(12,2)`; o arredondamento agora é explícito via `toDecimalString(v, 2)`, mas unificar a precisão no schema fica para uma próxima versão.
