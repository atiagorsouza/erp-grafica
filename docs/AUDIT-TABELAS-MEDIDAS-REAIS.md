# Tabelas de preço — DTF, Lona e Vinil

## Medidas e preços (venda = custo × 2,2)

### DTF Têxtil

| Formato | Medida | Custo | Venda |
|---|---|---|---|
| A4+ | 38×25 | R$ 11,61 | R$ 25,54 |
| A3+ | 38×50 | R$ 24,03 | R$ 52,87 |
| Metro | 38×100 | R$ 36,00 | R$ 79,20 |

### DTF UV

| Formato | Medida | Custo | Venda |
|---|---|---|---|
| A4 | 20×28 | R$ 23,22 | R$ 51,08 |
| A3 | 28×40 | R$ 36,00 | R$ 79,20 |
| Metro | 28×100 | R$ 67,50 | R$ 148,50 |

### Lona e Vinil — mínimo em reais

| | Custo/m² | Venda/m² | Mín. custo | Mín. venda |
|---|---|---|---|---|
| Lona 440g | R$ 45 | R$ 89 | R$ 26 | R$ 60 |
| Vinil | R$ 45 | R$ 95 | R$ 30 | R$ 70 |

O piso de **custo** é o do fornecedor; o de **venda** é o seu. Separados
porque, com um número só, um adesivo pequeno sairia pelo próprio mínimo
do fornecedor — margem zero.

---

## ✅ Peças por folha: quem decide é você

> "Isso não posso decidir colocando a quantidade? depende muito do
> tamanho da estampa."

Correto — e o desenho anterior estava errado. Eu tinha gravado "cabem 6"
como propriedade da **folha**, mas é propriedade da **estampa**: na mesma
20×28 cabem 6 canecas ou 30 chaveiros.

Agora o número é editável nos dois pontos de uso:

| Onde | Campo | Quando |
|---|---|---|
| Produto | "Peças por folha" | fixo para aquele produto |
| PDV | `piecesPerSheet` no item | por venda, estampa avulsa |

O valor da tabela virou apenas **referência** (padrão 1). A folha
continua **indivisível** — a sobra é perda, então o motor arredonda
para cima.

### Mesma folha UV A4 (R$ 51,08), estampas diferentes

| Venda | Cabem | Folhas | Cobrado |
|---|---|---|---|
| 6 canecas | 6 | 1 | R$ 51,08 |
| 8 canecas | 6 | 2 | R$ 102,16 |
| 30 chaveiros | 30 | 1 | R$ 51,08 |
| 31 chaveiros | 30 | 2 | R$ 102,16 |
| 4 estampas grandes | 2 | 2 | R$ 102,16 |

### Produtos compostos

| Produto | Cabem | Custo tabela | Custo total | Venda |
|---|---|---|---|---|
| Caneca (folha A4) | 6 | R$ 3,87 | R$ 12,76 | R$ 38,80 |
| Caneca (folha A3) | 12 | R$ 3,00 | R$ 11,89 | R$ 36,16 |
| Chaveiro (folha A4) | 30 | R$ 0,77 | R$ 0,77 | R$ 2,78 |
| Camiseta A4+ | 1 | R$ 11,61 | R$ 33,61 | R$ 102,22 |

Caneca e chaveiro saem da **mesma folha de R$ 23,22** — o que muda é
quantas peças você encaixa.

---

## 💡 Qual folha compensa

Custo por 100 cm²:

| DTF Têxtil | R$/100cm² | DTF UV | R$/100cm² |
|---|---|---|---|
| A4+ | 1,222 | A4 | 4,146 |
| A3+ | 1,265 | A3 | 3,214 |
| **Metro** | **0,947** | **Metro** | **2,411** |

No têxtil o **A3+ é ligeiramente pior que o A4+** por área, e o metro é
25% mais barato. No UV cada salto de tamanho reduz o custo — o metro é
42% mais barato que o A4.

Por isso a mesma caneca sai **R$ 2,64 mais barata** na folha A3.

---

## Recadastrar após reset do ambiente

```bash
node scripts/seed-parque-real.mjs
node scripts/seed-tabelas-precos.mjs
```
