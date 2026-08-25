# Sondagem — Pedidos & OS · Clientes & CRM · Kanban

Data: 2026-08-17 · Versão: v3.17.1

Levantamento **de superfície** feito a pedido do usuário para priorizar a
próxima auditoria. Não é a auditoria completa: são sondagens rápidas nos
padrões que já se mostraram problemáticos nos módulos anteriores (total
zerado, corrida de concorrência, unicidade no banco).

---

## 🔴 Confirmado — Pedido aceita total R$ 0,00

Mesmo bug já corrigido no PDV (v3.14.0) e no Orçamento (v3.16.0). A porta do
Pedidos continua aberta:

```
POST /api/crud/orders { items:[{unitPrice:100}], discount:99999 }
  → PED-2026-0113 aceito, total 0.0000

SELECT * FROM transactions WHERE order_id = 113
  → receita | pedido | 0.00 | pendente
```

Uma receita de R$ 0,00 entra no Financeiro e no ticket médio dos Relatórios.
`src/lib/orders.ts` não tem a guarda `total <= 0` nem teto de desconto.

**Correção esperada:** mesma de `sales.ts`/`quotes.ts` — recusa 422, teto de
100% no desconto percentual, desconto não maior que o subtotal.

## 🟠 A investigar — `customers.document` sem índice único

Não existe índice único em `customers.document`:

```
SELECT indexdef FROM pg_indexes WHERE tablename='customers' AND indexdef ILIKE '%document%'
  → (vazio)
```

A validação de duplicata existe e funciona no caminho normal (`CRM`:
"Documento já cadastrado para Cliente Dup 1", 409), mas é um `SELECT` seguido
de `INSERT` — o mesmo padrão TOCTOU que gerou pedidos duplicados na v3.16.0.

Um teste com 5 cadastros paralelos do mesmo CNPJ resultou em 1 cliente, mas
**por timing**, não por garantia: sem constraint no banco, a corrida continua
possível. Cliente duplicado espalha histórico, financeiro e crédito entre dois
cadastros.

## ✅ Saudável — validação de documento no CRM

`src/lib/crm.ts` valida CPF/CNPJ com dígito verificador, e-mail e CEP antes de
gravar. Documento inválido é recusado com 422.

**Observação de usabilidade:** o campo `type` (pf/pj) tem default `pf`, então
um CNPJ enviado sem `type: "pj"` é validado como CPF e recusado com a mensagem
"CPF inválido" — confuso para quem digitou um CNPJ correto. Vale inferir o
tipo pela quantidade de dígitos (11 = CPF, 14 = CNPJ) em vez de confiar só no
seletor.

## ⏳ Não sondado ainda

- **Kanban** — a rota expõe `syncByQuote`, `syncByOrder`, `reorder`,
  `create`, `update`, `delete`. O `reorder` é o candidato natural a problema
  de concorrência (dois usuários arrastando cards ao mesmo tempo).
- **Pedidos** — transições de status (`status`, `productionStatus`,
  `artStatus`, `deliveryStatus`, `financialStatus`) são cinco campos livres
  em `text`, sem enum no banco e aparentemente sem máquina de estados. Um
  pedido pode ir de "cancelado" para "concluído"?
- **OS/Produção** — relação com estoque de materiais na baixa de produção.

---

## Ordem sugerida

1. **Pedidos & OS** — já tem um 🔴 confirmado, é o centro do fluxo e conecta
   Orçamento → Produção → Financeiro.
2. **Kanban** — menor, mas com concorrência real no `reorder`.
3. **Clientes & CRM** — o mais saudável dos três; principal item é o índice
   único e a inferência de tipo de documento.
