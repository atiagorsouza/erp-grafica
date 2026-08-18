# Auditoria — Serviços & Acabamentos

Data: 2026-08-18 · Versão: v3.45.1

Módulo nunca auditado até aqui. Testes feitos **com o sistema rodando**,
via HTTP e SQL, não por leitura de código. Dados de teste removidos no
fim.

---

## O que está bom

As validações de entrada são sólidas — melhores do que eu esperava:

| Teste | Resultado |
|---|---|
| Custo negativo em serviço | 400 ✔ |
| Custo negativo em acabamento | 400 ✔ |
| Nome com 1 letra | 400 ✔ |
| Custo absurdo (1e12) | 400 ✔ |
| Serviço válido | 200 ✔ |
| Excluir serviço não usado | 200 ✔ |
| Excluir serviço **em uso** | vira arquivamento, dado preservado ✔ |

O padrão "delete com vínculo vira arquivamento" está igual ao de
Materiais e Clientes. Coerente.

---

## 🔴 1. `estimatedHours` não vira custo nenhum

O campo **Horas estimadas** existe no formulário, é gravado no banco e
aparece na listagem com um "h" do lado. Mas rastreei todos os usos: ele
nunca entra em cálculo algum.

```
src/lib/pricing.ts, seção 5:
  serviceCost = num(input.service.baseCost);   // só isto
```

O usuário cadastra "Arte final — 2 horas", vê o campo aceitar o valor,
e assume que o sistema vai cobrar essas 2 horas. **Não cobra.** Só o
`baseCost` entra na conta.

Isso é pior que um campo faltando, porque parece que funciona.

**Como a v3.39.0 já resolveu isso para impressão:** existe
`printer.hourlyRate` e o cálculo `(machineMinutes / 60) × hourlyRate ×
copies`. O mesmo padrão serve aqui.

**Correção proposta:** uma configuração de valor-hora de mão de obra
(`labor_hourly_rate` em Configurações) e o cálculo
`estimatedHours × labor_hourly_rate` somando ao `serviceCost`, como
linha própria no detalhamento. Com a taxa em 0, nada muda — quem não
usar não é afetado.

**Alternativa mais simples:** se você prefere manter o custo total no
`baseCost`, então o campo Horas deveria ser marcado na tela como
"apenas informativo, não entra no preço". Mentir menos é melhor que
calcular errado.

**Preciso da sua decisão nisto** — envolve saber quanto vale a hora de
trabalho da VTDIGITAL, que é um dado seu, não meu.

---

## 🟠 2. Nome duplicado passa sem aviso

Testado:

```
POST services   {"name":"Aud Corte Laser"}  → 200 (id 1)
POST services   {"name":"Aud Corte Laser"}  → 200 (id 3)   ← mesmo nome
POST finishings {"name":"Aud Laminacao"}    → 200 (id 1)
POST finishings {"name":"Aud Laminacao"}    → 200 (id 2)   ← mesmo nome
```

Dois serviços com nome idêntico e custos diferentes. Na hora de montar
um orçamento, o operador escolhe numa lista onde aparecem dois "Corte
Laser" iguais — e não tem como saber qual é o certo.

Outros módulos já barram isso: Materiais tem SKU único, Clientes tem
documento único, Tabelas de Preços devolve 409 em (tipo + rótulo).
Serviços ficou de fora.

**Correção proposta:** aviso de duplicata (409) em nome, dentro da
mesma categoria. Não índice único no banco — nomes iguais em categorias
diferentes podem ser legítimos ("Corte" em Recorte e em Acabamento).

---

## 🟠 3. Serviço arquivado continua aparecendo para uso

Quando um serviço em uso é "excluído", ele vira arquivado — o que está
certo. Mas o arquivamento é feito **escrevendo a palavra `ARQUIVADO:` no
campo `description`**, e nada filtra por isso.

```sql
select id, name, description from services;
  1 | Aud Corte Laser | ARQUIVADO: Arquivado pelo usuário
```

Resultado: o serviço arquivado continua na lista de seleção do produto e
do orçamento. O operador pode escolher um serviço que foi arquivado
justamente para não ser mais usado.

Além disso, marcar estado dentro de um campo de texto livre é frágil: se
alguém escrever "ARQUIVADO" numa observação legítima, o registro some.

**Correção proposta:** coluna `archived_at timestamp` (nula = ativo), e
as listagens de seleção filtrando por ela. O texto na descrição pode
continuar, como histórico legível.

---

## 🟡 4. Acabamento no modo unidade não tem modo de cobrança

Este eu quase reportei como bug crítico, e estava errado — vale
registrar o porquê.

O modo **tiragem** tem 6 formas de cobrar acabamento: por peça, por
folha, por kit, fixo por lote, por metro, por m². O modo **unidade**
tem uma só: `unitCost × quantity`.

Cheguei a calcular que isso causava um prejuízo de R$ 516 por pedido —
mas essa conta partia da premissa errada de que o modo unidade calcula
um lote. Não calcula: ele devolve o preço de **uma** unidade, e `copies`
significa "vias por unidade", não quantidade vendida.

Então **não há erro de cálculo**. O que há é uma limitação: no modo
unidade não dá para dizer se o acabamento acompanha as vias ou é único
por unidade. Hoje o usuário contorna digitando a quantidade na mão na
linha do acabamento.

**Não proponho mexer agora.** É melhoria, não correção, e o modo unidade
é o menos usado dos dois.

---

## Resumo

| # | Achado | Gravidade | Precisa de decisão sua |
|---|---|---|---|
| 1 | `estimatedHours` não vira custo | 🔴 | **Sim** — valor-hora da mão de obra |
| 2 | Nome duplicado sem aviso | 🟠 | não |
| 3 | Arquivado continua selecionável | 🟠 | não |
| 4 | Modo unidade sem chargeMode | 🟡 | não (melhoria futura) |

Os itens 2 e 3 eu corrijo direto. O item 1 depende de você.
