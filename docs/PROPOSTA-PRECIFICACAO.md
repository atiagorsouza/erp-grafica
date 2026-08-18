# Proposta de precificação — respostas às 3 decisões

Baseado nas suas respostas. Cada número aqui foi calculado, não estimado.

---

## Decisão 1 — margem de 40% é o **mínimo**

Sua resposta: *"é a margem mínima, podendo ter margens maiores"*.

Isso define a regra: o preço calculado é o **piso**. O sistema deve
garantir que nenhuma venda caia abaixo disso, e deixar você subir à
vontade acima.

**Consequência prática:** o motor precisa embutir o **pior cenário de
pagamento**. Se calcular pelo melhor caso (PIX), toda venda no cartão
fura o mínimo.

---

## Decisão 2 — imposto e maquininha embutidos + 3x sem juros

Você levantou três coisas: vai passar a pagar imposto, PIX não tem taxa,
e quer 3x sem juros acima de R$ 100 — mas não sabe se compensa.

### Quanto custa cada forma de pagamento (InfinitePay, faixa até R$ 20 mil/mês)

| Forma | Taxa | Numa venda de R$ 100 |
|---|---|---|
| PIX | **0%** | R$ 0,00 |
| Débito | 1,37% | R$ 1,37 |
| Crédito à vista | 3,15% | R$ 3,15 |
| **3x sem juros** | **6,12%** | **R$ 6,12** |

Fonte: tabela pública da InfinitePay para faturamento até R$ 20 mil/mês.
Se você já fatura acima disso, as taxas caem (3x vai a 4,83%) e a conta
melhora — vale conferir sua faixa no app.

**Oferecer 3x custa 2,97 pontos percentuais a mais que o crédito à
vista.** Não é o parcelamento inteiro que pesa: é essa diferença.

### "Dizer ao cliente que tem juros do cartão" — você mesmo disse que é errado

E é, por dois motivos. Legalmente, desde 2022 é permitido cobrar
diferente por forma de pagamento, mas o preço tem que estar **informado**
— cobrar surpresa no fechamento é problema no Procon. Comercialmente, o
cliente sente que está sendo punido por pagar como pode.

O caminho correto inverte a lógica: **embute o pior caso no preço de
tabela e oferece desconto no PIX.** O cliente ouve "tem desconto à vista"
em vez de "tem acréscimo no cartão". Mesmo dinheiro, percepção oposta.

### A conta, com custo direto de R$ 100 e margem mínima de 40%

Preço de tabela embutindo **3x + imposto 6%**:

```
preço = 100 / (1 − 0,40 − 0,0612 − 0,06) = R$ 208,86
```

| Cliente paga em | Taxa | Imposto | Sobra p/ empresa | Lucro | Margem |
|---|---|---|---|---|---|
| PIX | R$ 0,00 | R$ 12,53 | R$ 196,32 | R$ 96,32 | **46,1%** |
| Débito | R$ 2,86 | R$ 12,53 | R$ 193,46 | R$ 93,46 | 44,8% |
| Crédito 1x | R$ 6,58 | R$ 12,53 | R$ 189,75 | R$ 89,75 | 43,0% |
| **3x sem juros** | R$ 12,78 | R$ 12,53 | R$ 183,54 | R$ 83,54 | **40,0%** |

**No pior caso a margem bate exatamente os 40% mínimos.** Qualquer forma
melhor que 3x é lucro acima do piso — é daí que sai o desconto do PIX.

### Resposta direta: vale a pena o 3x sem juros?

**Vale, desde que o preço embuta o custo.** Você tem R$ 12,78 de folga
por venda de R$ 208 entre o PIX e o 3x. O que **não** vale é oferecer 3x
sobre um preço calculado para PIX — aí os 6,12% saem do seu lucro.

Sobre o **limiar de R$ 100**: faz sentido, mas o motivo não é o custo
(que é proporcional). É a parcela mínima. Em R$ 100, cada parcela fica em
R$ 33 — abaixo disso o parcelamento vira burocracia sem benefício real
para o cliente. **Sugiro R$ 150 como piso** (parcela de R$ 50), que é a
prática comum no varejo.

### O que proponho implementar

1. **Campo "custo de pagamento embutido"** no painel, com padrão 6,12% —
   o pior caso que você aceita oferecer. Fica visível e editável, porque
   sua faixa na InfinitePay muda com o faturamento.
2. **Preço de tabela único**, calculado com o divisor incluindo esse
   custo + imposto + margem mínima.
3. **Desconto configurável no PIX**, sugerido igual à taxa embutida.
4. **Painel "vale a pena parcelar?"** no PDV: ao escolher a forma, mostra
   a margem real daquela venda. Responde sua pergunta caso a caso.
5. **Trava de piso**: se um desconto derrubar a margem abaixo do mínimo,
   avisa antes de fechar.

---

## Decisão 3 — perda e acerto de máquina

Sua resposta: *"nunca fiz essa contabilidade, mas creio que seja
importante"*.

É, e a boa notícia é que são coisas diferentes e fáceis de separar:

- **Acerto (setup)** — folhas queimadas até a cor entrar no registro.
  Quantidade **fixa por serviço**, não importa se a tiragem é 100 ou
  10.000. Depende da máquina.
- **Perda (refugo)** — folhas perdidas ao longo da tiragem: puxada dupla,
  corte torto, acabamento. É **proporcional** ao volume.

Hoje o sistema pega o **maior** entre os dois, o que não corresponde a
nada que acontece na máquina. O correto é somar:

```
folhas = base + acerto_fixo + (base × perda%)
```

Tiragem de 1.000 peças, 4 por folha, acerto 10 folhas, perda 5%:

| | folhas |
|---|---|
| Base (1000 ÷ 4) | 250 |
| + acerto | 10 |
| + perda 5% | 13 |
| **Total correto** | **273** |
| Sistema cobra hoje | 263 |

São 10 folhas por serviço saindo do seu bolso.

**Como descobrir seus números reais:** por uma semana, anote quantas
folhas você queima até acertar a cor em cada trabalho — essa média é seu
setup. Para a perda, compare o papel que entrou com as peças boas que
saíram. Enquanto não tiver os dados, sugiro começar com **acerto de 5 a
10 folhas** e **perda de 3%**, que são valores conservadores para
digital.

---

## ⚠️ Impacto antes de aplicar

Com custo de R$ 100 e margem de 40%:

| | preço |
|---|---|
| Hoje (modo unitário) | R$ 184,98 |
| Proposto | R$ 208,86 |
| **Diferença** | **+12,9%** |

O aumento não é margem nova — é **custo que hoje você paga sem saber**:
6% de imposto que vai começar a incidir e 6,12% de maquininha que sai do
seu lucro quando o cliente parcela.

**Antes de aplicar em todos os produtos, sugiro simular** com 3 ou 4
itens que você conhece bem, comparar com o que a concorrência cobra, e
só então rodar em lote.

---

# IMPLEMENTADO (v3.27.0)

Aplicado com os padrões conservadores, **todos editáveis** em
`/configuracoes` → Tributação e taxas.

| Configuração | Padrão | Onde muda |
|---|---|---|
| Custo de pagamento embutido | **6,12%** (3x, faixa até R$ 20 mil/mês) | `pricing_payment_cost` |
| Desconto à vista no PIX | **6,12%** | `pricing_pix_discount` |
| Mínimo para parcelar | **R$ 150** | `pricing_installment_min` |
| Máximo de parcelas sem juros | **3x** | `pricing_installment_max` |
| Margem mínima (piso) | **40%** | `pricing_min_margin` |
| Imposto | **6%** (já existia) | `tax_rate` |

> Se seu faturamento passar de R$ 20 mil/mês, a taxa de 3x cai para
> 4,83% — troque `pricing_payment_cost` e os preços caem junto.
> Se ainda não recolhe imposto, ponha `tax_rate` em 0 por enquanto.

## O que mudou no motor

**1. Modo unitário unificado no divisor.** Imposto e custo de pagamento
deixaram de ser somados por fora. Os dois modos agora dão o mesmo preço:

```
antes:  unit R$ 184,98  ·  batch R$ 204,04   (10,3% de diferença)
agora:  unit R$ 208,86  ·  batch R$ 208,86   (idênticos)
```

Conferido: com custo R$ 100 e margem 40%, sobram exatamente **40,00%**
depois de imposto e taxa do 3x — o piso é real, não aproximado.

**2. Acerto e refugo somam.** `Math.max` virou soma, com o refugo
incidindo sobre as folhas rodadas (que incluem as de acerto):

```
1000 peças, 4/folha, acerto 10, perda 5%
antes: 263 folhas    agora: 273 folhas
tiragem pequena (100 peças): antes 35 (refugo descartado), agora 37
```

**3. Análise de forma de pagamento** (`src/lib/payment-analysis.ts`) —
responde "vale a pena 3x?" com número. Para o preço de R$ 208,86:

| Forma | Cliente paga | Parcela | Sobra | Margem |
|---|---|---|---|---|
| PIX (−6,12%) | R$ 196,08 | — | R$ 184,31 | 43,0% |
| Débito | R$ 208,86 | — | R$ 193,47 | 44,8% |
| Crédito à vista | R$ 208,86 | — | R$ 189,75 | 43,0% |
| Crédito 2x | R$ 208,86 | R$ 104,43 | R$ 185,07 | 40,7% |
| **Crédito 3x** | R$ 208,86 | R$ 69,62 | R$ 183,55 | **40,0%** |

Nenhuma forma fura o piso, e o PIX ainda sai mais barato para o cliente.

**4. Simulador** — `node scripts/simular-precos.mjs` lista preço atual vs
novo de cada produto **sem gravar nada**.

## Validação

- `typecheck`, `build`, `eslint` — limpos
- `e2e:smoke` — **161 checks** (eram 150). Os 11 novos travam a
  convergência dos modos, a margem real de 40%, a soma acerto+refugo, o
  produto salvo pela API e as regras de parcelamento
- Produtos reais criados e conferidos: cartão de visita (margem 40% →
  **40,0% real**) e adesivo vinil (50% → **50,0% real**)

## Ainda por fazer

O PDV **ainda não exibe** o painel de margem por forma de pagamento nem
aplica o desconto do PIX automaticamente — a biblioteca de cálculo está
pronta e testada, falta plugar na tela. Fica para a próxima rodada.
