# Auditoria — Produtos, Serviços, Tabelas de Preço, Impressoras, Calendário

Os 6 módulos que ainda não tinham passado por auditoria. Com estes,
**todo o sistema foi auditado** (falta só autenticação, que o usuário
decidiu deixar por último).

Testes feitos no servidor rodando.

---

## 🟠 1. SKU e código de barras podem repetir — e o PDV vende o errado

Não existe índice único em `products.sku` nem em `products.barcode`.
Criei dois produtos com o mesmo código:

```
POST /api/crud/products  barcode 7891234567895  → criado id=39
POST /api/crud/products  barcode 7891234567895  → criado id=40
```

Os dois foram aceitos. O problema aparece no PDV (`PosClient.tsx:605`):

```ts
products.find((p) => String(p.barcode || "").toLowerCase() === term)
```

`find` devolve **o primeiro**. Ao bipar o código, o operador leva o
produto errado — com o preço errado — e nada avisa. O mesmo vale para a
busca por SKU.

É o tipo de erro que só aparece no fechamento do caixa, quando já não dá
para saber o que foi vendido.

**Correção proposta:** índice único parcial (ignorando nulos e vazios,
como já foi feito em `customers.document`) e 409 tratado na rota.

---

## 🟡 2. Consumível sem rendimento zera o custo de impressão em silêncio

```ts
const yieldPages = num(c.yieldPages, 0);
if (yieldPages <= 0) return 0;      // custo do toner some
```

A divisão está protegida — bom. Mas um toner de R$ 400 com rendimento
não preenchido passa a custar **zero** no cálculo, e o produto sai barato
demais sem nenhum aviso.

`getPrinterEngineHealth()` já conta esses casos
(`consumablesWithoutYield`), então o dado existe; falta ele impedir ou
alertar no momento do cálculo, não só num painel de saúde.

> Hoje a base tem 0 consumíveis cadastrados (banco recriado), então o
> impacto é potencial, não atual.

---

## ✅ Verificado e correto

| Módulo | Item | Situação |
|---|---|---|
| **Produtos** | validação de entrada | limites coerentes em todos os numéricos; `piecesPerSheet` com mínimo 0.0001 evita divisão por zero |
| **Produtos** | FKs | 6 chaves com `on delete set null` — não quebram |
| **Produtos** | exclusão de material em uso | é **arquivamento** (`ARQUIVADO:` nas notas), preserva histórico e o vínculo do produto |
| **Produtos** | preço ≤ custo | nenhum dos 17 produtos |
| **Serviços** | schema | `baseCost` não aceita negativo, nome mínimo 2 caracteres, schema separado para update parcial |
| **Tabelas de preço** | faixas | modelo é por quantidade mínima, sem min/max — **não há risco de faixas sobrepostas** |
| **Tabelas de preço** | área mínima | `Math.max(areaM2, minQty)` cobra o mínimo corretamente |
| **Calendário** | data inválida | 30 e 31 de fevereiro recusados com 422 "Data inválida para o mês informado" |
| **Impressoras** | divisão por rendimento | protegida (ver achado 2) |
| **Impressoras** | health check | `getPrinterEngineHealth()` já reporta órfãos e consumíveis sem rendimento |

---

## Correção aplicada nesta rodada

### `roundCommercialPrice` — lixo de ponto flutuante (achado 4 do motor)

Era o único item do motor que não dependia de decisão comercial.

```
antes:  round(1.15, 0.1)   → 1.2000000000000002
        round(166.67, 0.01) → 166.67000000000002
agora:  1.2  e  166.67
```

A conta passou a ser feita em **centavos inteiros**. O comportamento
comercial é idêntico (sempre arredonda para cima no degrau): 10 casos de
teste conferidos, incluindo degraus de 0,05 / 0,10 / 0,50, valor zero e
negativo.

O banco já escapava por causa do `round2` na gravação, mas o número sujo
circulava no `unitPrice` e no detalhamento mostrado ao cliente.

---

## Ainda aguardando decisão comercial

Os achados 1, 2 e 3 de `AUDIT-MOTOR-PRECIFICACAO.md` continuam abertos —
mudam o preço de venda de todos os produtos:

1. modo unitário entrega 39,27% quando pedem 40%
2. modo unitário e modo tiragem divergem 10,3% no mesmo produto
3. perda e acerto de máquina não somam (263 folhas cobradas vs 273 usadas)

---

## Correções aplicadas (v3.26.0)

| # | Achado | Correção | Verificação |
|---|---|---|---|
| 1 | SKU/barcode duplicados | índices únicos parciais `products_sku_unique_idx` e `products_barcode_unique_idx` (ignoram nulos e vazios) + 409 com mensagem própria na rota | duplicado → **409 "Já existe um produto com este SKU"**; dois produtos sem código convivem |
| 4 do motor | `roundCommercialPrice` com dízima binária | conta em centavos inteiros | `round(1.15, 0.1)` → **1.2**; 10 casos conferidos |

### Detalhe que o teste revelou

A primeira versão do tratamento não pegava o nome do índice: o Drizzle
**embrulha** o erro do driver, e `products_sku_unique_idx` aparece em
`cause.constraint`, não em `e.message`. Sem isso a resposta caía na
mensagem genérica — bloqueava, mas sem dizer o motivo. Agora o catch
procura nos três lugares.

### Validação

- `typecheck`, `build`, `eslint` — limpos
- `e2e:smoke` — **150 checks** (eram 140). Os 10 novos cobrem SKU e
  barcode duplicados, produtos sem código, não vazamento de SQL,
  arredondamento comercial e a validação do calendário
