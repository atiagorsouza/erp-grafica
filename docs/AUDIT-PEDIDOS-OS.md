# Auditoria — Pedidos & OS

Data: 2026-08-17 · Versão auditada: v3.18.0
Arquivos: `src/lib/orders.ts`, `src/app/api/crud/orders/route.ts`,
`src/components/modules/OrdersClient.tsx`

Todos os problemas abaixo foram **reproduzidos** contra o sistema rodando.

---

## 🔴 1. Pedido de R$ 0,00 vira receita no Financeiro

`createOrder` não valida o total. Desconto maior que o subtotal zera o pedido,
e o zero segue para o Financeiro:

```
POST /api/crud/orders { items:[{unitPrice:100}], discount:99999 }
  → PED-2026-0022 aceito, total 0.0000

SELECT * FROM transactions WHERE order_id = <esse pedido>
  → receita | pedido | 0.00 | pendente
```

Quantidade `0,0001` produz o mesmo efeito por outro caminho
(`PED-2026-0023`, total 0.0000).

Mesmo buraco fechado no PDV (v3.14.0) e no Orçamento (v3.16.0) — Pedidos era
a última porta aberta. Não há teto de desconto nem quantidade mínima.

## 🔴 2. Status inventado é gravado e some da gestão

Os cinco campos de status (`status`, `productionStatus`, `artStatus`,
`deliveryStatus`, `financialStatus`) são `text` livre no banco e não têm
validação no Zod:

```
PATCH { status:"banana", productionStatus:"voando", financialStatus:"xyz" }
  → aceito. No banco: status=banana prod=voando fin=xyz
```

**Consequência prática:** as abas da tela de Pedidos filtram por valor exato
(`productionStatus === "aguardando" | "em_producao" | "concluido"`). Um pedido
com status fora da lista **não aparece em nenhuma aba** — some da gestão,
apesar de existir, ter card no Kanban e lançamento no Financeiro.

Um erro de digitação numa integração ou num script basta para "perder" um
pedido em produção.

## 🟠 3. Data de entrega no passado é aceita

`dueDate: "2020-01-01"` é gravado sem aviso, e vira prazo do card no Kanban e
da entrega. Mesmo problema já corrigido na validade do Orçamento.

## 🟠 4. Erro do módulo vaza mensagem crua

`/api/crud/orders` devolve `e.message` no catch — o mesmo padrão já corrigido
no PDV, no caixa, no orçamento e no CRM. Pode expor SQL ao navegador.

## ✅ Saudável — cancelamento

Testado e correto, vale registrar:

- estorna a receita com `estorno_pedido` e mantém a original (rastreável);
- **idempotente**: segundo cancelamento responde 409 "Pedido já está
  cancelado", sem duplicar estorno;
- **resiste à corrida**: 5 cancelamentos paralelos → 1 estorno;
- pedido cancelado não volta por edição simples (409).

---

## Correções aplicadas na v3.19.0

1. Guarda de total (`total <= 0` → 422), teto de 100% no desconto, desconto
   não maior que o subtotal e quantidade mínima de 0,001.
2. Enums Zod nos cinco campos de status, com mensagem listando os valores
   aceitos.
3. `dueDate` no passado recusado com 422.
4. Catch genérico, sem vazar SQL.

## Fora de escopo (observado, não corrigido)

- **Sem máquina de estados completa.** Impedimos valores inválidos, mas não
  transições ilógicas entre valores válidos (ex.: "concluído" → "aguardando").
  Exigiria mapa de transições permitidas e decisão de negócio sobre quais
  fazem sentido.
- **Baixa de estoque na produção.** O pedido não consome material ao entrar em
  produção; só a venda do PDV movimenta estoque. Pode ser intencional.
- **`orders.items` é jsonb**, sem tabela de itens como em `quote_items`.
  Funciona, mas impede consultas por produto vendido em pedidos.
