# Auditoria — Módulo Orçamentos

Data: 2026-08-17 · Versão auditada: v3.15.0
Arquivos: `src/lib/quotes.ts`, `src/app/api/crud/quotes/route.ts`,
`src/app/api/orders/convert/route.ts`, `src/components/modules/QuotesClient.tsx`

Todos os problemas abaixo foram **reproduzidos** contra o sistema rodando,
não apenas identificados por leitura de código.

---

## 🔴 1. Um orçamento vira vários pedidos (crítico)

`POST /api/orders/convert` verifica se já existe pedido com um `SELECT` e
insere logo depois. Entre as duas operações não há trava nem constraint —
o mesmo TOCTOU corrigido no PDV na v3.14.0.

`orders.quote_id` **não tem índice único**:

```
CREATE UNIQUE INDEX orders_pkey        ON orders (id)
CREATE UNIQUE INDEX orders_number_unique ON orders (number)
-- nada em quote_id
```

**Reprodução** — 5 conversões paralelas do orçamento 19:

```
resposta 1  PED-2026-0040  existing:false
resposta 2  PED-2026-0040  existing:true
resposta 3  PED-2026-0040  existing:true
resposta 4  PED-2026-0041  existing:false   ← duplicou
resposta 5  PED-2026-0042  existing:false   ← duplicou

SELECT count(*) FROM orders WHERE quote_id=19  →  3
```

**Impacto:** duplo-clique no botão "Converter em Pedido" — ou dois
atendentes na mesma proposta — gera OS repetida, produção duplicada e
receita contada 2× no Financeiro. Muito mais fácil de disparar que a corrida
do PDV: basta a impaciência de um clique duplo.

---

## 🔴 2. Orçamento de R$ 0,00 vira pedido e receita zerada

Não há validação de total mínimo. Um desconto maior que o subtotal zera a
proposta, e o zero se propaga por toda a cadeia.

**Reprodução:**

```
POST /api/crud/quotes  { items:[{unitPrice:100}], discount:99999 }
  → ORC-2026-0020 aceito, total = 0.0000, desconto = 100.0000

aprovar → converter
  → PED-2026-0043, total 0.0000, financialStatus "pago"

SELECT * FROM transactions WHERE order_id = <esse pedido>
  → receita | pedido | 0.00 | pago | "Pedido PED-2026-0043"
```

Uma receita de R$ 0,00 **marcada como paga** entra no Financeiro e no ticket
médio dos Relatórios. Corrigi exatamente isso no PDV na v3.14.0 — a porta do
orçamento continuou aberta.

## 🟠 3. Desconto percentual acima de 100%

`discountMode: "percent"` aceita qualquer número. Com `discount: 500` o
sistema calcula 500% de desconto e grava total zerado (ORC-2026-0021). Não há
teto de 100%, nem no schema Zod nem em `applyDiscount`.

## 🟠 4. Validade no passado é aceita sem aviso

`validUntil: "2020-01-01"` é gravado normalmente e o orçamento nasce como
`rascunho` — não como expirado. O vendedor pode enviar ao cliente uma
proposta vencida há anos sem nenhum alerta.

## 🟠 5. Orçamento aprovado pode ser alterado por baixo

A trava de edição só existe quando já há **pedido** convertido. Enquanto o
orçamento está `aprovado` mas ainda não virou OS, itens e valores podem ser
trocados livremente:

```
ORC-2026-0024 aprovado com total 5000,00
PATCH items → [{ unitPrice: 10 }]
  → aceito: novo total 10,00
  → card do Kanban atualizado para 10,00
```

O cliente aprovou R$ 5.000 e a proposta vira R$ 10 sem deixar rastro no
histórico. Um orçamento aprovado é um acordo comercial: alterar valor deveria
exigir reabertura explícita (voltar para `rascunho`) ou versionamento.

## 🟠 6. Preço não é revalidado contra o catálogo

No PDV, `createSale` recalcula o preço de cada item pelo cadastro do produto
— foi por isso que meu teste de split "falhou" com `líquido 0.27`. O
orçamento **confia no `unitPrice` que vem do navegador**:

```
POST { items:[{ productId:1, unitPrice: 0.01 }] }
  → gravado 0.01   (catálogo: 0.27)
```

Divergência de comportamento entre dois módulos que deveriam seguir a mesma
regra. Aqui é menos grave que no PDV (orçamento é negociação, e desconto
manual é legítimo), mas hoje não há **nenhum** registro de que o preço saiu
do catálogo — nem aviso, nem campo de preço tabelado para comparação.

## 🟡 7. Expiração só acontece no install/update

`repairExpiredQuotes()` existe em `src/lib/quotes.ts` e o
`scripts/repair-quotes.mjs` está registrado em `install.sh:119` e
`update.sh:138` — mas **nada expira orçamento em tempo de execução**. A
página `/orcamentos` não chama a rotina.

Em produção, entre um deploy e outro, um orçamento vencido continua exibido
como "enviado" indefinidamente. O funil dos Relatórios fica otimista: contam
como propostas em aberto coisas que já venceram.

---

## Fora de escopo (observado, não corrigido nesta rodada)

- **Sem histórico de versões da proposta.** Reenviar um orçamento revisado
  sobrescreve o anterior; não há como mostrar ao cliente o que mudou.
- **`archiveQuote` sempre grava status `recusado`.** Arquivar e recusar são
  eventos comerciais diferentes e ficam indistinguíveis no funil.
- **A página carrega `quote_items` inteira** (`db.select().from(quoteItems)`)
  e filtra no cliente. Funciona hoje; degrada com o volume.
