# Auditoria de LÓGICA — Impressoras

A auditoria anterior (`AUDIT-IMPRESSORAS.md`) verificou validações de
entrada e aritmética: tudo correto. Esta pergunta outra coisa — **a
lógica corresponde a como uma gráfica opera?**

Três divergências encontradas. Nenhuma é erro de cálculo; todas são o
modelo cobrando algo diferente do que acontece na máquina.

---

## 🟠 1. Impressora em manutenção continua orçando

`printerStatuses` tem `ativa | manutencao | inativa`, mas
`printerCostPerPage` e `computePrintSheetCost` **nunca leem o status**.

**Reproduzido:** criei "Plotter Quebrada" com `status: manutencao` e
usei num produto. O produto foi salvo normalmente, com custo R$ 1,60 e
preço R$ 3,34.

O orçamento sai prometendo um prazo que a máquina parada não cumpre. Pior
quando a impressora tem multiplicador próprio: o preço fica calculado
para um equipamento que não vai rodar o serviço.

**Sugestão:** não bloquear (a máquina pode voltar antes da produção), mas
**avisar** ao salvar o produto e ao gerar orçamento — "esta impressora
está em manutenção".

---

## 🟠 2. `areaFactor` não conversa com as dimensões cadastradas

O formato guarda `widthMm`, `heightMm` **e** `areaFactor`, digitados
separadamente. Nada confere se batem.

**Reproduzido — os dois casos passam:**

```
"A3" cadastrado com 210×297mm (que é A4) e areaFactor 2,0  → aceito
"A3" cadastrado com 297×420mm (correto) e areaFactor 1,0   → aceito
```

O segundo é o perigoso: folha A3 real cobrando fator de A4.

```
A3 com fator 2 → R$ 0,24552/folha
A3 com fator 1 → R$ 0,12276/folha   ← metade do custo
```

Numa tiragem de 5.000 folhas A3, a diferença é **R$ 614** que a gráfica
deixa de cobrar — e ninguém percebe, porque o cadastro parece certo.

**Sugestão:** calcular o fator sugerido a partir das dimensões
(`área / área do formato de referência da categoria`) e avisar quando o
valor digitado divergir mais de ~10%. Manter editável, porque papel
especial e sangria justificam ajuste manual.

---

## 🟡 3. Custo fixo por página escala com área e faces

```ts
const raw = (colorant * coverageFactor + mechanical + fixedCostPerPage)
            * areaFactor * sides;
```

`fixedCostPerPage` está **dentro** do parêntese, então é multiplicado por
área e por número de faces:

| Cenário | Custo fixo cobrado |
|---|---|
| A4, 1 face | R$ 0,020 |
| A4, frente e verso | R$ 0,040 |
| A3, 1 face | R$ 0,040 |

Se esse campo representa desgaste proporcional à tinta/área, está certo.
Mas o nome sugere **custo fixo por folha processada** — manutenção,
energia, depreciação por passagem de papel. Nesse caso:

- **Duplex** é 1 passagem de papel na maioria das máquinas modernas, não 2
- **A3** é 1 folha manuseada, não 2

**Não corrigi** porque depende do que você entende por esse campo. Se for
"custo por folha que passa pela máquina", ele deveria ficar fora do
parêntese e não multiplicar por `sides`.

---

## ✅ Lógica conferida e correta

| Regra | Avaliação |
|---|---|
| Cobertura de tinta escala só o colorante | **Correto.** Foto a 20% de cobertura: colorante ×4, cilindro e fixo inalterados |
| Cilindro como `mechanical` | **Correto.** Desgasta por passagem de papel, não por cor |
| `appliesTo: both` entra em mono e color | **Correto** |
| P&B mais barato que colorido | **Correto** — R$ 0,09056 vs R$ 0,12276 |
| `printCostOverride` curto-circuita | **Correto**, e ainda respeita o multiplicador da impressora |
| Multiplicador por máquina | **Correto** — permite máquina velha custar mais |
| Herança categoria → impressora → formato | **Correto** — evita recadastro por máquina |

---

## O que preciso saber para corrigir

**Sobre o item 3:** o "custo fixo por página" da categoria representa
o quê na sua operação?

- **(a) Custo por folha que passa na máquina** (energia, manutenção,
  depreciação) → deve sair de dentro do parêntese e não multiplicar por
  faces nem por área
- **(b) Desgaste proporcional à área impressa** → está certo como é

Os itens 1 e 2 eu corrijo sem depender de resposta — são avisos, não
mudam preço de quem já cadastrou certo.
