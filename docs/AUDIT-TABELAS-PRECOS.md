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

---

# Adendo — tabela ligada ao fluxo de venda (v3.42.0)

> "vendo direto no pdv.. mas tb componho produtos como caneca na uv e
> camisa textil."

Os dois usos ao mesmo tempo. Isso resolveu o desenho que estava travado
e fechou o #1 desta auditoria.

## A consequência: custo ≠ venda

Com **um** campo só, um dos dois usos estaria sempre errado:

- vender pelo custo = prejuízo
- compor produto pelo preço de venda = margem cobrada **duas vezes**

Por isso `pricing_tables` ganhou `sellPrice` ao lado de `unitCost`:

| Campo | Significado | Usado em |
|---|---|---|
| `unitCost` | o que você paga ao fornecedor | composição de produto |
| `sellPrice` | o que você cobra do cliente | venda direta no PDV |

`sellPrice = 0` significa **"só compõe"** — a linha não é vendável
avulsa. O PDV recusa com 422 e mensagem explícita.

## 1. Venda direta no PDV

`saleItemSchema` aceita `pricingTableId`. O preço é resolvido **no
servidor**, igual ao `productId`: o valor que vem do cliente é ignorado.

Verificado:

| Caso | Resultado |
|---|---|
| DTF UV A3 × 2 (venda R$ 39) | R$ 78,00 ✔ |
| Lona 440g 1 m² (venda R$ 89) | R$ 89,00 ✔ |
| UV caneca (`sellPrice` = 0) | **recusado 422** ✔ |
| Cliente forja `unitPrice: 1` | cobrou **R$ 39** ✔ |

## 2. Composição de produto

`products` ganhou `basePricingTableId` + `basePricingTableQty`. Entra
como linha no breakdown, pelo **custo**, e a margem do produto incide
por cima.

**Caneca UV 11oz**

| Componente | Valor |
|---|---|
| Blank (caixa 36 ÷ R$ 320) | R$ 8,89 |
| Tabela: UV caneca | R$ 3,50 |
| **Custo** | **R$ 12,39** |
| **Venda** (margem 55%) | **R$ 37,68** |

**Camiseta DTF têxtil, estampa 30×40**

| Componente | Valor |
|---|---|
| Blank camiseta (pct 10 ÷ R$ 220) | R$ 22,00 |
| Tabela: DTF têxtil, 0,40 m × R$ 38 | R$ 15,20 |
| **Custo** | **R$ 37,20** |
| **Venda** (margem 55%) | **R$ 113,14** |

## 🔴 Bug encontrado no teste: mínimo aplicado na composição

A camisa saiu primeiro a **R$ 182,48**: pedi 0,40 m de DTF têxtil e o
motor cobrou **1 metro inteiro**, porque aplicava o `minQty` da linha.

O `minQty` é o mínimo do **pedido ao fornecedor** — você não compra
0,40 m de bobina. Mas ao **compor um produto** a bobina é partilhada
entre várias peças: cada camisa consome sua fração real.

Distinção agora explícita no motor:

- **m²** → mínimo faturável **por peça** (lona de 30×30 cm paga 1 m²)
- **metro/unidade** → consumo real, sem mínimo

A camisa caiu de R$ 182,48 para **R$ 113,14** — 38% de diferença que
sairia direto do bolso do cliente.

## Validação

`typecheck` ✔ · `build` ✔ · `e2e:smoke` **179** ✔ ·
`/tabelas-precos`, `/produtos`, `/pdv`, `/impressoras`, `/estoque` → 200 ✔ ·
`lint` sem erros novos

## Restante

**#4 — faixa por quantidade nas tabelas** segue aberto. Agora que a
tabela gera preço, aplicar `product_price_tiers` aqui passou a fazer
sentido. Não implementado: você não respondeu se seus fornecedores dão
desconto por volume.
