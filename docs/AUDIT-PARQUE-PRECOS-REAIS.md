# Parque com preços reais — v3.40.0

> Todos os valores abaixo foram informados por você, exceto onde marcado ⚠️.

## Konica Minolta C284e

| Insumo | Preço | Rendimento | R$/pág |
|---|---|---|---|
| Kit toner CMYK (R$ 800 ÷ 4) | R$ 200/cor | 26–27,5k | 0,030350 |
| Unidades de imagem ×4 | R$ 599,90 | 95.000 | 0,025259 |
| Correia de transferência (AliExpress) | R$ 400 | 200.000 | 0,002000 |
| Unidade de fusão | R$ 700 | 600.000 | 0,001167 |
| Caixa de resíduos WX-103 (Zeus) | R$ 77 | 40.000 | 0,001925 |

Adotei o **valor mais baixo** da caixa de resíduos (R$ 77, compatível
Zeus), como você pediu — você nunca precisou trocar.

### ⚠️ O técnico: R$ 450 a cada 6 meses

Isso **não é custo por página** — é custo fixo de R$ 900/ano, e o
rateio depende inteiramente do seu volume:

| Volume/mês | Fixo/pág | A4 colorida | A4 P&B |
|---|---|---|---|
| 500 | 0,17000 | R$ 0,23762 | R$ 0,19434 |
| 1.000 | 0,09500 | R$ 0,16037 | R$ 0,11709 |
| **2.000** ← adotado | **0,05750** | **R$ 0,12175** | **R$ 0,07846** |
| 3.000 | 0,04500 | R$ 0,10887 | R$ 0,06559 |
| 5.000 | 0,03500 | R$ 0,09857 | R$ 0,05529 |
| 10.000 | 0,02750 | R$ 0,09085 | R$ 0,04756 |

**A página colorida varia de R$ 0,09 a R$ 0,24 — 2,6×.** Adotei 2.000
pág/mês como hipótese; é o número mais importante que falta confirmar.
Ajuste em `/impressoras` → Laser Colorida → "Custo fixo por página".

Fórmula: `0,02 (energia) + 900 ÷ (volume × 12)`

### Custo por formato (a 2.000 pág/mês)

| Formato | Colorido | P&B |
|---|---|---|
| A4 texto 5% | R$ 0,12175 | R$ 0,07846 |
| A4 gráfico 60% | R$ 0,46561 | R$ 0,16086 |
| A3 texto 5% | R$ 0,24349 | R$ 0,15693 |
| A3 gráfico 60% | R$ 0,93122 | R$ 0,32173 |

---

## Valor-hora: R$ 2,50 (editável)

### Bambu Lab A1

| Peça | Material | Tempo | Total |
|---|---|---|---|
| Chaveiro 8 g / 40 min | R$ 0,99 | R$ 1,68 | **R$ 2,66** |
| Peça 50 g / 8 h | R$ 6,17 | R$ 20,00 | **R$ 26,17** |
| Peça 100 g / 16 h | R$ 12,34 | R$ 40,00 | **R$ 52,34** |
| Peça 200 g / 30 h | R$ 24,68 | R$ 75,00 | **R$ 99,67** |

Na peça de 50 g o tempo é 76% do custo — bem mais equilibrado que os
R$ 8/h que eu havia estimado (lá dava 91%).

### Silhouette Cameo 5 — base de corte 500 folhas confirmado

Custo/folha **R$ 0,24840**, dos quais **R$ 0,18 (72%) é a base de
corte**. Continua sendo o insumo dominante do recorte.

| Trabalho | Material | Tempo | Total |
|---|---|---|---|
| 5 min | R$ 0,25 | R$ 0,21 | R$ 0,46 |
| 12 min | R$ 0,25 | R$ 0,50 | R$ 0,75 |
| 30 min | R$ 0,25 | R$ 1,25 | R$ 1,50 |
| 60 min | R$ 0,25 | R$ 2,50 | R$ 2,75 |

---

## BOPP — R$ 55/rolo (meio da faixa R$ 50–60)

| Etiqueta | Un/rolo | R$ 50 | **R$ 55** | R$ 60 |
|---|---|---|---|---|
| 5×5 | 1.000 | 0,0500 | **0,0550** | 0,0600 |
| 4×4 | 1.238 | 0,0404 | **0,0444** | 0,0485 |
| 10×5 | 500 | 0,1000 | **0,1100** | 0,1200 |

Cadastrados transparente, branco e prata no 5×5, mais transparente
4×4 e 10×5. Para outra cor/tamanho: material novo com `packQuantity` =
etiquetas do rolo.

---

## Ambiente reconstruído

O sandbox reciclou no meio da sessão e levou `node_modules` e o
PostgreSQL inteiro. Reinstalei tudo e criei
**`scripts/seed-parque-real.mjs`**, que reconstrói o parque completo
(6 categorias, 6 impressoras, 21 consumíveis, 22 formatos, 11
materiais) em um comando:

```bash
node scripts/seed-parque-real.mjs
```

Da próxima vez que o ambiente cair, é só rodar isso depois do
`npm install` + `drizzle-kit push`.

---

## Validação

`typecheck` ✔ · `e2e:smoke` **179** ✔ · todas as telas 200 ✔

## Único número em aberto

**Seu volume mensal de impressão na Konica.** É o que define o rateio
do técnico e faz a página colorida variar de R$ 0,09 a R$ 0,24.
