# Auditoria — Embalagem de compra e formato no modo unit (v3.31.0)

## Origem

Observação do usuário:

> "No estoque o certo não seria cadastrar a resma, pacote enfim Resma 500
> folhas e ele já calcula o custo da folha. Pacote papel foto 10x15
> Revelação 100 und. calcula o custo da unidade."

A observação estava correta e expôs **dois** problemas, um de cadastro e
outro — mais grave — no motor de precificação.

---

## 🔴 Problema 1 — Insumo não tinha embalagem de compra

### Como era

`materials` só tinha `unit` + `unitCost`. O insumo é **comprado** em
embalagem fechada (resma de 500 folhas, pacote de 100 fotos, bobina de
300 m) mas é **consumido** na unidade (folha, foto, metro).

O usuário era obrigado a fazer a divisão na calculadora e digitar o
resultado:

| Compra real | O que o sistema pedia |
|---|---|
| Resma 500 fls — R$ 28,00 | digitar `0.056` |
| Pacote 100 fotos — R$ 42,00 | digitar `0.42` |
| Bobina 300 m — R$ 38,00 | digitar `0.1266...` |

Consequências:

1. **Erro de arredondamento entra na precificação.** R$ 38,00 / 300 =
   0,126666…; digitando `0,1267` o erro se propaga por todos os produtos.
2. **Reajuste de preço exige refazer a conta.** O fornecedor sobe a resma
   para R$ 31,00 e o usuário precisa lembrar que eram 500 folhas.
3. **A ficha não registra o que foi comprado.** Ninguém consegue auditar
   de onde saiu o `0,056`.

### Como ficou

Três campos novos em `materials`:

| Campo | Significado |
|---|---|
| `packName` | rótulo — "Resma 500 folhas" |
| `packQuantity` | unidades base na embalagem — 500 |
| `packCost` | preço pago fechado — R$ 28,00 |

`unitCost` passa a ser **derivado**: `packCost / packQuantity`, calculado
em `derivedUnitCost()` (`src/lib/stock.ts`) com **6 casas decimais** — 4
casas truncam insumos baratos (R$ 38,00 / 15.000 etiquetas = 0,002533,
que a 4 casas vira 0,0025, um erro de 1,3%).

Regras:

- Embalagem informada **manda** no custo unitário. Se os dois vierem
  preenchidos, a divisão vence o número digitado — senão o usuário edita
  a resma, vê R$ 0,056 na tela e o produto continua custeado pelo valor
  velho.
- `packQuantity = 0` → comportamento legado, `unitCost` digitado direto.
  **Nenhum cadastro existente quebra.**
- Na UI o campo "Custo unitário" fica **desabilitado** quando a embalagem
  está preenchida, com a conta exibida ao vivo:
  `R$ 28,00 ÷ 500 = R$ 0,056 por folha`.

### Recebimento de compra

`receivePurchaseLocked` gravava só o `unitCost` novo. Isso deixava a
ficha **incoerente**: a tela seguia mostrando "Resma 500 fls · R$ 28,00"
enquanto o custo por folha já era outro — e a próxima edição do material
recalculava a partir da resma velha, **desfazendo o reajuste que a compra
tinha acabado de aplicar**.

Agora o recebimento reprecifica a embalagem junto:
`packCost = unitCost × packQuantity`.

---

## 🔴 Problema 2 — Formato era decorativo no modo unit (CRÍTICO)

Encontrado ao montar o produto "Revelação foto 10x15" do exemplo do
usuário, que mencionou que foto é **100% de cobertura**.

### O bug

O sistema tem **dois motores paralelos**:

| Modo | Função de custo de impressão | Conhece o formato? |
|---|---|---|
| `batch` | `computePrintSheetCost` | ✅ sim |
| `unit` | `printerCostPerPage` | ❌ **não** |

`ProductCalcInput` **não tinha nem o campo `format`**. O select
"Formato" na tela de produto era puramente decorativo no modo unit:

- **Cobertura de tinta ignorada** — uma foto 10×15 com 100% de cobertura
  era custeada com a mesma tinta de um texto 5%.
- **Fator de área ignorado** — um A3 custava exatamente igual a um A4.
- **`printCostOverride` ignorado** — a tabela comercial interna não valia.

Como a maioria dos produtos de balcão é cadastrada em modo unit, esse
era provavelmente o erro de custo mais caro do sistema.

### Prova numérica

Produto "Revelação foto 10x15" (Epson L18050, papel foto R$ 0,42/un):

| | Antes | Depois |
|---|---|---|
| Custo de impressão | R$ 0,043775 | **R$ 0,060564** |
| Custo total | R$ 0,46 | **R$ 0,48** |
| Preço final | R$ 1,22 | **R$ 1,27** |

Conferência da conta nova:

```
colorant  = 135,00 / 6.000 = 0,0225   (jogo CMY)
mechanical= 600,00 / 60.000 = 0,01    (manutenção/cabeça)
coverageFactor = 1,00 / 0,10 = 10     (foto 100% ÷ referência 10%)
fixedCostPerPage = 0,01

raw = (0,0225 × 10 + 0,01 + 0,01) × 0,24 (área 10x15) × 1 face
    = 0,2350 × 0,24 = 0,0564
custo = 0,0564 × 1,03 (perda 3%) × 1,0 (multiplicador) = 0,060564 ✔
```

A impressão era **38% mais barata** do que a real. Em produto fotográfico,
onde a tinta é o insumo dominante, isso corrói a margem inteira.

### A correção

Modo unit agora usa **o mesmo motor** do batch:

```ts
const perPage = computePrintSheetCost({
  printer, category, consumables,
  format: input.format,
  colorMode: input.colorMode,
  printSides: 1,   // no unit as faces já estão em pagesPerUnit
});
```

`printSides` fica em 1 de propósito: no modo unit as faces são contadas
em `pagesPerUnit`. Passar as duas coisas contaria a face duas vezes.

Corrigido nos dois lugares que calculam:
- `src/lib/products.ts` — gravação no banco
- `src/components/modules/ProductsClient.tsx` — prévia ao vivo na tela

---

## Também corrigido

- Formato "Foto 10x15" estava com `inkCoverage = 0.60`. Foto é área
  totalmente coberta → **1.00**, conforme o usuário.

---

## Exemplo completo do usuário, funcionando

**Insumo** — Papel Foto 10x15 Glossy 180g
`Pacote 100 folhas · R$ 42,00` → **R$ 0,42/unidade** (calculado)

**Produto** — Revelação foto 10x15 (modo unit, Epson L18050, formato Foto
10x15 @ 100% cobertura, margem 50%)

| Componente | Valor |
|---|---|
| Impressão (1 pg, colorido, Foto 10x15) | R$ 0,060564 |
| Material: Papel Foto 10x15 Glossy 180g | R$ 0,420000 |
| **Custo** | **R$ 0,48** |
| **Preço final** | **R$ 1,27** |

Exatamente a lógica descrita: *"produto já vem com a unidade × valor +
impressão da L18050 que nesse caso é 100% de cobertura"*.

---

## Validação

- `npm run typecheck` ✔
- `npm run build` ✔
- `npm run e2e:smoke` ✔ **179 checks**
- `npm run lint` — 6 erros, todos **pré-existentes** (`PrintersEngine:151`,
  `TopBar:39`, `MobileSidebarOverlay:10`). Nenhum novo.

## Pendente

- Rever o `inkCoverage` dos demais formatos: se "Foto 10x15" estava
  errado, os outros merecem conferência agora que o valor **realmente
  afeta o preço** no modo unit.
- Cadastrar a embalagem de compra nos materiais restantes.
