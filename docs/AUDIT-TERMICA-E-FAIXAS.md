# Sublimação 100%, ribbons por tipo e preço por quantidade (v3.34.0)

Três pedidos do usuário, um deles exigindo estrutura nova no sistema.

---

## 1. Sublimação — sempre 100% de cobertura

> "na sublimação sempre uso 100% cobertura"

Os 4 formatos foram para `inkCoverage = 1.0` **e** a `referenceCoverage`
da categoria subiu de 30% para 100%.

As duas coisas juntas, de propósito: `coverageFactor = cobertura ÷
referência`. Mexer só na cobertura multiplicaria todo custo por 3,33 e
inflaria a categoria inteira. Como o rendimento da tinta Genesis (1.200
folhas) já foi medido no uso real — que é sempre 100% —, a referência
tem que acompanhar. Resultado: A4 sublimático continua R$ 0,14175,
e agora os números *significam* o que dizem.

| Formato | Área | Custo |
|---|---|---|
| A4 sublimático | 1,0 | R$ 0,14175 |
| Caneca 11oz (20×8) | 0,2565 | R$ 0,03636 |
| Azulejo 15×15 | 0,3608 | R$ 0,05114 |
| Camiseta A4 | 1,0 | R$ 0,14175 |

⚠️ Falta o **blank** (caneca, azulejo, camiseta) e o **papel
sublimático** — entram como material do produto, não da impressora.

---

## 2. Térmica — ribbon é escolha, não soma

> "existe variações de ribbom... Cera, Misto e Resina... a metalica
> resina rosê 76 M 190,00, a mista varia de 90 e a preta cera 32,00"

### O problema

Consumível no motor é **por categoria** e todos **somam**. Cadastrar
cera + misto + resina na categoria Térmica faria toda etiqueta pagar os
três ribbons ao mesmo tempo. Eles são **alternativas**, não componentes.

### A solução

Ribbon virou **material de estoque**, medido em metro, usando a
embalagem de compra da v3.31.0:

| Ribbon | Rolo | Preço | R$/metro |
|---|---|---|---|
| Cera Preto 110×76m | 76 m | R$ 32,00 | 0,4211 |
| Misto 110×76m | 76 m | R$ 90,00 | 1,1842 |
| Resina Metálica Rosê 110×76m | 76 m | R$ 190,00 | 2,5000 |

Cada produto escolhe o seu como insumo extra, com a quantidade em
metros consumidos. A categoria Térmica fica só com o que é **comum a
toda impressão**: cabeça térmica + custo fixo.

**6× de diferença** entre cera e resina metálica por etiqueta — não dá
para tratar como um consumível médio.

### O rolo de 2 colunas

> "Etiqueta Rosê 5x5 cm rolo tem 26m e vem 1000 unidades"

Esses números não fecham em coluna única: 26.000 mm ÷ 1.000 = 26 mm por
etiqueta, mas a etiqueta tem 50 mm de altura.

Fecham em **2 colunas**:

```
1.000 etiquetas ÷ 2 colunas       = 500 linhas
26.000 mm ÷ 500 linhas            = 52 mm por linha
52 mm = etiqueta 50 mm + gap 2 mm  ✔
```

Isso **dobra** o rendimento do ribbon: cada linha de 52 mm imprime duas
etiquetas, então o ribbon gasto por etiqueta é 26 mm, não 52 mm.

### Custo real da Etiqueta Rosê 5×5

| Componente | R$/etiqueta |
|---|---|
| Etiqueta adesiva (R$ 48,00 ÷ 1.000) | 0,04800 |
| Ribbon resina rosê (26 mm × R$ 2,50/m) | 0,06500 |
| Cabeça térmica (rateio) | 0,00300 |
| Custo fixo da categoria | 0,00500 |
| *+ perda 3%* | |
| **Custo** | **0,12463** |

O ribbon metálico custa **mais que a própria etiqueta** — 52% do custo.

⚠️ O preço do rolo de etiqueta (R$ 48,00) é **estimativa**. Confirmar.

---

## 3. Preço por quantidade — estrutura nova

> "vendo minimo 50und depois 100 und e assim vai.. e ai no produto teria
> que ter o preço por quantidade editavel"

### O que faltava

O produto tinha **um preço só**. Vender 50 e 500 pelo mesmo unitário ou
perde a venda grande, ou entrega a pequena no prejuízo — o setup
(calibrar, carregar ribbon, testar) é o mesmo nas duas.

### Tabela `product_price_tiers`

| Campo | Uso |
|---|---|
| `minQuantity` | quantidade que ativa a faixa |
| `unitPrice` | preço unitário a partir dali |
| `label` | rótulo no orçamento |

Índice único em `(productId, minQuantity)`: duas faixas com o mesmo
mínimo tornariam o preço indeterminado.

### `resolvePriceTier()` em `pricing.ts`

Vale a **maior faixa cujo mínimo cabe** na quantidade. Com 50/100/250,
pedir 180 aplica a de 100.

- Produto **sem faixas** → preço padrão. Nada do que existe quebra.
- Pedido **abaixo do menor mínimo** → `belowMinimum: true`. O motor não
  inventa preço: vender 20 etiquetas ao unitário de 1.000 é prejuízo
  garantido. Quem chama decide recusar ou cobrar o mínimo.

### Na tela

Bloco "Preço por quantidade" no editor de produto, com aviso em
vermelho quando o preço da faixa cai **abaixo do custo unitário**.

### Faixas da Etiqueta Rosê (custo R$ 0,1246, margem 50%, setup R$ 8,00)

| Quantidade | Preço/un | Total |
|---|---|---|
| 50+ | R$ 0,75 | R$ 37,50 |
| 100+ | R$ 0,54 | R$ 54,00 |
| 250+ | R$ 0,41 | R$ 102,50 |
| 500+ | R$ 0,37 | R$ 185,00 |
| 1.000+ | R$ 0,35 | R$ 350,00 |

### ⚠️ Degrau entre faixas

499 un × R$ 0,41 = **R$ 204,59**
500 un × R$ 0,37 = **R$ 185,00**

Levar **mais** sai **mais barato**. É inerente a faixas e existe em
qualquer gráfica. Duas saídas quando incomodar: aproximar os preços nas
bordas, ou o vendedor sugerir "leva 500 que sai menos" — que costuma
ser bom argumento de venda.

---

## Validação

- `npm run typecheck` ✔ · `npm run build` ✔ · `e2e:smoke` **179** ✔
- `/produtos`, `/estoque`, `/impressoras`, `/pdv`, `/orcamentos` → 200 ✔

## Pendências

1. **Preço do rolo de etiqueta 5×5** — usei R$ 48,00 estimado.
2. **Faixas ainda não aplicadas no PDV/Orçamento** — a estrutura e o
   motor estão prontos; falta consumir `resolvePriceTier` nessas telas.
3. **Ribbons coloridos além do rosê** — o anúncio cita várias cores
   metálicas a R$ 190; cadastrar conforme comprar.
4. **Tempo de máquina** segue fora do motor.
