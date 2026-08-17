# Auditoria — Kanban de Produção

Data: 2026-08-17 · Versão auditada: v3.19.0
Arquivos: `src/lib/kanban.ts`, `src/app/api/crud/kanban/route.ts`,
`src/components/modules/KanbanClient.tsx`

Todos os problemas foram **reproduzidos** contra o sistema rodando.

---

## 🔴 1. `reorder` burla as travas de negócio

`updateKanbanCard` tem uma trava importante: card ligado a um Pedido não pode
ir para "cancelado" pelo quadro, porque cancelamento exige motivo e estorno
formal em Pedidos & OS.

`reorderKanban` altera **a mesma coluna** sem passar por nenhuma dessas
regras:

```
via update   → 409 "Cancele pedidos vinculados em Pedidos & OS..."
via reorder  → {"ok":true}  ← card cancelado, pedido intacto
```

A trava existe, mas há uma porta ao lado dela.

## 🔴 2. `reorder` não sincroniza o Pedido vinculado

`updateKanbanCard` chama `syncOrderFromCard`, que traduz a coluna do card em
status do pedido (`pronto` → produção concluída, `entregue` → entrega
concluída). O `reorderKanban` **não chama nada disso**:

```
card 8 (pedido 10) movido para "pronto" via reorder
  → card:   column = pronto
  → pedido: production_status = aguardando   ← não mudou
```

Kanban e Pedidos passam a contar histórias diferentes: o quadro diz que está
pronto, a tela de Pedidos diz que nem começou. Como o `reorder` é justamente a
operação de arrastar, esse é o caminho natural de uso.

## 🟠 3. `reorder` move card entre colunas sem querer

A função aplica `column` a **todos** os ids recebidos, sem conferir se eles
pertencem àquela coluna:

```
card 21 estava em "cancelado"
POST { op:"reorder", column:"backlog", ids:[21] }
  → card 21 agora está em "backlog"
```

Uma requisição de "reordenar backlog" que inclua por engano o id de outro
card o traz para o backlog silenciosamente.

## 🟠 4. Ordenação nunca foi ligada

O campo `order` existe no banco, o endpoint `reorder` existe e funciona — mas
**a tela nunca o chama**. Arrastar só move entre colunas; a posição dentro da
coluna não é ajustável e todos os cards ficam com `order = 0`:

```
SELECT id, "order" FROM kanban_cards  →  todos com 0
```

Na prática, não há como priorizar a fila de produção: o card urgente fica na
mesma altura do resto, e a ordem exibida depende do critério de leitura.

## 🟠 5. Prazo no passado é aceito

`dueDate: "2020-01-01"` entra sem aviso — mesma correção já aplicada em
Orçamentos (v3.16.0) e Pedidos (v3.19.0).

## 🟡 6. `quoteId` sem chave estrangeira

`orderId` e `customerId` têm FK com `on delete cascade`/`set null`;
`quoteId` é um `integer` solto. Hoje não há órfãos na base, mas nada impede
que existam — o orçamento pode ser removido e o card permanece apontando para
um id inexistente.

## ✅ Saudável

- Coluna inválida é recusada (enum no Zod).
- Prioridade é enum.
- Card vinculado a Pedido não pode ser excluído pelo quadro (409).
- Não há cards órfãos na base atual.

---

## Correções aplicadas na v3.20.0

1. `reorderKanban` passa a respeitar a trava de cancelamento.
2. `reorder` sincroniza o Pedido vinculado quando o card muda de coluna.
3. `reorder` só aceita cards que já estão na coluna informada, ou explicita a
   movimentação — não move mais por acidente.
4. Ordenação por arrastar ligada na tela (posição dentro da coluna).
5. `dueDate` no passado recusado.
6. FK em `quoteId` com `on delete set null`.

## Fora de escopo

- **Sem trava de concorrência no `reorder`.** Dois usuários reordenando a
  mesma coluna ao mesmo tempo: vence o último. Não corrompe dado (a
  transação é atômica), apenas descarta a ordenação do outro. Resolver exigiria
  versionamento otimista por coluna.
- **Limite de WIP por coluna** (quantos cards cabem em "Em produção") — comum
  em quadros Kanban, não existe aqui.
