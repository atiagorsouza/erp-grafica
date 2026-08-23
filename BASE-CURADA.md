# Base curada — substituir a demonstração no servidor

Em vez de apagar item a item no servidor, exporta-se daqui o que presta
e substitui-se tudo de uma vez. É a ideia do dono, e é a mais limpa.

## Os dois arquivos

| Arquivo | O que faz |
|---|---|
| `scripts/exportar-base-curada.mjs` | Gera `base-curada.sql` a partir deste ambiente |
| `scripts/instalar-base-curada.sh` | Instala no servidor, com backup antes |

## O que VAI (445 registros)

Configuração — o que foi montado com cuidado:

| | |
|---|---:|
| Configurações do painel | 124 |
| Categorias e subcategorias | 60 |
| Calendário comercial | 88 |
| Formatos de papel | 24 |
| Consumíveis (tintas, lâmina, base) | 22 |
| Serviços e acabamentos | 13 |
| Tabelas de preço de insumo | 10 |
| Impressoras | 6 |
| Categorias de impressão | 6 |
| **Materiais** (contagem real) | **28** |
| **Produtos** | **9** |
| **Faixas de preço** | **54** |

## O que NÃO vai

Movimento: orçamentos, pedidos, vendas do PDV, lançamentos financeiros,
movimentos de estoque, compras, kanban, leads. Cada instalação tem o
seu histórico.

**Fornecedores de teste ficam de fora.** O smoke cria um a cada rodada;
sem o filtro, 62 registros "E2E Fornecedor 178743…" iriam junto.

## O que o instalador NÃO apaga

**Os clientes.** O script não toca na tabela `customers`. Os clientes do
servidor continuam lá depois da troca.

## Como usar no servidor

Uma linha de cada vez:

```
cd /www/wwwroot/erp-grafica
bash scripts/instalar-base-curada.sh
```

O script:

1. mostra o que existe hoje (clientes, produtos, orçamentos, pedidos);
2. **exige digitar CONFIRMO** — sem isso não faz nada;
3. **grava um backup completo** em `~/backup-antes-base-curada-<data>.sql`;
4. carrega tudo dentro de uma transação — se qualquer linha falhar,
   **nada** é gravado pela metade;
5. mostra como ficou;
6. imprime o comando de volta atrás, caso precise.

Depois: `pm2 restart printflow`

## Teste feito antes de entregar

Criado um banco vazio, aplicado o schema do zero e carregada a base
curada. Resultado:

- 9 produtos, 54 faixas, 28 materiais, 124 configurações
- 0 clientes, 0 orçamentos, 0 pedidos, 0 vendas
- os 9 produtos mantiveram **R$ 12,90 na cartela cheia**
- as sequências de id foram ajustadas (o próximo produto nasce com 689,
  não colide)
- as sete telas principais responderam HTTP 200 com o banco zerado

## Para gerar de novo

Depois de mudar preço ou cadastrar produto aqui:

```
node scripts/exportar-base-curada.mjs
```
