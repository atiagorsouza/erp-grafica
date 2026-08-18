# Auditoria — Impressoras, Consumíveis e Custo por Página

Motor que define quanto custa cada página impressa — a base de todo o
preço numa gráfica. Arquivos: `src/lib/print-engine.ts`,
`src/lib/pricing.ts` (`categoryCostPerPage`, `printerCostPerPage`,
`computePrintSheetCost`), `PrintersEngine.tsx`.

Testes feitos no servidor rodando, com um parque de impressoras montado
para o exercício (categoria Laser Colorida, Ricoh MP C3003, 3
consumíveis, formatos A4/A3).

---

## Resultado: nenhum bug encontrado

Este módulo está bem construído. Registro o que foi testado para que a
ausência de achados seja verificável, não uma afirmação vazia.

### Validações de entrada — todas corretas

| Tentativa | Resultado |
|---|---|
| Consumível com `yieldPages: 0` | **422** "Rendimento precisa ser maior que zero" |
| Consumível com `yieldPages: -5` | **422** |
| Impressora com `costMultiplier: 0` | **422** |
| Impressora com `costMultiplier: -2` | **422** |
| Formato com `areaFactor: 0` | **422** |
| Formato sem `categoryId` | **422** |
| Excluir categoria com impressora/consumíveis | **409** "Categoria em uso..." |

> O achado 2 de `AUDIT-CATALOGO.md` (consumível com rendimento zero
> zerando o custo em silêncio) **não é alcançável pela API** — o schema
> barra antes. A proteção `if (yieldPages <= 0) return 0` em
> `consumableCostPerPage` é defesa de segunda camada, para dados vindos
> de importação direta no banco. Risco teórico, não prático.

### Cálculo de custo por página — conferido

Com Toner Ciano (R$ 400 / 6.000 pg), Toner Preto (R$ 320 / 8.000 pg),
Cilindro (R$ 900 / 60.000 pg), custo fixo R$ 0,02, perda 5% e
multiplicador 1,15:

| Modo | Consumíveis aplicados | Custo/página |
|---|---|---|
| Colorido | Ciano + Cilindro | **R$ 0,12276** |
| P&B | Preto + Cilindro | **R$ 0,09056** |

Confere: P&B sai mais barato, o cilindro (`appliesTo: both`) entra nos
dois, e o toner colorido só no colorido. Mil páginas coloridas = R$ 122,76.

### Arquitetura que merece nota

- **Separação colorant × mechanical**: só o colorante escala com a
  cobertura de tinta do formato. O cilindro, que se desgasta por
  passagem de papel independente da arte, não escala. Está certo.
- **`printCostOverride`** no formato curto-circuita todo o cálculo,
  respeitando o multiplicador da impressora — útil para trabalho
  terceirizado com preço fechado.
- **`getPrinterEngineHealth()`** já reporta consumíveis sem rendimento,
  impressoras órfãs e categorias sem consumível.
- **Herança em três níveis** (categoria → impressora → formato) evita
  recadastrar custo por máquina.

---

## Observação, não bug

`categoryCostPerPage` aplica `wasteFactor` da categoria, e
`computeBatchProduct` aplica `wastePercent` do produto. São perdas
diferentes — desperdício de insumo na máquina versus refugo de folhas na
tiragem — mas os nomes parecidos convidam a cadastrar a mesma coisa duas
vezes.

Sugestão para quando o parque real for cadastrado: usar `wasteFactor` da
categoria para o consumo de tinta/toner além do nominal, e
`wastePercent` do produto só para folhas perdidas. Não é correção de
código; é convenção de cadastro.
