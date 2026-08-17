# Auditoria — Estoque, Compras & Produtos

Módulo nunca auditado. Arquivos: `src/lib/stock.ts` (466 linhas),
`StockClient.tsx`, `api/crud/stock-movements`, `api/purchases`,
`api/crud/materials`, `api/crud/suppliers`.

Todos os achados abaixo foram **reproduzidos no servidor rodando**, não
deduzidos por leitura de código.

---

## 🔴 Bug 1 — Saída simultânea fura o estoque (crítico)

`createStockMovement` valida o saldo com um `select` comum e só depois
faz o `update`. Entre a leitura e a escrita, outra requisição lê o mesmo
saldo. É o mesmo TOCTOU que o PDV já resolveu com `FOR UPDATE`
(`assertStockLocked` em `sales.ts:519`) — o Estoque ficou de fora.

**Reproduzido:** material com **10 un**, 5 saídas de 4 un em paralelo.
As 5 foram aceitas. Saldo final: **−10**.

```
estoque inicial ........ 10
5 × saída de 4 ......... todas HTTP 200
saldo final ............ -10.000   (esperado: 2, com 3 recusas)
```

Consequência: a gráfica vende material que não tem.

---

## 🔴 Bug 2 — Receber a mesma compra duas vezes triplica o estoque (crítico)

`receivePurchase` lê a compra, confere `status !== "recebido"` e só então
abre a transação. Três chamadas concorrentes passam juntas pela conferência.

**Reproduzido:** compra de **100 un**, 3 recebimentos simultâneos.

```
saldo ............... 300.000  (esperado 100)
movimentos de compra ....... 3  (esperado 1)
despesa no financeiro ...... 1  ✅ (upsertAutoTransaction protegeu)
```

O financeiro se defendeu; o estoque não. Note que o retorno
`alreadyReceived` existe justamente para este caso — mas nunca dispara,
porque a checagem acontece fora da transação.

---

## 🟠 Bug 3 — "Ajuste manual" soma em vez de ajustar

O enum aceita `entrada | saida | ajuste`, mas o cálculo só distingue dois:

```ts
const delta = d.kind === "saida" ? -d.quantity : d.quantity;
```

`ajuste` cai no `else` e **soma**. Na tela, o seletor mostra
"Entrada (+)", "Saída (−)" e "Ajuste manual" — sem sinal, sugerindo
"corrigir o saldo para este valor".

**Reproduzido:** saldo 10 + ajuste de 3 → **13**. Quem fez a contagem
física e digitou 3 esperava 3.

---

## 🟠 Bug 4 — Excluir movimento deixa saldo negativo sem aviso

`deleteStockMovement` reverte o delta sem verificar o resultado.

**Reproduzido:** entrada de 50 → saída de 50 (saldo 0) → excluir a
entrada → **saldo −50**. O material já foi consumido; apagar a entrada
que o originou deveria ser recusado.

---

## 🟠 Bug 5 — Movimenta produto que não controla estoque

Produto com `trackStock = false` (sob demanda, o padrão da casa) aceita
movimentação normalmente e passa a exibir saldo.

**Reproduzido:** produto `track_stock=false` + entrada de 5 →
`stock=5, track=false`. Saldo fantasma que nenhuma tela leva a sério.

---

## 🟡 Bug 6 — Cliente pode forjar `automatic: true`

`automatic` vem do corpo da requisição. A exclusão recusa movimentos
automáticos (proteção correta para venda/produção), então um movimento
manual marcado como automático **fica impossível de excluir pela
interface**.

**Reproduzido:** `POST {automatic: true}` → gravado; `delete` → 409
"Movimentação automática não pode ser excluída manualmente".

---

## 🟡 Bug 7 — `/api/purchases` sem validação vaza SQL no erro

`receivePurchase(Number(body.purchaseId))` — sem `purchaseId`, vira
`NaN`, a query quebra e o catch devolve **o SQL inteiro ao navegador**:

```
Failed query: select "id", "number", "supplier_id", ... from "purchases"
where "purchases"."id" = $1 limit $2
params: NaN,1
```

Mesma classe de problema já corrigida no PDV e em `/api/crud/customers`.
A rota também ignora `body.id`, aceitando só `purchaseId`.

---

## ✅ Verificado e correto

| Item | Situação |
|---|---|
| Validação de quantidade | `finite.positive()` — zero e negativo recusados |
| Alerta de estoque mínimo | `StockClient.tsx:56` + selo "repor agora" |
| Despesa da compra | `upsertAutoTransaction` idempotente por `purchaseId` |
| Proteção de movimento automático | correta na intenção (ver bug 6) |
| Compra cancelada | não pode ser recebida (409) |
| PDV | `assertStockLocked` com `FOR UPDATE` — **é a referência a seguir** |

---

## Plano de correção proposto

1. `FOR UPDATE` na leitura de material/produto em `createStockMovement`
2. `FOR UPDATE` na compra em `receivePurchase` + reconferir status dentro
   da transação (fazendo `alreadyReceived` funcionar de verdade)
3. `ajuste` passa a **definir** o saldo (delta = alvo − atual), com a UI
   explicando "Ajuste (=)"
4. Exclusão recusa (409) quando o saldo resultante for negativo
5. Movimento em produto com `trackStock = false` → 422 explicativo
6. `automatic` deixa de ser aceito do cliente
7. `/api/purchases` valida o id e para de vazar SQL

---

## Correções aplicadas (v3.24.0)

| # | Bug | Correção | Verificação |
|---|---|---|---|
| 1 | Saída simultânea furava o saldo | `FOR UPDATE` na leitura do item em `createStockMovement`; recusa 409 informando o saldo disponível | 5 saídas de 4 sobre saldo 10 → **2 aceitas, 3 recusadas, saldo 2** |
| 2 | Recebimento concorrente multiplicava o estoque | `FOR UPDATE` na compra + status reconferido **dentro** da transação (`receivePurchaseLocked`) | 3 recebimentos de 100 un → **saldo 100, 1 movimento, 1 despesa**; 2 respondem `alreadyReceived` |
| 3 | "Ajuste" somava em vez de ajustar | `delta = contado − atual`; UI passa a dizer "Ajuste — definir saldo (=)" e o campo vira "Saldo contado", mostrando o saldo atual | 10 → ajuste 3 = **3**; 3 → ajuste 25 = **25**; ajuste 0 zera |
| 4 | Excluir movimento deixava saldo negativo | reversão recusada com 409 quando o resultado seria negativo | entrada 50 + saída 50 → excluir entrada = **409, saldo intacto** |
| 5 | Movimentava produto sem controle de estoque | 422 com instrução ("Ative Controlar estoque no cadastro") | `trackStock=false` → **422**; `true` → funciona |
| 6 | Cliente forjava `automatic: true` | a flag só é aceita via `opts.allowAutomatic`, uso interno; pela API tudo é manual | enviado `automatic:true` → gravado **false**, exclusão liberada |
| 7 | `/api/purchases` vazava SQL | valida o id (aceita `purchaseId` **ou** `id`) e o catch devolve mensagem genérica | sem id → **422**; id inexistente → **404**; sem vazamento |

### Detalhes que mudaram de comportamento

- **`ajuste` agora define o saldo.** É a semântica de contagem física, que
  a tela já sugeria. Quem usava ajuste como "entrada extra" deve passar a
  usar Entrada.
- **Quantidade zero** é válida **apenas** em ajuste (a contagem não
  encontrou o item). Entrada e saída seguem exigindo valor positivo —
  garantido por `superRefine`, não pelo tipo do campo.
- **`StockRuleError`** carrega status HTTP e é lançada de dentro da
  transação: aborta o commit e vira resposta tratada, em vez de 500.

### Validação

- `typecheck`, `build`, `eslint` (4 arquivos) — limpos
- `e2e:smoke` — **135 checks** (eram 121). Os 14 novos disparam as
  chamadas **em paralelo**, reproduzindo a corrida real: sem as travas,
  eles falham
