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

## 4. ⚠️ A agenda: o número que precisa da sua decisão

Corrigi dois erros meus no cadastro — as faces contavam duas vezes
(186 × 2 = 372 impressões) e faltava o formato de impressão.

Com o cadastro certo, o sistema calcula **custo de R$ 47,75** para uma
agenda que você vende a **R$ 46,90**.

**Isso daria prejuízo de R$ 0,85 por agenda.**

### Por que isso aparece

Quase todo esse custo é uma linha só:

```
365 impressões × R$ 0,0785 = R$ 28,64
```

E dentro desses R$ 0,0785, **R$ 0,0575 é "custo fixo por página"** —
73% do total. Esse número está no cadastro da Konica e vem de:

> técnico R$ 450 × 2/ano + energia, **dividido por 2.000 páginas/mês**

**Aí está o problema: 2.000 páginas/mês é pouco demais.** Uma única
agenda tem 365 impressões. **Seis agendas por mês já estouram essa
base inteira.**

### O que muda conforme o volume real

| Páginas/mês | Custo da agenda | Margem |
|---:|---:|---:|
| 2.000 (o que está cadastrado) | R$ 35,23 | 25% |
| 4.000 | R$ 28,18 | 40% |
| 6.000 | R$ 25,83 | 45% |
| 8.000 | R$ 24,66 | 47% |
| 12.000 | R$ 23,48 | 50% |

*(a tabela acima já usa o formato "A4 texto 5%", correto para miolo de
agenda; os R$ 47,75 do sistema incluem uma folga adicional de
desperdício)*

**A diferença entre 2.000 e 8.000 páginas é de 22 pontos de margem** na
mesma agenda, pelo mesmo preço.

### O que eu preciso de você

**Quantas páginas a Konica imprime por mês, de verdade?**

O número exato está na própria máquina:
**Utilitário → Contador → Total impresso**

Com esse número eu ajusto o custo fixo e todas as margens do sistema
passam a ser reais. Enquanto isso não vier, o sistema está sendo
**pessimista** — mostra margem menor do que você tem.

> **Importante:** não mexi no custo fixo por conta própria. Chutar
> 8.000 páginas para "melhorar" a margem seria maquiar o sistema. O
> R$ 0,0575 continua lá, e o custo da agenda está gravado como
> R$ 47,75 — feio, mas honesto, até você me dar o número real.

---

## 5. O que fazer com a agenda enquanto isso

Três caminhos. Não escolhi por você:

**a) Pegar o número do contador** — resolve de vez, leva dois minutos
na máquina.

**b) Subir o preço.** Se 2.000 páginas/mês for a realidade, R$ 46,90
está apertado. R$ 59,90 daria 41% de margem mesmo no cenário
pessimista.

**c) Deixar como está.** Você conhece seu bolso melhor que a planilha.
Se as agendas saem e o caixa fecha, o problema é do número cadastrado,
não do seu preço.

**Minha leitura:** provavelmente é (a). Uma gráfica que vende agenda de
186 folhas não imprime 2.000 páginas/mês — imprime muito mais. O custo
fixo cadastrado é de uma operação bem menor que a sua.
