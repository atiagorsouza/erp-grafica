# Auditoria — Tabelas de Preços (v3.41.0)

Módulo: DTF UV, DTF Têxtil, Lona e Adesivo Vinil — preços de
terceirizados e grande formato, independentes do parque de impressoras.

---

## 🟢 O que está correto

Validações de entrada sólidas, todas verificadas:

| Teste | Resultado |
|---|---|
| Preço negativo | 400 ✔ |
| Lona (m²) sem dimensão | 422 ✔ |
| Descrição duplicada no mesmo tipo | 409 ✔ |
| Normalização de unidade (lona/adesivo → m²) | ✔ |

Arquivamento em vez de exclusão preserva histórico.

---

## 🔴 #1 — A tabela não vira preço em lugar nenhum (ARQUITETURAL)

`estimatePricingTableCost()` está implementada e **nunca é chamada**.
Grep no projeto: aparece só na própria definição.

Consequência: a tela é uma **planilha de consulta visual**. Você
cadastra "DTF UV A4 = R$ 12" e, para vender, digita R$ 12 na mão no PDV
ou no orçamento. Nada liga a tabela à venda:

| Consumidor | Usa a tabela? |
|---|---|
| `products.ts` | ❌ |
| `sales.ts` (PDV) | ❌ |
| `quotes.ts` | ❌ |
| `orders.ts` | ❌ |
| `services.ts` | ❌ |

`ProductsClient` chega a **receber** `pricingTables` como prop e não a
utiliza — vestígio de uma integração planejada e não concluída.

**Não corrigido nesta rodada:** exige decisão de produto (a linha é
custo ou preço de venda? entra como insumo ou como item vendável?). As
perguntas foram feitas ao usuário e ficaram sem resposta; implementar
sem isso seria adivinhar a regra de negócio.

---

## ✅ #2 — Duas portas de gravação (CORRIGIDO)

`production-catalog.ts` tinha uma segunda `savePricingTable` gravando
direto na mesma tabela, **sem** as validações do módulo oficial:

| | `pricing-tables.ts` | `production-catalog.ts` |
|---|---|---|
| Dimensão obrigatória em m² | ✅ | ❌ |
| Duplicata | ✅ 409 | ❌ |
| Normaliza unidade | ✅ | ❌ (texto livre) |

Não estava plugada em rota, mas estava exportada — qualquer import novo
furaria as três regras, gravando lona sem dimensão (cálculo de m² com
área zero).

Substituída por re-export do módulo validado: **uma porta só**.

---

## ✅ #3 — `estimatePricingTableCost` ignorava a quantidade em m² (CORRIGIDO)

```js
const q = Math.max(quantity, minQty);   // calculado...
if (unit === "m2") { /* ...e nunca usado */ }
```

Em m² a função devolvia o valor de UMA peça: **10 lonas de 1 m² custavam
o mesmo que 1**. Dormente porque a função nunca roda — mas é a única
porta para plugar a tabela no orçamento, então seria o primeiro erro a
aparecer no dia em que #1 fosse resolvido.

A conta agora separa os dois eixos corretamente:

```
área da peça = largura × altura ÷ 10.000
área faturável = max(área, minQty)   ← mínimo POR PEÇA
total = área faturável × preço/m² × quantidade
```

Verificação:

| Caso | Antes | Agora |
|---|---|---|
| 1 lona 1×1 m | R$ 45 | R$ 45 |
| 10 lonas 1×1 m | R$ 45 ❌ | **R$ 450** ✔ |
| 5 lonas 2×3 m | R$ 270 ❌ | **R$ 1.350** ✔ |
| 1 lona 50×50 cm | R$ 45 | R$ 45 (mínimo 1 m²) ✔ |
| 0 peças | R$ 45 ❌ | **R$ 0** ✔ |

O caso "0 peças" apareceu durante o teste: em unidade/metro o `minQty`
era aplicado mesmo com quantidade zero, então uma linha removida do
orçamento continuaria cobrando o mínimo. Corrigido junto.

---

## 🟡 #4 — Sem faixa por volume (não corrigido)

A própria tela promete *"preços de terceiros com desconto por volume —
use uma linha por faixa"*. Hoje isso significa criar "DTF UV A4",
"DTF UV A4 10+", "DTF UV A4 50+" como linhas independentes, e o sistema
não sabe que são o mesmo item.

Já existe solução pronta no projeto: `product_price_tiers` +
`resolvePriceTier` (v3.34.0). Aplicar aqui é reaproveitar o padrão —
mas depende da decisão de #1, porque faixa só faz sentido se a tabela
gerar preço.

---

## Validação

`typecheck` ✔ · `build` ✔ · `e2e:smoke` **179** ✔ ·
`/tabelas-precos` 200 ✔ · validações de entrada reconferidas após a
mudança ✔

## Pendente de decisão do usuário

1. A linha é **custo** (aplicar margem) ou **preço de venda** já pronto?
2. Deve ser **vendável direto** no PDV/orçamento, ou virar **insumo de
   produto**?
3. Quer **faixa por quantidade** como nos produtos?

Sem isso, #1 e #4 ficam abertos.
