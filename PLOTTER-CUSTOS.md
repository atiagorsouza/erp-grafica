# Plotter de recorte — Silhouette Cameo 5

Como o sistema calcula o custo do recorte interno. **Serviço próprio,
nada a ver com a tabela de terceirizados** (vinil em m², DTF, lona).

Valores levantados pelo dono em agosto/2026, a partir do preço oficial
dos insumos.

---

## 1. Custo por folha cortada — R$ 0,26

Cadastrado em **Impressoras & Tintas → Recorte / Plotter → consumíveis**.

| Item | Preço | Rende | Por folha |
|---|---|---|---|
| Lâmina de corte Tipo B | R$ 180,00 | 1.000 folhas | **R$ 0,18** |
| Base de corte A3 (genérica) | R$ 42,00 | 500 ciclos | **R$ 0,084** |
| | | **Total** | **R$ 0,26** |

**Vale o mesmo para A4 e A3** — ver a seção 5, que explica por quê.

Os dois entram como `mechanical` (desgaste mecânico), **não** como
`colorant`. Isso importa: o custo de tinta é multiplicado pela cobertura
do desenho, o de desgaste não. Plotter não tem tinta — a lâmina se gasta
igual, o desenho sendo cheio ou vazado.

### Por que a base é a genérica de A3, e não a original

O levantamento inicial usava a base original **12x12" (30,5 × 30,5 cm)
por R$ 120**, o que dava R$ 0,24/folha. Só que **o A3 não cabe nela**:
420 mm de comprimento contra 305 mm de base — sobram 115 mm para fora.

Na prática o dono compra a **base A3 genérica (~R$ 42)** e corta nela
**tudo**, A3 e A4. Uma base só, mais barata, para os dois formatos. A
base original simplesmente não entra na conta porque não é comprada.

Efeito no custo: a base caiu de R$ 0,24 para **R$ 0,084** por folha —
quase um terço.

### Se trocar pela base eletrostática

A eletrostática não usa cola, então o custo de base sairia da conta.
Mas atenção: ela custa cerca de **R$ 1.320** e é de **30 × 30 cm** — ou
seja, **não resolve o A3**. Para o uso atual, a base genérica de R$ 42
é mais barata e mais adequada.

Para alterar, **sem programação**: Impressoras & Tintas → Recorte /
Plotter → editar o consumível da base.

## 2. Energia — praticamente zero

A Cameo 5 caiu de 40 W para 25 W. A 25 W e R$ 1,00/kWh, uma hora de
máquina custa **R$ 0,025** — menos de três centavos.

Está em `fixed_cost_per_page` = R$ 0,004/folha (≈ 10 min de máquina).
Não vale a complexidade de cronometrar: o dono decidiu **não** cobrar por
minuto. Se um dia o trabalho for muito longo, o caminho é o campo de
tempo no serviço, não o motor de impressão.

---

## 3. Vinil de recorte — por metro linear

O vinil vem em **rolo de 30 cm de largura, com 5 m ou 10 m**. Cadastrado
em **Estoque & Compras → Materiais**, unidade **metro**:

- `Vinil de recorte 30cm (rolo 5 m)` — embalagem "Rolo 30 cm x 5 m", 5 m
- `Vinil de recorte 30cm (rolo 10 m)` — embalagem "Rolo 30 cm x 10 m", 10 m

**O custo por metro o sistema calcula sozinho.** Basta preencher quanto
custou o rolo no campo de embalagem: R$ 60,00 num rolo de 10 m viram
R$ 6,00/metro. Quando o fornecedor reajustar, muda-se o valor do rolo e
todo serviço que usa vinil se atualiza.

> **Pendência para o dono:** os dois rolos estão com **custo zerado**.
> Preencher o valor real de compra em Estoque & Compras → Materiais →
> editar o rolo → campo de custo da embalagem.

### Por que metro linear e não m²

O rolo tem 30 cm fixos. Como a largura nunca muda, medir em m² só
acrescentaria uma multiplicação sem ganho de precisão. E o consumo real
é "puxei 40 cm do rolo" — que é como se compra e como se confere no
estoque.

Isso vale **só para o recorte interno**. Vinil grande formato
terceirizado continua em m², como já era.

---

## 4. Como isso compõe serviço e produto

Um serviço de recorte soma três coisas:

1. **Custo de máquina** — R$ 0,26 por folha (motor de impressão)
2. **Material** — metros de vinil × custo por metro (motor de material)
3. **Mão de obra e margem** — pelas regras que já existem

O desperdício da categoria está em **8%** (`waste_factor`), cobrindo
recorte perdido e teste de lâmina.

---

## 5. Por que A4 e A3 custam o mesmo

Esta é a parte contraintuitiva, e vale entender.

O sistema tinha o A3 com **fator de área 2,00** — assumindo que o A3
gasta o dobro do A4. Isso está **errado para recorte**, por dois motivos:

1. **A base é a mesma.** Não existe "meia base" para A4: a folha entra
   na mesma base A3 e gasta um ciclo de aderência, seja qual for o
   tamanho.

2. **A lâmina se gasta pelo COMPRIMENTO DE CORTE, não pelo tamanho da
   folha.** Um A4 cheio de letras miúdas percorre muito mais caminho
   com a lâmina do que um A3 com um círculo grande no meio. O tamanho
   da folha não diz quanto a lâmina andou.

Por isso **os dois formatos têm fator de área 1,00**: o custo por folha
é o mesmo, R$ 0,26.

### O que isso corrigiu

Com o fator 2,00, o A3 saía a **R$ 0,92** por folha. O custo real é
**R$ 0,29**. O sistema cobrava **mais de três vezes** o custo do recorte
em A3 — e o A3 é metade do volume.

> Isso não significa que o preço de venda do A3 deva ser igual ao do A4:
> o **papel** A3 custa mais que o A4, e ele entra pelo motor de material,
> separado. O que é igual é o custo de **máquina**.

### O que continua em aberto

A cobertura de referência da categoria é 1,0 e os formatos também — a
divisão dá 1 e não altera nada. Como não há consumível `colorant` no
plotter, hoje é inofensivo. A regra a manter: **todo consumível de
plotter é `mechanical`**.

Se um dia o volume de recorte crescer a ponto de justificar, o caminho
mais fiel seria cobrar por **metro de corte** do desenho — mas isso
exige o operador informar o comprimento, e hoje não compensa.
