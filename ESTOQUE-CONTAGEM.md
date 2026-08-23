# Contagem de estoque — papel e vinil

Importação da conferência física feita pelo dono em **agosto/2026**
(`Planilha_Conferencia_Estoque csv.csv`), 19 itens.

Script: `scripts/importar-estoque-real.mjs`
(`node scripts/importar-estoque-real.mjs` simula; `--aplicar` grava).

## Como o estoque foi lido

A planilha traz `10 pacotes (200 fls)`. Isso significa **200 folhas no
total** — o que sobrou, espalhado em 10 pacotes abertos — e **não**
10 × 200.

A diferença não é pequena: lido errado, o estoque ficaria de 10 a 37
vezes maior, o alerta de reposição nunca dispararia e o valor
imobilizado sairia em dezenas de milhares em vez de R$ 2.071,00.

## Resultado

| | |
|---|---|
| Itens cadastrados | 19 |
| Valor imobilizado em papel | **R$ 2.071,00** |
| Unidade | folha (todos) |

Os três itens mais caros em estoque parado:

| Item | Folhas | R$/folha | Total |
|---|---|---|---|
| Vinil Branco Brilho Laser Super A3 | 100 | 3,44 | R$ 344,00 |
| Vinil Branco Brilho Laser A3 | 100 | 3,22 | R$ 322,00 |
| Vinil Adesivo (Transp. + Branco) A4 | 200 | 1,88 | R$ 376,00 |

Vinil laser sozinho é **R$ 1.042,00** — metade do papel parado.

## Estoque mínimo

Cada item nasceu com mínimo ≈ **25% do contado** (piso de 10 folhas).
É só um ponto de partida para o alerta de reposição não nascer mudo —
**o dono ajusta na tela**, item por item, conforme o giro real.

## Dados de demonstração removidos

Os papéis do seed inicial tinham números chutados e foram removidos:
Papel A4 75g, Papel A4 90g, Chamex A4 75g, Couché 150g A3, Couché 150g
A4, Kraft A3 240g, Sulfite A3 75g e Folha Adesivo Vinil A3+.

Nenhum deles tinha movimentação nem era usado por produto — foi
verificado antes. O script **não apaga** material que tenha histórico
ou que componha a receita de algum produto: nesse caso ele zera o
estoque e marca no nome, porque apagar deixaria lançamento órfão e
faria o custo do produto cair para zero sem aviso.

## Pendências para o dono

1. **Conferir os mínimos** em Estoque & Compras → Materiais.
2. **Custo dos rolos de vinil de recorte** (5 m e 10 m) continua
   **zerado** — enquanto estiver assim, o vinil entra como grátis no
   orçamento. Preencher o valor do rolo; o custo por metro sai sozinho.
3. Definir **fornecedor** de cada item, agora que o cadastro de
   fornecedor tem endereço completo.
