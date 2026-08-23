# Teste de capacidade — Cartela de Adesivos 40×15 mm

Produto criado para testar o motor de ponta a ponta com um caso real do
dono. Produto **#355**, SKU `ADES-CART-4015`.

## O que foi cadastrado

| | |
|---|---|
| Peça | 40 × 15 mm |
| Cartela | A4 com **60 adesivos** (6 col × 10 lin) |
| Impressão | Konica Minolta C284e, colorida, **chapado 100%** |
| Material | Vinil Adespan Laser Branco Brilho A4 — R$ 1,88/folha |
| Recorte | Silhouette Cameo 5 — R$ 0,29/folha |
| Margem | 40% · arredondamento R$ 0,10 |

**A grade confere:** 6 × 10 = 60 peças. Numa A4 deitada (297 × 210 mm),
descontando 10 mm de margem para as marcas de registro da Cameo e 2 mm
de respiro entre peças, cabem 6 colunas × 11 linhas. O layout usa 10
linhas — sobra folga, o que é correto para leitura das marcas.

## De onde vem o custo de R$ 5,48

Esta é a parte que não ficou clara. Vamos por partes.

**O sistema usa 2 folhas para entregar 1 cartela:**

- 1 folha — a cartela em si
- 1 folha — refugo de 5%, arredondado para cima (não existe meia folha
  de refugo)

**O que cada folha carrega:**

| Item | Por folha | × 2 folhas |
|---|---:|---:|
| Vinil Adespan A4 | R$ 1,88 | R$ 3,76 |
| Impressão na Konica | R$ 0,72 | R$ 1,43 |
| Recorte na Cameo (fixo do lote, não por folha) | — | R$ 0,29 |
| | | **R$ 5,48** |

**Do custo ao preço**, com margem de 40%:

    R$ 5,48 ÷ (1 − 0,40) = R$ 5,48 ÷ 0,60 = R$ 9,14
    arredondado para R$ 0,10 → R$ 9,20

Note que **não é** "custo + 40%" (isso daria R$ 7,67). É **divisão**,
porque a margem é sobre o preço de venda, não sobre o custo — é assim
que o motor calcula em todo o sistema.

> O peso está no material: **o vinil sozinho é 69% do custo**. Em uma
> cartela, R$ 3,76 dos R$ 5,48.

## Comparação com o preço praticado

Preço do dono hoje: **R$ 12,90 por cartela**, qualquer quantidade.

| Cartelas | Folhas | Custo | Preço sistema | Por cartela | Preço dono |
|---:|---:|---:|---:|---:|---:|
| 1 | 2 | R$ 5,48 | R$ 9,20 | **R$ 9,20** | R$ 12,90 |
| 2 | 3 | R$ 8,08 | R$ 13,50 | R$ 6,75 | R$ 25,80 |
| 5 | 6 | R$ 15,86 | R$ 26,50 | R$ 5,30 | R$ 64,50 |
| 10 | 11 | R$ 28,84 | R$ 48,10 | R$ 4,81 | R$ 129,00 |
| 20 | 21 | R$ 54,80 | R$ 91,40 | R$ 4,57 | R$ 258,00 |
| 50 | 53 | R$ 137,86 | R$ 229,80 | R$ 4,60 | R$ 645,00 |

### Leitura

**Na cartela avulsa o preço do dono está saudável.** R$ 12,90 contra um
custo de R$ 5,48 dá margem de **57%** — acima dos 40% configurados. Não
há prejuízo.

**No volume é onde o dinheiro escapa.** A partir de 2 cartelas o preço
fixo de R$ 12,90 cobra muito acima do que o trabalho custa: em 10
cartelas o sistema pediria R$ 48,10 e o dono cobra R$ 129,00 — quase
**três vezes**.

Isso não quer dizer "baixe o preço". Quer dizer que **hoje não existe
preço de volume**, e um cliente que peça 50 cartelas provavelmente vai
embora ou negocia no grito. Com faixa de quantidade dá para segurar o
pedido grande com desconto que ainda deixa margem.

> Cuidado ao ler a coluna "por cartela": ela cai porque o **custo fixo
> do recorte** (R$ 0,29 por lote) e o refugo se diluem. O material e a
> impressão continuam proporcionais — o piso real fica em torno de
> R$ 4,50/cartela.

## Dois achados durante o teste

### 1. Acerto de offset em impressão digital (erro meu, corrigido)

Cadastrei o produto com `setupSheets = 1` — uma folha de acerto. Numa
Konica digital **isso não existe**: não há acerto de cor como em offset.
O efeito foi grosseiro: para entregar **1 cartela** o sistema queria
**3 folhas** (1 base + 1 acerto + 1 refugo) e o preço saiu **R$ 24,60**.

Corrigido para `setupSheets = 0`. **Fica a regra: produto que roda em
digital não leva folha de acerto.**

### 2. O refugo de 5% arredonda para cima e vira folha inteira

Com `wastePercent = 5%`, uma cartela consome 2 folhas — porque 5% de 1
folha é arredondado para 1 folha inteira. Está **correto** (não existe
meia folha de refugo) e é conservador, mas encarece a peça avulsa: o
custo real de 1 cartela é R$ 2,89, não R$ 5,48.

**Sugestão para o dono:** manter assim. O refugo existe de verdade — um
recorte fora de registro perde a folha inteira. Em tiragem maior o peso
some (em 20 cartelas o refugo é 1 folha em 21).

## Por que a impressão custa R$ 0,72/folha

Porque a cartela é **arte chapada, 100% de cobertura**:

| | |
|---|---|
| Toner na referência de 5% | R$ 0,0304 |
| × 20 (100% ÷ 5%) | **R$ 0,6080** |
| Peças mecânicas (cilindros, fusor, correia) | R$ 0,0303 |
| Custo fixo por página | R$ 0,0575 |
| Subtotal | R$ 0,6958 |
| + 3% de perda da categoria | **R$ 0,7167** |

Confere com o que o motor calculou (R$ 0,7157). **A cadeia toda está
consistente** — a cobertura multiplica só o toner, não o desgaste
mecânico, que é o comportamento certo.

## Pendência

O preço do vinil A4 (R$ 1,88) veio da contagem de estoque e é o item
mais pesado do custo: **69% do custo direto**. Vale conferir se é o
preço atual de compra.


---

# Venda POR ADESIVO — modelo final

Mudança de modelo pedida pelo dono: **a unidade de venda é o adesivo**,
não a cartela. A cartela vira o *degrau* — a forma de o cliente comprar
em quantidade e baratear a unidade.

Produto **#355**, agora `ADES-4015` — *Adesivo Personalizado 40×15mm*.

| | |
|---|---|
| Unidade de venda | **1 adesivo** |
| Rendimento | **60 adesivos por folha A4** (`piecesPerSheet`) |
| Pedido mínimo | 60 adesivos (1 cartela) |
| Padrão no orçamento | 60 |

## A tabela

Ancorada nos dois pontos que o dono deu: **R$ 12,90** na primeira
cartela e **R$ 11,75** por cartela na segunda.

| Adesivos | Cartelas | R$/adesivo | Total | Custo | Margem |
|---:|---:|---:|---:|---:|---:|
| 60 | 1 | R$ 0,2150 | R$ 12,90 | R$ 5,48 | 58% |
| 120 | 2 | R$ 0,1958 | R$ 23,50 | R$ 8,08 | 66% |
| 300 | 5 | R$ 0,1767 | R$ 53,00 | R$ 15,86 | 70% |
| 600 | 10 | R$ 0,1583 | R$ 95,00 | R$ 28,84 | 70% |
| 1.500 | 25 | R$ 0,1400 | R$ 210,00 | R$ 70,37 | 66% |
| 3.000 | 50 | R$ 0,1217 | R$ 365,00 | R$ 137,86 | 62% |

A margem **nunca cai abaixo de 58%**, e o rótulo de cada faixa mostra
ao cliente a equivalência em cartelas.

## Comportamento verificado

| Pediu | Paga por un. | Total | Faixa |
|---:|---:|---:|---|
| 30 | — | — | **abaixo do mínimo** (avisa) |
| 60 | R$ 0,2150 | R$ 12,90 | 60+ |
| 90 | R$ 0,2150 | R$ 19,35 | 60+ |
| 240 | R$ 0,1958 | R$ 46,99 | 120+ |
| 1.000 | R$ 0,1583 | R$ 158,30 | 600+ |
| 6.000 | R$ 0,1217 | R$ 730,20 | 3.000+ |

## Quantidade que não fecha cartela

Quem pede **90 adesivos** consome 2 cartelas — o sistema nunca fraciona
a folha (`Math.ceil`). O cliente paga 90 e leva 90; sobram 30 já pagos.

Conferido que isso **não gera prejuízo**: 90 adesivos custam R$ 8,08 e
são vendidos por R$ 19,35 — margem de 58%, a menor de toda a régua, e
ainda saudável.

> **Sugestão comercial:** vale oferecer a cartela cheia a quem pede
> quantidade quebrada. Quem pede 90 pode levar 120 por R$ 23,50 em vez
> de R$ 19,35 — R$ 4,15 a mais por 30 adesivos que já estavam pagos.

## Como mudar

Produtos → abrir o produto → faixas de preço. Quantidade, preço e
rótulo são editáveis pela tela. Para mudar o rendimento da folha
(hoje 60), o campo é *peças por folha*.
