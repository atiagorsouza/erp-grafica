# Suas políticas × o que o sistema faz hoje

Suas políticas são a melhor especificação que recebi até agora — são
regras que você **já pratica**, não suposição minha. Conferi cada uma
contra o sistema.

Achei **quatro divergências**. Duas são configuração errada, uma é
funcionalidade que falta, e uma é uma boa notícia.

---

## ⚠️ 1 · O desconto PIX está errado

Sua política:

> *"Em pagamento em PIX quando o cliente é cadastrado há desconto de
> **5%**"*

O sistema está configurado com **6,12%**.

De onde veio esse número: 6,12% é a **taxa da InfinitePay em 3×** —
alguém (eu, provavelmente) usou o custo do cartão como desconto do PIX.
A lógica não é absurda ("dou de desconto o que economizo em taxa"), mas
**não é a sua política**.

Diferença num pedido de R$ 500:

| | Desconto | Cliente paga |
|---|---|---|
| Sua política (5%) | R$ 25,00 | R$ 475,00 |
| Sistema hoje (6,12%) | R$ 30,60 | **R$ 469,40** |

**Você está dando R$ 5,60 a mais do que pretende, a cada R$ 500.** Em
100 pedidos assim, R$ 560 saindo sem intenção.

**Correção:** `pricing_pix_discount` = 5. Um clique no Painel — mas
precisava ser visto.

---

## ⚠️ 2 · O desconto está condicionado, o sistema não sabe disso

> *"Caso deseje o desconto é **imprescindível estar com o cadastro em
> dia**"*

Hoje o PDV aplica o desconto à vista para qualquer um, inclusive venda
sem cliente identificado.

**Proponho:** o desconto PIX só aparece quando há cliente vinculado
**com cadastro completo** (CPF/CNPJ, endereço). Se o cadastro estiver
incompleto, o sistema mostra:

```
Desconto PIX 5% indisponível — cadastro incompleto
Falta: CPF, CEP        [ Pedir cadastro por WhatsApp ]
```

Isso transforma sua política em incentivo automático: o cliente
completa o cadastro para ganhar o desconto, e você ganha a base
organizada. **Os dois lados querem a mesma coisa.**

---

## ✖ 3 · O 50/50 não existe no sistema

> *"Dinheiro ou PIX: **50% no ato do fechamento e 50% na entrega**.
> Cartão de crédito: valor integral."*

Esta é a lacuna real. As tabelas `orders` e `quotes` têm `total` e
`payment_method`, mas **nenhum campo de entrada, saldo ou status de
sinal**. Hoje é controle na cabeça.

O que falta:

```
Pedido #123 · R$ 500,00
├─ Entrada (50%)  R$ 250,00   ✓ pago em 19/08 via PIX
└─ Saldo   (50%)  R$ 250,00   ⏳ na entrega
```

Com isso vem de graça:

- O pedido **não entra em produção** enquanto a entrada não for paga
- Alerta de pedido pronto com saldo em aberto
- Relatório de quanto há para receber na entrega
- O WhatsApp avisa: *"Entrada confirmada! Seu pedido entrou na fila 🎉"*

**É o item que eu faria primeiro** dos quatro. Sem ele, dinheiro se
perde no esquecimento — e é o tipo de erro que só aparece no fim do mês.

---

## ✔ 4 · A boa notícia: "só atendemos online" simplifica tudo

> *"Todo nosso atendimento é feito Online, no momento não temos
> atendimento presencial."*

Isso muda o desenho para melhor:

- **O cadastro obrigatório deixa de ser atrito** — é o único jeito de
  você atender, e o cliente entende
- **O link de cadastro é o começo natural** de toda conversa
- **A página de orçamento não é conveniência, é o canal** — o cliente
  não vai ao balcão ver a prova
- **A entrega é sempre combinada** (motoboy/Uber/99 por conta dele, ou
  retirada agendada)

Sua política de entrega, aliás, é clara e me poupa trabalho: o sistema
não precisa calcular frete próprio. Precisa é avisar **"está pronto para
retirada"** e registrar como vai sair.

---

## O que suas políticas resolveram do desenho

Perguntas que eu tinha, agora respondidas:

| Dúvida | Sua política |
|---|---|
| Cadastro obrigatório? | **Sempre.** Sem exceção |
| Como cobrar arte? | R$ 80–140, informado no ato; grátis em alguns produtos |
| Formas de pagamento | PIX, cartão (link), presencial antes da execução |
| Parcelamento | Cartão integral; PIX/dinheiro 50/50 |
| Prazo | Informado no pedido, **só dias úteis seg–sex, sem feriado** |
| Validade do orçamento | *(não está na política — preciso saber)* |
| Descontos | Primeira compra e clientes; **não acumulativos** |

---

## Sobre a arte — um detalhe importante

> *"Em alguns produtos a arte é gratuita."*
> *"A cobrança da arte é de acordo com o pedido, R$ 80 a R$ 140."*

Isso pede um campo no produto:

```
Arte inclusa?     ( ) Sim, grátis
                  (•) Cobrada à parte
                  ( ) Cliente traz pronta
```

E no orçamento, a arte vira **linha separada** — não embutida no preço.
Duas razões práticas:

1. O cliente vê o que está pagando (e percebe o valor quando é grátis)
2. Quando ele traz a arte pronta, é só remover a linha

Isso conversa direto com o prazo: **arte cobrada = dias de criação no
prazo. Arte pronta = zero.** Os dois campos andam juntos.

---

## Ainda preciso de você

Suas políticas cobrem quase tudo. Faltam quatro números:

**1. Validade do orçamento** — 7 dias? 15? Depois de quanto tempo você
não garante mais o preço?

**2. Horário de corte** — pedido aprovado às 17h já conta para hoje ou
para amanhã?

**3. Percentual de desconto** de primeira compra e de cliente
recorrente. A política diz que existem e não acumulam, mas não diz
quanto.

**4. Os prazos** da tabela que mandei — mesmo por cima:

| Trabalho | Criação | Produção | Acabamento |
|---|---|---|---|
| Cartão (arte pronta) | | | |
| Cartão (você cria) | | | |
| Banner / lona | | | |
| Adesivo com recorte | | | |
| Peça 3D pequena | | | |
| Peça 3D com modelagem | | | |
| Papelaria personalizada | | | |

---

## Uma sugestão de brinde

Suas políticas estão bem escritas — dá para transformá-las em **página
pública** (`app.vtdigital.site/politicas`) e linkar no rodapé de todo
orçamento:

> *"Ao aprovar, você concorda com nossas condições de atendimento:
> app.vtdigital.site/politicas"*

Custa quase nada e resolve discussão futura: fica registrado que o
cliente teve acesso às regras no momento da aprovação. Com data e hora,
junto com o aceite.
