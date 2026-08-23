# Plotter de recorte — Silhouette Cameo 5

Como o sistema calcula o custo do recorte interno. **Serviço próprio,
nada a ver com a tabela de terceirizados** (vinil em m², DTF, lona).

Valores levantados pelo dono em agosto/2026, a partir do preço oficial
dos insumos.

---

## 1. Custo por folha cortada — R$ 0,42

Cadastrado em **Impressoras & Tintas → Recorte / Plotter → consumíveis**.
Os dois itens ficam **separados**, não somados num número só, porque um
deles pode desaparecer (ver adiante).

| Item | Preço | Rende | Por folha |
|---|---|---|---|
| Lâmina de corte Tipo B | R$ 180,00 | 1.000 folhas | **R$ 0,18** |
| Base de corte padrão | R$ 120,00 | 500 ciclos | **R$ 0,24** |
| | | **Total** | **R$ 0,42** |

Os dois entram como `mechanical` (desgaste mecânico), **não** como
`colorant`. Isso importa: o custo de tinta é multiplicado pela cobertura
do desenho, o de desgaste não. Plotter não tem tinta — a lâmina se gasta
igual, o desenho sendo cheio ou vazado.

### Se trocar pela base eletrostática

A base eletrostática não usa cola. Os **R$ 0,24 saem da conta** e o custo
por folha cai para R$ 0,18 — mas entra a amortização do acessório, que é
mais caro.

Para fazer a troca, **sem programação**: Impressoras & Tintas → Recorte /
Plotter → editar "Base de corte padrão (rateio)". Trocar o preço e o
rendimento pelos da eletrostática, ou zerar para tirá-la da conta.

---

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

1. **Custo de máquina** — R$ 0,42 por folha (motor de impressão)
2. **Material** — metros de vinil × custo por metro (motor de material)
3. **Mão de obra e margem** — pelas regras que já existem

O desperdício da categoria está em **8%** (`waste_factor`), cobrindo
recorte perdido e teste de lâmina.

---

## 5. Ponto de atenção que continua aberto

A cobertura de referência da categoria é **1,0** e os formatos de recorte
também estão em 1,0 — a divisão dá 1 e não altera nada. Como não há
consumível `colorant` no plotter, hoje isso é inofensivo.

**Mas:** se algum dia for cadastrado um formato de recorte com cobertura
menor que 100%, e existir algum consumível marcado como `colorant`, o
custo cairia sem motivo. A trava correta é manter todo consumível de
plotter como `mechanical` — que é como está.

Já o `area_factor` do A3 = 2,00 assume que o A3 gasta o dobro do A4.
Para **desgaste de base** isso é verdade (a folha inteira encosta na
cola). Para **lâmina**, não: o que gasta é o comprimento de corte, não o
tamanho da folha. Um A3 com um círculo no meio gasta menos lâmina que um
A4 cheio de letras pequenas.

Na prática o erro é pequeno e para mais (superestima), o que é seguro
para preço. Fica registrado caso o volume de recorte cresça.
