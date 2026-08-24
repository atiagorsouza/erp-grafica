# Rabisco — Agenda

Desenho antes de programar, como no Painel do Cliente.

---

## O que já existe

| Peça | Situação |
|---|---|
| Tela `/calendario` | ✅ Existe e funciona |
| Datas comemorativas | ✅ **88 cadastradas** (Dia das Mães, Natal…) |
| Tabela `production_schedules` | ⚠️ **Existe, mas ninguém agenda nada nela** |
| Prazo de entrega do pedido | ✅ Cada pedido tem prazo |
| Kanban | ✅ Mostra em que etapa está |

**O buraco:** hoje o calendário só mostra **datas comemorativas**. É um
almanaque, não uma agenda de trabalho. Ele não sabe que o pedido
PED-2026-0003 vence quinta-feira.

E a `production_schedules` — a tabela feita justamente para agendar
produção — está vazia e sem tela. Foi criada e esquecida.

---

## O que a agenda precisa responder

Três perguntas que você faz todo dia:

1. **O que sai hoje?**
2. **Estou com folga ou apertado esta semana?**
3. **Posso prometer para sexta?**

---

## Tela 1 — Mês

```
 AGENDA                    [ Mês ] Semana  Dia      < Agosto 2026 >

 seg      ter      qua      qui      sex      sáb      dom
                                      1        2        3
                                    ·2 ped   ·1 ped

  4        5        6        7        8        9       10
 ·3 ped   ·1 ped            ·2 ped   ·4 ped
                                     ⚠️ cheio

 11       12       13       14       15       16       17
 ·2 ped            🎂 Dia    ·1 ped   ·3 ped
                   dos Pais
                   (16/08)

 18       19       20       21       22       23       24
                            ·2 ped   ·1 ped   HOJE
                                              ·3 ped

 ─────────────────────────────────────────────────────────
 🟦 pedido a entregar   🎂 data comemorativa   ⚠️ dia cheio
```

**A regra do "dia cheio":** mais de 3 pedidos no mesmo dia acende o
alerta. É o número que dá para tocar sem atropelo — ajustável nas
configurações.

---

## Tela 2 — Dia

Clicando num dia:

```
 ← Sexta, 8 de agosto de 2026                      ⚠️ 4 pedidos

 ┌─────────────────────────────────────────────────────┐
 │ PED-2026-0012   Padaria Trigo de Ouro               │
 │ 500 panfletos A5 coloridos                          │
 │ Produção · falta acabamento          [ ver pedido ] │
 ├─────────────────────────────────────────────────────┤
 │ PED-2026-0014   Camila Duarte                       │
 │ 2 apostilas 120 fl + espiral                        │
 │ Aguardando arte                ⚠️ arte não aprovada │
 ├─────────────────────────────────────────────────────┤
 │ PED-2026-0015   Studio Bella                        │
 │ 100 cartões de visita                               │
 │ Pronto para retirada                     ✅ acabado │
 └─────────────────────────────────────────────────────┘

 🎂 Nenhuma data comemorativa
```

O que importa aqui é a **coluna de situação**: você vê num relance
qual pedido está travado esperando alguma coisa sua.

---

## Tela 3 — Aviso ao prometer prazo

Na hora de fechar um pedido, se o dia escolhido já estiver cheio:

```
 ┌─ Prazo de entrega ──────────────────────────────────┐
 │                                                     │
 │  Entregar em:  [ 08/08/2026 ]                       │
 │                                                     │
 │  ⚠️ Esse dia já tem 4 pedidos                       │
 │     Dias com folga: 11/08 (2) · 12/08 (0)           │
 │                                                     │
 │            [ Manter mesmo assim ]  [ Mudar data ]   │
 └─────────────────────────────────────────────────────┘
```

**Avisa, não bloqueia.** Se você quer se comprometer, o problema é
seu — mas ninguém promete sexta sem saber que sexta já tem quatro.

---

## O que criar

| Item | Trabalho |
|---|---|
| Ligar o calendário aos **pedidos** | pequeno — os dados já existem |
| Visão **mês** com contagem por dia | médio |
| Visão **dia** com a lista | médio |
| Alerta de **dia cheio** | pequeno |
| Aviso ao escolher prazo | pequeno |
| Usar a `production_schedules` | maior — decidir se vale |

---

## Três cuidados

**1. Não transformar em segundo Kanban.** O Kanban responde *"em que
etapa está?"*. A agenda responde *"quando sai?"*. Se a agenda começar a
mostrar etapa, virou Kanban com outra cara e você vai manter os dois.

**2. Data comemorativa é para vender, não para produzir.** As 88 datas
servem para lembrar de fazer campanha *antes* — Dia das Mães precisa de
ação em abril. Sugestão: mostrar a data comemorativa **e um aviso 30
dias antes**.

**3. A `production_schedules` pode não valer a pena.** Ela agenda
*máquina por horário* — "Konica das 14h às 16h". Isso serve para
gráfica com turno e fila. Na sua operação, o prazo do pedido já
resolve. **Minha sugestão: deixar ela de lado por enquanto** e usar só
a data de entrega. Se um dia a Konica virar gargalo, a tabela está lá.

---

## Ordem sugerida

1. Calendário mostrando os **pedidos por data de entrega** ← o que resolve
2. Visão **dia**
3. Alerta de **dia cheio**
4. Aviso na hora de prometer prazo
5. Lembrete de data comemorativa 30 dias antes

O passo 1 sozinho já responde *"o que sai hoje?"*.

---

## Perguntas

1. **Quantos pedidos por dia é "cheio"** para você? Chutei 3.
2. A agenda deve mostrar **pedido entregue/retirado**, ou só o que
   ainda está em aberto?
3. Quer o aviso de **data comemorativa 30 dias antes**, ou acha que
   polui?
4. **Sábado conta** como dia de trabalho na conta de folga?
