# Lona e Adesivo — preços do fornecedor (do áudio)

Cadastrado em 18/08/2026. Substituiu as 2 linhas antigas
(Lona 440g 45/89 e Vinil adesivo 45/95), que estavam erradas.

---

## O que ficou no sistema

| Linha | Custo/m² | Venda/m² | Piso custo | Piso venda |
|---|---|---|---|---|
| Lona e Banner | 35,00 | **75,00** | 26,00 | **55,00** |
| Adesivo vinil | 31,00 | **65,00** | 20,00 | **45,00** |
| Adesivo vinil com recorte | 40,00 | **85,00** | 30,00 | **65,00** |
| Adesivo com recorte e máscara | 50,00 | **105,00** | 37,00 | **80,00** |

Os custos são os do áudio. **As vendas eu calculei** — o áudio só trazia
o que você paga.

---

## Como cheguei nos preços de venda

Usei a mesma fórmula que o resto do sistema:

```
venda = custo / (1 − margem 40% − imposto 6% − pagamento 6,12%)
      = custo / 0,4788
```

E arredondei para múltiplo de R$ 5, porque é preço que você fala ao
telefone — "setenta e cinco o metro" sai melhor que "setenta e três e
dez".

| Linha | Cálculo puro | Arredondado | Margem real |
|---|---|---|---|
| Lona | 73,10 | **75,00** | 41% |
| Vinil | 64,75 | **65,00** | 40% |
| Recorte | 83,54 | **85,00** | 41% |
| Máscara | 104,43 | **105,00** | 40% |

O arredondamento só ajuda — nenhuma linha ficou abaixo dos 40% de
margem mínima que você configurou.

**Se algum desses preços estiver fora do praticado no seu mercado, me
diz o valor que você cobra e eu ajusto.** Preço de venda é decisão sua;
eu só apliquei a fórmula.

---

## O piso é o que protege as peças pequenas

Sem piso, um adesivo de 30×30 cm (0,09 m²) sairia por **R$ 5,85**. Não
paga o atendimento, o arquivo, o recorte nem o tempo de balcão.

Com piso, qualquer peça abaixo de ~85×85 cm cobra o valor mínimo:

| Peça | Área | Venda (vinil) | Custo | Lucro |
|---|---|---|---|---|
| 20×20 | 0,04 m² | 45,00 (piso) | 20,00 | 19,55 |
| 30×30 | 0,09 m² | 45,00 (piso) | 20,00 | 19,55 |
| 50×70 | 0,35 m² | 45,00 (piso) | 20,00 | 19,55 |
| 1 m² | 1,00 m² | 65,00 | 31,00 | 26,12 |
| Banner 100×200 | 2,00 m² | 130,00 | 62,00 | 52,24 |

### Onde o piso deixa de valer

| Linha | Vira em | Equivale a |
|---|---|---|
| Lona | 0,73 m² | ~86×86 cm |
| Vinil | 0,69 m² | ~83×83 cm |
| Recorte | 0,76 m² | ~87×87 cm |
| Máscara | 0,76 m² | ~87×87 cm |

Ou seja: **quase tudo abaixo de 85×85 cm sai pelo preço mínimo.** Isso é
proposital e está certo — é o que impede o serviço pequeno de dar
prejuízo.

---

## Uma observação sobre as 4 linhas

Elas são **serviços distintos**, não variações do mesmo material:

- **Lona e Banner** — impressão em lona, com acabamento de bainha/ilhós
- **Adesivo vinil** — impressão em vinil, entregue em folha
- **com recorte** — mais o recorte eletrônico do contorno
- **com recorte e máscara** — mais a fita de transferência, que leva o
  desenho recortado para a parede ou vidro

Cada etapa a mais tem preço fechado, e você confirmou que os R$ 50 da
máscara já incluem tudo.

Na hora do orçamento, o operador escolhe a linha certa. Vale conferir se
os nomes ficaram claros o suficiente para quem for atender — se preferir
outra nomenclatura, é só me dizer.

---

## Detalhe técnico

Como a VTDIGITAL **não tem plotter de grande formato** (o parque é
Konica, Epson, Genesis, Elgin, Silhouette e Bambu), esses quatro itens
são terceirizados. Por isso entram como tabela de preço com custo do
fornecedor, e não pelo motor de impressão — que calcularia consumo de
tinta e desgaste de máquina que aqui não existem.

Está no seed permanente (`scripts/seed-tabelas-precos.mjs`), então
sobrevive a reinstalação.
