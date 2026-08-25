# Auditoria — PDV e Caixa

O PDV recebeu correções pontuais em várias rodadas (v3.14, v3.28), mas
nunca passou por uma varredura completa. Esta cobre o caixa, que é a
parte que move dinheiro físico.

Testes feitos no servidor rodando.

---

## 🔴 1. Sangria concorrente esvaziava a gaveta além do saldo

`expectedInDrawer` era calculado **fora** da transação. Cinco pedidos
simultâneos liam o mesmo saldo e todos passavam na validação.

**Reproduzido:** caixa aberto com R$ 100, 5 sangrias de R$ 40 em paralelo:

```
aceitas ................. 4 de 5
total sangrado .......... R$ 160,00   (gaveta tinha 100)
esperado em gaveta ...... -R$ 59,99
despesa no Financeiro ... R$ 160,00   (dinheiro que nunca existiu)
```

Além do descontrole do caixa, o Financeiro recebia despesas falsas — o
resultado do mês ficava R$ 60 menor do que a realidade.

**Correção:** `expectedInDrawer` passou a aceitar a `tx`, e a conferência
acontece dentro da transação, sobre a sessão travada com `FOR UPDATE`.
Mesmo padrão já aplicado no Estoque (v3.24.0) e no PDV (`assertStockLocked`).

**Depois:** 2 aceitas, 3 recusadas com o saldo disponível na mensagem,
gaveta em R$ 20.

---

## 🟠 2. Fechamento aceitava valor negativo em silêncio

`toPositive(-500)` devolve `0`. O caixa fechava com R$ 0,00 contados e
registrava uma quebra de R$ 20 que era, na verdade, erro de digitação.

**Correção:** valor negativo ou não numérico → 422 pedindo correção.

---

## ✅ Verificado e correto

| Item | Situação |
|---|---|
| Abertura simultânea | índice `cash_sessions_one_open_idx` + tratamento 409 devolvendo a sessão vencedora |
| Operação sem caixa aberto | 409 "Nenhum caixa aberto" |
| Sangria/suprimento no Financeiro | `upsertAutoTransaction` cria a contrapartida |
| Quebra/sobra no fechamento | vira lançamento automático |
| Venda com carrinho vazio | 422 pelo schema |
| Venda com quantidade negativa | 422 pelo schema |
| `unitPrice` do cliente | ignorado — `createSale` recalcula pelo catálogo |
| Cancelamento de venda | devolve estoque e é idempotente (409 no segundo) |
| Estoque na venda | `assertStockLocked` com `FOR UPDATE` (v3.14) |
| Desconto à vista / parcelamento | v3.28.0, com troco corrigido |

---

## Correções aplicadas (v3.29.0)

| # | Bug | Correção | Verificação |
|---|---|---|---|
| 1 | Sangria concorrente furava a gaveta | `FOR UPDATE` na sessão + saldo conferido dentro da transação | 5×R$40 sobre R$100 → **2 aceitas, gaveta R$ 20** |
| 2 | Fechamento com valor negativo | 422 explicativo | `-500` → recusado; `20` → aceito |

### Validação

- `typecheck`, `build`, `eslint` — limpos
- `e2e:smoke` — **179 checks** (eram 173). Os 6 novos disparam as
  sangrias em paralelo: sem a trava, falham
