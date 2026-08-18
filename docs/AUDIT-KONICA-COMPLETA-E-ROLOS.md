# Konica completa e geometria do rolo térmico (v3.36.0)

## 1. Consumíveis que faltavam na Konica C284e

O usuário apontou três peças ausentes. Rendimentos buscados em fonte
oficial/varejo, **preços ainda estimados**.

| Peça | Preço | Rendimento | Fonte do rendimento |
|---|---|---|---|
| Caixa de resíduos WX-103 | R$ 150 ⚠️ | 40.000 | LD Products, Staples, Newegg — consistente |
| Correia de transferência | R$ 900 ⚠️ | 200.000 | compatível anuncia 300k a 5%; adotado conservador |
| Unidade de fusão | R$ 1.200 ⚠️ | 600.000 | Precision Roller (genuína C284e) |

Todas `mechanical` + `both`: desgastam em P&B e em colorido igualmente
(o papel passa pelo fusor e pela correia independente da cor).

### Mecânica completa por página colorida

| Item | R$/pág |
|---|---|
| 4× unidade de imagem | 0,025259 |
| Correia de transferência | 0,004500 |
| Caixa de resíduos WX-103 | 0,003750 |
| Unidade de fusão | 0,002000 |
| **Total** | **0,035509** |

### Custo final da Konica

| Formato | Colorido | P&B |
|---|---|---|
| A4 texto 5% | R$ 0,08843 | R$ 0,04515 |
| A4 gráfico 60% | R$ 0,43230 | R$ 0,12755 |

Evolução: R$ 0,06542 (só kit toner) → R$ 0,07788 (+ cilindros) →
**R$ 0,08843** (+ resíduos, correia, fusor). As três peças somaram
**+13,5%** ao custo colorido — não eram desprezíveis.

---

## 2. Etiqueta: rendimento não é número fixo

> "Rolo das etiquetas varia pq existe 4x4 5x5 metragem depende Tipo de
> etiqueta bopp transparente etc."

Correto, e isso invalidava o modelo anterior. O ribbon avança o
**comprimento** da etiqueta + gap, e o rolo pode ter **várias colunas**:

| Etiqueta | Avanço | Col | Etiq/ribbon 76m |
|---|---|---|---|
| 100×30 | 32mm | 1 | 2.375 |
| 40×40 | 42mm | 2 | 3.619 |
| 50×50 | 52mm | 2 | 2.923 |
| 100×150 | 152mm | 1 | 500 |
| Pulseira 250×25 | 252mm | 1 | 301 |

**12× de variação.** Guardar um rendimento único na categoria era chute.

### Campos novos em `print_formats`

- `feedMm` — avanço por linha (altura da etiqueta + gap)
- `columns` — etiquetas lado a lado no rolo

Zerados, o motor mantém o comportamento antigo (`areaFactor`) — nenhum
cadastro existente quebra.

### `ribbonLabelYield()` e `ribbonCostPerLabel()` em `pricing.ts`

```
etiquetas = floor((metros × 1000 ÷ feedMm) × colunas)
```

### Custo de impressão por etiqueta (ribbon + cabeça + fixo)

| Formato | Avanço | Col | Etiq/ribbon 76m | Cera R$32 | Misto R$90 | Resina R$190 |
|---|---|---|---|---|---|---|
| Etiqueta 100x30mm | 32mm | 1 | 2.375 | R$ 0.0221 | R$ 0.0473 | R$ 0.0906 |
| Etiqueta 60x40mm | 42mm | 2 | 3.619 | R$ 0.0173 | R$ 0.0339 | R$ 0.0623 |
| Etiqueta 40x40mm (2 colunas) | 42mm | 2 | 3.619 | R$ 0.0173 | R$ 0.0339 | R$ 0.0623 |
| Etiqueta 100x50mm | 52mm | 1 | 1.461 | R$ 0.0308 | R$ 0.0717 | R$ 0.1422 |
| Etiqueta 50x50mm (2 colunas) | 52mm | 2 | 2.923 | R$ 0.0195 | R$ 0.0400 | R$ 0.0752 |
| Etiqueta 100x150mm (envio) | 152mm | 1 | 500 | R$ 0.0742 | R$ 0.1936 | R$ 0.3996 |
| Pulseira 250x25mm | 252mm | 1 | 301 | R$ 0.1177 | R$ 0.3162 | R$ 0.6584 |

Amplitude de **R$ 0,0173 a R$ 0,6584 — 38×**. Sem `feedMm`/`columns` o
sistema cobraria o mesmo por todas.

O tipo de ribbon pesa mais que o tamanho: a mesma 100×50 custa R$ 0,031
em cera e R$ 0,142 em resina metálica.

---

## Pendências

1. **Preços das 3 peças novas da Konica** — rendimentos confiáveis,
   valores em reais ainda estimados.
2. **Etiqueta BOPP/transparente** — o usuário citou; cada tipo é um
   material próprio no estoque, com seu preço de rolo.
3. **Vincular ribbon ao produto** por padrão — hoje é insumo extra
   escolhido manualmente.
4. **Tempo de máquina** segue fora do motor.
