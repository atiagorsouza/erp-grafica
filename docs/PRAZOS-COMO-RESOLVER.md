# Prazo de entrega: como eu resolveria

Você levantou o ponto certo na hora certa. Se o orçamento vai sair
automático com "3 dias úteis", esse número **precisa ser verdade** —
senão a automação passa a produzir promessa quebrada em escala.

Fui olhar o que existe. O sistema tem `machine_minutes` (tempo de
máquina, usado no **custo**) e `estimated_hours` nos serviços. **Não
existe nenhum campo de prazo de entrega.** São coisas diferentes:

> Uma peça 3D leva **6 horas de impressora** — mas o cliente recebe em
> **4 dias**, porque tem fila na frente, modelagem antes e cura depois.

Tempo de máquina é custo. Prazo é promessa.

---

## As três parcelas de um prazo

Todo trabalho tem no máximo três, e a maioria tem só uma:

```
   CRIAÇÃO          PRODUÇÃO          ACABAMENTO/CURA
   arte, modelagem  máquina rodando   secagem, montagem,
   aprovação                          verniz, corte manual
```

| Trabalho | Criação | Produção | Acabamento |
|---|---|---|---|
| 100 cartões, arte pronta | — | 1 dia | — |
| 100 cartões, criar arte | 2 dias | 1 dia | — |
| Banner lona | — | 1 dia | — |
| Peça 3D simples | — | 1 dia | 1 dia |
| Peça 3D com modelagem | 3 dias | 2 dias | 1 dia |
| Papelaria personalizada | 2 dias | 2 dias | 1 dia |
| Adesivo com recorte | — | 1 dia | 1 dia |

**O padrão:** o que faz o prazo estourar quase nunca é a máquina. É a
**criação** (depende do cliente aprovar) e o **acabamento** (depende do
tempo físico — cola seca, verniz cura).

---

## O que eu proponho

### 1 · Três campos por produto

No cadastro do produto, ao lado de `machine_minutes`:

```
Dias de criação     [ 0 ]   arte, modelagem — 0 se o cliente traz pronto
Dias de produção    [ 1 ]   máquina rodando
Dias de acabamento  [ 0 ]   cura, montagem, secagem
```

O prazo do produto é a soma. Simples de entender e de conferir.

### 2 · Prazo por quantidade

100 cartões e 5.000 cartões não levam o mesmo tempo. Uma faixa
opcional resolve:

```
até   500 unidades  →  1 dia de produção
até 2.000 unidades  →  2 dias
acima               →  4 dias
```

Só cadastra quem precisa. Sem faixa, vale o número fixo.

### 3 · O orçamento soma direito

Um orçamento com vários itens **não soma os prazos** — as coisas
acontecem em paralelo. Vale o item mais demorado:

```
100 cartões      → 1 dia
1 banner         → 1 dia
peça 3D          → 4 dias
                   ────────
prazo do pedido    4 dias      (não 6)
```

Exceto acabamento que trava tudo (encadernação depois de imprimir
capa e miolo) — isso é o **modo série**, marcável no produto.

### 4 · Dias úteis de verdade

"3 dias úteis" na sexta ≠ na segunda. Precisa de:

- Dias que a gráfica abre (seg–sex? sábado de manhã?)
- Feriados nacionais e do Rio
- Recesso, férias coletivas

Já existe uma tabela `commemorative_dates` no banco — dá para usar a
mesma estrutura para feriados.

### 5 · O relógio começa quando?

Este é o ponto que mais gera atrito com cliente:

```
Pedido aprovado 17h de sexta
   ↓
Cliente manda a arte segunda 14h
   ↓
Arte aprovada terça 10h
   ↓
   ← O PRAZO COMEÇA AQUI, não na sexta
```

Proponho que o prazo conte a partir da **aprovação da arte**, e que o
orçamento diga isso com todas as letras:

> *"3 dias úteis após aprovação da arte"*

Você já usa essa frase — é só o sistema respeitá-la de verdade.

### 6 · Corte do dia

Pedido aprovado às 17h30 não entra na produção de hoje. Um horário de
corte configurável (ex.: 15h) evita prometer o impossível:

```
aprovado 14h  → conta a partir de hoje
aprovado 17h  → conta a partir de amanhã
```

---

## Como fica no orçamento

Em vez de um número solto, o cliente vê a conta:

```
┌──────────────────────────────────────────────┐
│  Prazo de entrega                            │
│                                              │
│  Criação da arte           2 dias úteis      │
│  Produção                  1 dia útil        │
│  ─────────────────────────────────────       │
│  Previsão de entrega       sexta, 22/08      │
│                                              │
│  O prazo começa após a aprovação da arte.    │
└──────────────────────────────────────────────┘
```

Data concreta, não "3 dias úteis" que o cliente conta errado. E deixa
claro que a bola está com ele na etapa da arte.

---

## Onde isso aparece

| Lugar | O que muda |
|---|---|
| **Produto** | 3 campos de prazo + faixas opcionais |
| **Orçamento** | calcula a data e mostra a conta |
| **Pedido** | data prometida gravada; se atrasar, alerta |
| **Kanban** | cartões ordenados por urgência real |
| **Painel** | expediente, feriados, horário de corte |
| **WhatsApp** | "Previsão: sexta, 22/08" nos avisos |

---

## O que NÃO vou fazer

**Não vou tentar adivinhar sua capacidade.** Um sistema que promete
"entrego terça" precisa saber quantos trabalhos já estão na fila,
quantas horas de máquina cada um consome e o que pode rodar em
paralelo. Isso é escalonamento de produção — projeto grande, e que
erra feio quando os dados de entrada não são perfeitos.

**O que faço agora:** prazo por produto, somado corretamente, em dias
úteis, contado da aprovação da arte. Cobre 90% dos casos.

**Depois, se fizer falta:** um alerta simples de sobrecarga — "você já
tem 8 trabalhos para sexta, tem certeza?". Sem prometer nada
automaticamente.

---

## Suas duas outras decisões — anotadas

**Cadastro sempre obrigatório** ✔
O botão de enviar orçamento vai **bloquear** se o cadastro estiver
incompleto, mostrando o que falta e oferecendo mandar o link na hora.

**Aprovação: os dois** ✔
O clique no link registra data, hora e IP — vale como aceite formal.
E o bot manda a confirmação por WhatsApp, ficando registrado na
conversa. Cinto e suspensório: prova técnica e rastro humano.

---

## O que preciso de você

Para os prazos saírem certos, me diga:

**1. Expediente:** que dias e horários a gráfica trabalha? Sábado?

**2. Horário de corte:** depois de que horas um pedido aprovado já
conta para o dia seguinte?

**3. Prazos reais** dos trabalhos que você mais faz. Por exemplo:

| Trabalho | Criação | Produção | Acabamento |
|---|---|---|---|
| Cartão de visita (arte pronta) | | | |
| Cartão (você cria a arte) | | | |
| Banner / lona | | | |
| Adesivo com recorte | | | |
| Peça 3D pequena | | | |
| Peça 3D com modelagem | | | |
| Papelaria personalizada | | | |
| Agenda / encadernado | | | |

Pode responder por cima — depois ajustamos no uso. **Um número
aproximado que você cumpre vale mais que um exato que você não
cumpre.**

**4. Quando você cria a arte, quanto tempo costuma levar até mandar a
primeira versão para o cliente?** É o número que mais some nos
orçamentos e o que mais irrita quando estoura.
