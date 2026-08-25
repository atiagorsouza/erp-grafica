# Auditoria — Motor de precificação e impressão

Arquivos: `src/lib/pricing.ts` (599 linhas, o núcleo),
`src/lib/print-engine.ts`, `src/lib/products.ts`, `src/lib/printers.ts`.

Todos os números abaixo foram calculados executando as próprias funções
do sistema, com um cenário fixo: **custo direto R$ 100, margem 40%,
imposto 6%, cartão 4,99%** — as taxas reais configuradas no painel.

---

## 🔴 1. O modo unitário não entrega a margem que promete

`computeProduct` aplica a margem por divisor (correto) e depois **soma
imposto e taxa por fora**:

```ts
const sellPrice = baseCost / (1 - margin);   // 166,67
const finalPrice = sellPrice + sellPrice*tax + sellPrice*card;  // 184,98
```

O problema: imposto e maquininha incidem sobre o valor **efetivamente
cobrado** (184,98), não sobre o `sellPrice`. Refazendo a conta pelo que
de fato entra no caixa:

| | valor |
|---|---|
| Preço cobrado do cliente | R$ 184,98 |
| (−) imposto 6% sobre 184,98 | −R$ 11,10 |
| (−) cartão 4,99% sobre 184,98 | −R$ 9,23 |
| **Líquido recebido** | **R$ 164,65** |
| (−) custo direto | −R$ 100,00 |
| **Lucro real** | **R$ 64,65** |

Margem real: **39,27%**, não os 40% pedidos. O erro é pequeno por peça e
cresce com o volume — e aumenta quanto maiores forem as taxas.

**Os 17 produtos cadastrados hoje usam este modo.**

---

## 🔴 2. Os dois modos discordam no mesmo produto

`computeBatchProduct` faz o certo: joga tudo no divisor.

```ts
const divisor = 1 - (operationalRate + taxRate + paymentRate + profitRate);
const rawFinal = directCost / divisor;
```

Mesmo custo, mesma margem, mesmas taxas:

| Modo | Preço final | Lucro real | Margem real |
|---|---|---|---|
| `unit` | R$ 184,98 | R$ 64,65 | 39,27% |
| `batch` | R$ 204,04 | R$ 81,62 | 44,94% |

**R$ 19,06 de diferença — 10,3%** no mesmo produto, dependendo de qual
modo o operador escolheu. Nenhum dos dois entrega 40%: o `unit` fica
abaixo, e o `batch` fica acima porque `profitRate` no divisor significa
"lucro sobre a receita", não "sobre o custo".

Não dá para dizer que um está certo e o outro errado sem saber a intenção
comercial. O que é indefensável é **os dois discordarem**.

---

## 🟠 3. Folhas: perda e acerto de máquina não somam

```ts
const sheetsByWaste = Math.ceil(baseSheets * (1 + wastePercent));
const sheetsBySetup = baseSheets + setupSheets;
const finalSheets  = Math.max(sheetsByWaste, sheetsBySetup);   // MAIOR, não soma
```

Tiragem de 1000 peças, 4 por folha, perda 5%, acerto de 10 folhas:

```
base ......... 250 folhas
+ perda 5% ... 263
+ acerto ..... 260
sistema cobra  263   ← pega o maior
operação real  273   ← 250 + 13 de perda + 10 de acerto
```

São 10 folhas não cobradas. Em tiragem pequena o efeito inverte e piora:
100 peças → perda calculada em 27 folhas é **descartada** porque o setup
(35) é maior; a perda sobre as folhas de acerto some.

O comentário do código diz "aplica maior entre perda percentual e setup",
então é intencional — mas não descreve o que acontece na máquina: são
custos independentes, o acerto acontece **e** a tiragem tem refugo.

---

## 🟠 4. `roundCommercialPrice` devolve lixo de ponto flutuante

```
round(1.15, 0.1)  →  1.2000000000000002
round(0.07, 0.05) →  0.1
```

`Math.ceil(v/step)*step` reintroduz erro binário. No modo batch o valor
é salvo com `round2`, então o banco fica limpo — mas o número sujo
circula em `unitPrice`, no `breakdown` (que é exibido ao cliente) e em
qualquer soma feita antes de gravar.

---

## ✅ Verificado e correto

| Item | Situação |
|---|---|
| Margem ≥ 100% | clamp em 0,99 evita divisão por zero |
| Margem negativa | clamp em 0 |
| `divisor <= 0.01` no batch | retorna `valid:false` com mensagem clara, e `products.ts` **respeita** a flag (422) |
| Cobertura de tinta / área | `coverageFactor` e `areaFactor` aplicados de forma coerente |
| Separação colorant × mechanical | correta: só o colorante escala com cobertura |
| `printCostOverride` do formato | curto-circuita o cálculo, respeitando multiplicador da impressora |
| Peças por folha | `Math.ceil` — nunca fraciona folha |
| Modos de cobrança de acabamento | 6 modos (lote, peça, folha, kit, metro, m²) coerentes |
| Produtos com preço ≤ custo | nenhum nos 17 cadastrados |

---

## O que precisa de decisão sua

Os itens 1 e 2 **não são bug de digitação, são definição comercial**. Não
vou escolher por você:

**a) O que "margem de 40%" significa na sua gráfica?**
- *Sobre a receita* (padrão contábil): de cada R$ 100 recebidos, R$ 40
  sobram depois de custo, imposto e taxa. É o que o `batch` faz.
- *Sobre o custo* (markup): custo R$ 100 → lucro R$ 40, e imposto/taxa
  entram além disso.

**b) Imposto e maquininha devem estar embutidos no preço?**
Se a resposta for sim (recomendado — é o que garante o lucro), os dois
modos passam a usar o mesmo divisor e o item 1 se resolve junto.

**c) Perda e acerto devem somar?**
Minha leitura de produção é que sim. Mas se hoje vocês calibram o
percentual de perda já contando o acerto, somar passaria a cobrar duas
vezes.

⚠️ **Atenção:** corrigir 1 e 2 **muda o preço de todos os produtos**. Com
as taxas atuais, unificar no divisor sobe o preço em ~10%. É decisão de
negócio, não de código — por isso parei aqui em vez de aplicar.
