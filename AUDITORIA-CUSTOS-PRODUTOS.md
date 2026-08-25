# Auditoria de custo — todos os produtos

Revisão pedida depois do erro da agenda. **15 produtos, 15 com
problema.** Nenhum estava certo.

Todos corrigidos. Mas um deles revelou uma questão maior, que só você
pode decidir — está na seção 4.

---

## 1. O que estava errado

| Produto | Custo gravado | Custo real | O quê |
|---|---:|---:|---|
| 9 adesivos | R$ 5,48 | **R$ 3,03** | somava duas folhas de vinil |
| COP-PB-A4 | R$ 0,00 | **R$ 0,13** | zerado |
| COP-COR-A4 | R$ 0,00 | **R$ 0,46** | zerado |
| ENC-050/070/100 | só o espiral | **+ impressão** | faltava o clique |
| AGE-A5-186 | R$ 21,07 | **R$ 47,75** | faces contadas 2× |

**Nenhum preço de venda mudou.** O que mudou é o custo passar a ser
verdade.

---

## 2. Os adesivos: eu tinha errado para MAIS

O documento dizia R$ 5,48 por folha, somando **duas** folhas de vinil e
**duas** impressões — porque a cartela de teste era frente e verso. Mas
o produto cadastrado usa **uma folha**.

O custo real é **R$ 3,03**, com a impressão chapada (100% de tinta)
corretamente cobrada a R$ 0,7157 — vinte vezes o clique de uma página
de texto.

Sua margem nos adesivos é **melhor** do que o sistema mostrava.

---

## 3. Xerox e encadernação: custo zerado

`COP-PB-A4` e `COP-COR-A4` estavam com **custo zero**. Não quebrava
venda, mas todo relatório de margem mentia — mostrava 100%.

Agora:

| | Custo | Venda | Margem |
|---|---:|---:|---:|
| Cópia P&B | R$ 0,13 | R$ 1,00 | 87% |
| Cópia colorida | R$ 0,46 | R$ 1,50 | 69% |
| Encadernação 50 fl | R$ 0,29 | R$ 3,50 | 92% |

> A cópia colorida ficou em 69%, não nos 92% que calculei antes. A
> diferença é o **custo fixo por página** (próxima seção), que eu não
> tinha incluído. Continua saudável.

---

## 4. A agenda — resolvida com duas correções do dono

Eu tinha errado duas coisas, e o dono corrigiu as duas.

### Erro 1: A5 é meia folha A4

Cadastrei 365 páginas como se fossem 365 cliques A4. Não são:

```
186 folhas A5  =  93 folhas A4 físicas
93 folhas × 2 faces  =  186 CLIQUES A4
```

Cada clique A4 imprime **duas** páginas A5, uma de cada lado da dobra.
186 cliques rendem 372 páginas A5 — os ~365 que você citou.

**Eu tinha posto quase o dobro de cliques.**

### Erro 2: cobertura de 5%, não de 50%

Usei o formato "A4 texto 5%". Mas agenda personalizada é **arte**, não
texto corrido. Com 50% de cobertura o corante custa 10× mais.

Os dois erros andavam em direções opostas e mascaravam um ao outro.

### Erro 3: o volume da Konica

O custo fixo assumia 2.000 páginas/mês. Você informou **15 mil na
operação normal**. Ajustado:

| | Custo fixo/página |
|---|---:|
| antes (2.000 pág/mês) | R$ 0,0575 |
| agora (15.000 pág/mês) | **R$ 0,0050** |

### Resultado

| | |
|---|---:|
| Impressão (186 cliques × R$ 0,0918) | R$ 17,08 |
| Materiais (papel, papelão, adesivo, wire-o, laminação) | R$ 14,11 |
| **CUSTO** | **R$ 28,01** |
| **VENDA** | **R$ 46,90** |
| **MARGEM** | **40%** |

Saiu de margem negativa para 40%, sem mudar o preço.

> ⚠️ **Sobre a reforma.** Você disse que ultimamente imprime 1.000 a
> 2.000 páginas/mês. Adotei 15.000 porque é sua operação normal — a
> reforma é temporária, e precificar por ela deixaria o preço alto o
> ano inteiro.
>
> Só saiba que **enquanto o volume estiver baixo, a margem real é
> menor**: a 2.000 páginas/mês a mesma agenda custa R$ 37,41 (margem
> 20%). Não é motivo para mudar preço, mas é motivo para não dar
> desconto grande agora.

---

## 5. Adesivos: a unidade de venda é a CARTELA

Você corrigiu: *"eu vendo a cartela... o valor unitário tem que ter,
mas para meu controle"*.

Estava errado — o operador tinha de digitar **40** no PDV para vender
uma cartela de 30 mm. Agora:

| No PDV | Antes | Agora |
|---|---|---|
| Vender 1 cartela | digitar 40 | **digitar 1** |
| Preço mostrado | R$ 0,3225 | **R$ 12,90** |

O preço por adesivo continua registrado **na descrição de cada
produto**, como referência de controle:

| Produto | Adesivos/cartela | Por adesivo |
|---|---:|---:|
| ADES-4015 | 60 | R$ 0,2150 |
| ADES-Q30 / R30 | 40 | R$ 0,3225 |
| ADES-Q40 / R40 | 24 | R$ 0,5375 |
| ADES-Q50 / R50 | 15 | R$ 0,8600 |
| ADES-Q60 / R60 | 8 | R$ 1,6125 |

Degraus agora em cartelas: **1 · 2 · 5 · 10 · 25 · 50**
→ R$ 12,90 · 23,50 · 53,00 · 95,00 · 210,00 · 365,00

Margem da cartela: **77%**.

---

## 6. Como ficou tudo

| Produto | Custo | Venda | Margem |
|---|---:|---:|---:|
| Cópia P&B | R$ 0,08 | R$ 1,00 | 92% |
| Cópia colorida | R$ 0,40 | R$ 1,50 | 73% |
| Encadernação 50 fl | R$ 0,23 | R$ 3,50 | 93% |
| Encadernação 70 fl | R$ 0,33 | R$ 3,50 | 91% |
| Encadernação 100 fl | R$ 0,57 | R$ 4,50 | 87% |
| Cartela de adesivos | R$ 2,97 | R$ 12,90 | 77% |
| Agenda A5 186 fl | R$ 28,01 | R$ 46,90 | 40% |

**Auditoria acusa 0 divergências.** Nenhum preço de venda foi alterado
em nenhum momento — só os custos passaram a ser verdade.
