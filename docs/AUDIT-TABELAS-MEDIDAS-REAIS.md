# Tabelas de preço — medidas reais

## DTF Têxtil

| Formato | Medida | Custo | Venda* |
|---|---|---|---|
| A4+ | 38×25 | R$ 11,61 | R$ 29,00 |
| A3+ | 38×50 | R$ 24,03 | R$ 56,00 |
| Metro | 38×100 | R$ 36,00 | R$ 79,00 |

## DTF UV

| Formato | Medida | Custo | Venda* | Cabem |
|---|---|---|---|---|
| A4 | 20×28 | R$ 23,22 | R$ 55,00 | 6 canecas |
| A3 | 28×40 | R$ 36,00 | R$ 82,00 | 12 ⚠️ |
| Metro | 28×100 | R$ 67,50 | R$ 149,00 | 30 ⚠️ |

\* preços de venda são partida (~2,2× custo) — **ajuste conforme sua tabela**

⚠️ **Confirmar:** você informou 6 canecas na A4 20×28 (≈93 cm² por
caneca). Derivei A3 = 12 e Metro = 30 por proporção de área. Se na
prática cabe menos (perda de encaixe, margem de corte), me diga os
números reais.

---

## 💡 Qual folha compensa

Custo por 100 cm² de área útil:

| DTF Têxtil | R$/100cm² | | DTF UV | R$/100cm² |
|---|---|---|---|---|
| A4+ | 1,222 | | A4 | 4,146 |
| A3+ | 1,265 | | A3 | 3,214 |
| **Metro** | **0,947** | | **Metro** | **2,411** |

**No têxtil o metro é 25% mais barato por área que o A4+** (e o A3+ é
ligeiramente pior que o A4+). **No UV, cada salto de tamanho reduz o
custo**: o metro é 42% mais barato que o A4.

Isso aparece no produto composto:

| Caneca UV | Custo | Venda |
|---|---|---|
| via folha A4 (23,22 ÷ 6 = 3,87) | R$ 12,76 | R$ 38,80 |
| **via folha A3** (36,00 ÷ 12 = 3,00) | **R$ 11,89** | **R$ 36,16** |

Mesma caneca, **R$ 2,64 mais barata** só por usar a folha maior.

---

## Lona e Vinil — mínimo em reais

| | Custo/m² | Venda/m² | Mín. custo | Mín. venda |
|---|---|---|---|---|
| Lona 440g | R$ 45 | R$ 89 | R$ 26 | R$ 60 |
| Vinil | R$ 45 | R$ 95 | R$ 30 | R$ 70 |

O piso de **custo** é o do fornecedor; o de **venda** é o seu. Separados
de propósito — com um número só, um adesivo pequeno seria vendido pelo
próprio mínimo do fornecedor, com margem zero.

| Peça | Área | Custo | Venda | Margem |
|---|---|---|---|---|
| Adesivo 30×30 | 0,09 m² | R$ 26,00 (mín) | R$ 60,00 (mín) | 57% |
| Banner 1,20×0,90 | 1,08 m² | R$ 48,60 | R$ 96,12 | 49% |
| Lona 2×1,5 | 3,00 m² | R$ 135,00 | R$ 267,00 | 49% |

---

## Como o sistema usa

**Caso 1 — venda direta no PDV.** A folha é indivisível:

| Pedido | Folhas | Cobrado |
|---|---|---|
| 6 canecas (A4) | 1 | R$ 55,00 |
| 8 canecas (A4) | 2 | R$ 110,00 |
| 12 canecas (A3) | 1 | R$ 82,00 |
| 31 canecas (Metro) | 2 | R$ 298,00 |

**Caso 2 — produto composto.** A folha é rateada pelo que cabe:

| Produto | Blank | Tabela | Custo | Venda |
|---|---|---|---|---|
| Caneca UV A4 | 8,89 | 3,87 | R$ 12,76 | R$ 38,80 |
| Caneca UV A3 | 8,89 | 3,00 | R$ 11,89 | R$ 36,16 |
| Camiseta A4+ | 22,00 | 11,61 | R$ 33,61 | R$ 102,22 |
| Camiseta A3+ | 22,00 | 24,03 | R$ 46,03 | R$ 139,99 |

## Recadastrar após reset do ambiente

```bash
node scripts/seed-parque-real.mjs
node scripts/seed-tabelas-precos.mjs
```
