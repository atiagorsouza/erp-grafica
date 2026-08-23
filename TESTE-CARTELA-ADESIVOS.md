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
