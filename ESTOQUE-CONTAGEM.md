# Contagem de estoque — planilha de agosto/2026

Importação da **segunda versão** da conferência do dono: 26 itens, agora
com código de barras, categoria, preço de embalagem e rendimento.

## Resultado

| | |
|---|---|
| Itens importados | 26 |
| Com código de barras | 17 |
| Valor imobilizado (só estes itens) | **R$ 2.754,04** |

## Como o estoque foi lido

`Estoque Atual` × folhas da embalagem (coluna `Unidade`):

- "10 pacotes" × "Pacote 20 fls" = **200 folhas**
- "1 caixa" × "Caixa 10 resmas" = **5.000 folhas**
- "22,22 pacotes" × "Pacote 9 fls" = **200 folhas**

Confere com a planilha anterior (115g A4 = 200 folhas), o que confirma
a regra.

## Decisões tomadas sem confirmação

Estas foram assumidas para não travar o trabalho. **Conferir depois:**

1. **`Rende Quantas` foi ignorada no cálculo do estoque.** Ela diverge
   de `Unidade` em 9 linhas (ex.: "Pacote 20 fls" com rende 200). A
   leitura que reproduz a planilha antiga é `Estoque × Unidade`, então
   foi essa a usada. `Rende Quantas` parece ser "quantas folhas o preço
   da embalagem cobre" — usada só para conferência.

2. **Papel RC Glossy 260g A6 — a única linha que não fecha.**
   R$ 69,20 ÷ 400 = R$ 0,173, mas a planilha diz R$ 0,346 (o dobro).
   **Mantive R$ 0,346**, o valor que você digitou. Se o certo for
   R$ 0,173, o custo deste item está dobrado.

3. **Duplicata de vinil consolidada.** O "Vinil Adesivo Branco Brilho
   Laser A4" (R$ 1,8800) da importação anterior virou duplicata do novo
   "Adesivo Vinil Branco Brilho Laser Adespan A4" (R$ 1,8756). Os 9
   produtos de adesivo foram repontados para o item novo e a duplicata
   foi removida.

## Efeito nos adesivos

O vinil passou de R$ 1,8800 para **R$ 1,8756** — diferença de menos de
1 centavo por cartela. A margem foi de 57,51% para **57,58%**.
**Nenhum preço mudou**, porque a tabela está ancorada em R$ 12,90.

## Pendências

1. Confirmar as duas leituras acima (`Rende Quantas` e o RC 260g A6).
2. Definir **fornecedor** de cada item.
3. Os rolos de **vinil de recorte** (5 m e 10 m) continuam com custo
   zerado — enquanto isso, entram como grátis no orçamento.
