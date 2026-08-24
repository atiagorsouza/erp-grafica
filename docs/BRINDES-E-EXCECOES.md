# Brindes, entrega e exceções

Você me deu três coisas. Vou responder as três e **parar de perguntar**
— tem informação suficiente para trabalhar.

---

## 1 · Exceção não é bug, é regra com escape

> *"Na regra tem sua exceção, nós sempre usamos de boa fé quando o
> cliente entende. Posso atender pessoalmente quem já me conhece."*

Isso muda como eu construo. Um sistema que **impede** o atendente vira
inimigo do trabalho — e o jeito de contornar acaba sendo cadastro falso,
que é pior que nenhum.

**Como faço:** trava com escape registrado.

```
⚠ Cadastro incompleto — falta CPF e CEP

  [ Pedir cadastro por WhatsApp ]     ← caminho normal
  [ Seguir assim mesmo ]              ← exceção, pede o motivo
```

Clicou em seguir, o sistema pergunta por quê ("cliente antigo",
"venda rápida", "presencial") e grava. O pedido sai com uma marca
discreta.

Você ganha duas coisas: **atende quem precisa ser atendido** e, no fim
do mês, **vê quantas exceções abriu e para quem**. Se um cliente aparece
toda semana como exceção, ou ele completa o cadastro ou virou política.

Mesma lógica para o desconto PIX: some quando o cadastro está
incompleto, mas dá para liberar na mão com motivo.

---

## 2 · Entrega: o SuperFrete faz sentido, e não é para tudo

Você já respondeu certo:

| Situação | Como sai |
|---|---|
| Mesmo município, item pequeno | Motoboy/Uber/99 — **cliente paga direto pelo app** |
| Fora do município ou estado | **Correios/transportadora** — SuperFrete cota |
| Volumoso (200 copos) | **Transportadora** — não vai de motoboy |
| Cliente busca | Retirada agendada |

O que muda no orçamento: o campo de entrega precisa dessas quatro
opções, e **só chama o SuperFrete nas duas do meio**. Nas outras, frete
é zero (ou combinado), porque o custo não é seu.

**Detalhe que importa:** o SuperFrete precisa de peso e dimensões. Os
produtos já têm `ship_weight`, `ship_height`, `ship_width`,
`ship_length` — mas provavelmente estão em branco. Sem isso a cotação
vem errada, e errada para menos é você pagando a diferença.

Para os poucos produtos que saem por transportadora, vale preencher.

---

## 3 · Brindes com transfer laser — e a boa notícia

> *"Uso uma máquina com transfer a laser da Konica... ainda não decidi
> a categoria nem como coloco na precificação."*

**Não precisa de máquina nova no sistema. A Konica já está lá.**

O transfer não é outra impressora — é a **mesma Konica** imprimindo em
**papel diferente**, mais uma **prensa** depois. O motor já sabe fazer
isso:

```
Produto "Eco copo personalizado"
├── impressão   Konica · formato transfer · cobertura 50%
├── material    Papel transfer laser A4      (R$ 3,50/folha)
├── material    Eco copo em branco           (R$ 2,80/un)
└── serviço     Prensa térmica               (0,5 min/peça)
```

### Rodei a conta para 200 eco copos

| Item | Custo |
|---|---|
| Impressão (34 folhas, 6 por folha) | R$ 13,97 |
| Papel transfer | R$ 119,00 |
| Prensa (mão de obra) | R$ 4,17 |
| **Copos em branco** | **R$ 560,00** |
| **Total** | **R$ 697,14** |

**A impressão é 2% do custo. O copo é 85%.**

Isso responde sua dúvida de categoria: **não importa muito.** Em brinde
personalizado, o motor de impressão quase não pesa — o que decide o
preço é o insumo e quantas peças cabem numa folha de transfer.

### O número que realmente importa

```
1 peça por folha  →  R$ 3,93 de custo de estampa
4 peças por folha →  R$ 1,00
6 peças por folha →  R$ 0,67
```

**Seis vezes de diferença**, só por aproveitamento. É aqui que se ganha
ou se perde dinheiro em brinde — não na escolha da categoria.

Já existe `pieces_per_sheet` nos produtos. É exatamente esse campo.

### O que falta cadastrar

1. **Formato "Transfer A4"** na Konica (área 1, cobertura conforme a arte)
2. **Papel transfer laser** como material — preciso do seu custo por folha
3. **Prensa térmica** como serviço — tempo por peça
4. **Os brindes em branco** como materiais: copo, caneca, squeeze, chaveiro...

Preciso de você: **quanto custa a folha de transfer** e **os brindes em
branco** que você mais usa. Usei R$ 3,50 e R$ 2,80 de chute.

### Uma dúvida honesta sobre a Konica e o transfer

Transfer laser costuma exigir **temperatura de fusão diferente** e às
vezes desgasta mais o fusor. Se você percebe que a máquina sofre mais
imprimindo transfer, dá para cadastrar como **categoria separada** com
`fixedCostPerPage` maior — refletindo manutenção mais frequente.

Só você sabe se isso acontece na prática. Se não sente diferença, deixa
na mesma categoria e pronto.

---

## 4 · Pagamento 50/50 — decidido

> *"50% no ato e 50% na entrega, sendo PIX."*

Anotado assim:

| Forma | Como fica |
|---|---|
| **PIX / dinheiro** | 50% entrada + 50% na entrega |
| **Cartão de crédito** | 100% no ato (link de pagamento) |
| **Presencial** | antes de ir para execução |

E a regra que vem junto: **o pedido não entra em produção sem a
entrada**. O Kanban segura o card com um aviso, e o WhatsApp confirma
quando cai:

> *"Entrada de R$ 250,00 confirmada! Seu pedido entrou na fila 🎉"*

---

## O que eu vou fazer, na ordem

Sem mais perguntas — com o que tenho, dá para começar:

```
1. Corrigir o desconto PIX para 5%              (2 minutos)
2. Entrada/saldo 50-50 nos pedidos              ← o dinheiro
3. Prazo por produto (criação/produção/acabamento)
4. Página pública de cadastro + botão no CRM
5. Página do orçamento + enviar por WhatsApp
```

Os itens 2 e 3 são fundação — a página de orçamento precisa deles para
mostrar prazo e condição de pagamento corretos.

---

## Os números que ainda faltam

Não travam o começo. Quando tiver, me passa:

- **Validade do orçamento** — 7 dias? 15?
- **Prazos** por tipo de trabalho (pode ser por cima)
- **Custo da folha de transfer** e dos brindes em branco
- **Desconto** de primeira compra e de cliente recorrente

Enquanto isso eu uso valores padrão e deixo tudo configurável no
Painel — assim você ajusta depois sem precisar de mim.
