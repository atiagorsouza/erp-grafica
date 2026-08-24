# Rabisco — Tabela de Preços

Desenho antes de programar. Baseado no PDF da Parede Print que você
mandou.

---

## Primeiro: não travou nada

Você suspeitou do workspace. Não é isso:

| | |
|---|---|
| Espaço usado | **112 MB** de 25 GB (18%) |
| Itens na raiz | 13 |
| Último commit | `6665cba`, tudo salvo |

O que atrapalha é outra coisa: o ambiente onde eu trabalho **reinicia
sozinho** e eu preciso reinstalar tudo antes de cada comando. Já
aconteceu umas quinze vezes hoje. Não perde trabalho, mas custa
tempo.

---

## O que o PDF da Parede Print acerta

Estudei o layout. **Um metro por oitenta centímetros**, feito para
imprimir e colar na parede. O que ele faz bem:

1. **Tudo numa folha só.** O atendente não vira página nem rola tela.
2. **Colunas por técnica** — digital, plotter, inkjet, laser, scanner.
3. **Faixas de quantidade visíveis** — 1 / 10 / 50 / 100 / 1000.
4. **Lista de "o que fazemos"** na lateral: apostilas, banners,
   cartões, crachás… serve de cardápio mesmo sem preço.

O que eu **não** copiaria: os R$ 0,00 em tudo. A tabela dele está
vazia — é um modelo em branco.

---

## O que eu sugiro (e por quê)

### Três versões, não uma

Você disse: *"não para qualquer cliente, uso interno também"*. Então
não pode ser um arquivo só.

| Versão | Para quem | O que mostra |
|---|---|---|
| **Balcão** | pendurada na parede | preço final, sem custo |
| **Cliente** | PDF enviado por WhatsApp | preço final + faixas |
| **Interna** | só você | **custo, margem e lucro** |

A interna é a que ninguém pode ver. É onde você olha antes de dar
desconto.

### Tamanhos

Você pediu A3 deitado e A4 deitado. Concordo, com um ajuste:

| Formato | Uso |
|---|---|
| **A3 deitado** | parede da loja — lê de longe |
| **A4 deitado** | balcão, prancheta, mochila do vendedor |
| **A4 em pé** | anexo de e-mail e WhatsApp (celular rola melhor) |

O de parede não precisa de um metro como o da Parede Print. **A3 já
resolve** — e você imprime na própria Konica, sem terceirizar.

---

## Tela 1 — Onde se monta

```
 TABELA DE PREÇOS                                    [ Gerar PDF ]

 Versão:  ( ) Balcão   ( ) Cliente   (•) Interna ⚠️
 Formato: ( ) A3 deitado   (•) A4 deitado   ( ) A4 em pé

 ┌── O que entra ────────────────────────────────────┐
 │ [x] Cópias e impressões        3 itens            │
 │ [x] Encadernação               3 itens            │
 │ [x] Adesivos                   9 itens            │
 │ [x] Agendas e cadernos         1 item             │
 │ [ ] Fotografia                 0 itens (vazio)    │
 │ [ ] Brindes                    0 itens (vazio)    │
 └───────────────────────────────────────────────────┘

 ┌── Rodapé ─────────────────────────────────────────┐
 │ Validade:     [ 30 ] dias                         │
 │ Observação:   [ Preços sujeitos a alteração    ]  │
 └───────────────────────────────────────────────────┘

              Prévia ao lado, atualiza sozinha →
```

Categoria vazia aparece **desmarcada e cinza** — você vê que existe,
mas ela não entra no PDF.

---

## Tela 2 — Como sai (versão Cliente, A4 deitado)

```
┌──────────────────────────────────────────────────────────────┐
│  VTDIGITAL ART STUDIO          TABELA DE PREÇOS   ago/2026   │
│  (21) 2038-3504                                              │
├───────────────────────────────┬──────────────────────────────┤
│  CÓPIAS E IMPRESSÕES          │  ADESIVOS                    │
│                               │  cartela com vários adesivos │
│  A4 Preto e branco            │                              │
│    1 un ........... R$ 1,00   │  Redondo 30mm  40 un  12,90  │
│   10 un ........... R$ 0,90   │  Redondo 40mm  24 un  12,90  │
│   50 un ........... R$ 0,70   │  Redondo 50mm  15 un  12,90  │
│  100 un ........... R$ 0,60   │  Redondo 60mm   8 un  12,90  │
│  300 un ........... R$ 0,50   │  Quadrado 30mm 40 un  12,90  │
│                               │  ...                         │
│  A4 Colorida                  │                              │
│    1 un ........... R$ 1,50   │  2 cartelas ....... R$ 23,50 │
│   10 un ........... R$ 1,35   │  5 cartelas ....... R$ 53,00 │
│   50 un ........... R$ 1,05   │  10 cartelas ...... R$ 95,00 │
│  100 un ........... R$ 0,95   │                              │
├───────────────────────────────┼──────────────────────────────┤
│  ENCADERNAÇÃO                 │  AGENDAS                     │
│  cliente traz o impresso      │                              │
│                               │  A5 capa dura 186 fl         │
│  até  50 folhas ... R$ 3,50   │    1 un ......... R$ 46,90   │
│  até  70 folhas ... R$ 3,50   │   10 un ......... R$ 42,90   │
│  até 100 folhas ... R$ 4,50   │   50 un ......... R$ 34,90   │
│                               │  100 un ......... R$ 32,90   │
│  Capa PVC+PP ...... R$ 4,00   │                              │
├───────────────────────────────┴──────────────────────────────┤
│  Válido até 23/09/2026 · Preços sujeitos a alteração         │
└──────────────────────────────────────────────────────────────┘
```

---

## Tela 3 — A versão INTERNA (a que importa)

Mesma tabela, três colunas a mais:

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠️  USO INTERNO — NÃO ENVIAR AO CLIENTE                     │
├────────────────────────┬────────┬────────┬────────┬──────────┤
│  Produto               │  Custo │  Venda │ Margem │  Piso    │
├────────────────────────┼────────┼────────┼────────┼──────────┤
│  Cópia A4 P&B     1 un │   0,08 │   1,00 │   92%  │   0,40   │
│  Cópia A4 P&B   300 un │   0,08 │   0,50 │   84%  │   0,40   │
│  Cópia A4 cor     1 un │   0,40 │   1,50 │   73%  │   0,90   │
│  Cartela adesivos      │   2,97 │  12,90 │   77%  │   7,50   │
│  Encadernação 50 fl    │   0,23 │   3,50 │   93%  │   1,50   │
│  Agenda A5 186 fl      │  28,01 │  46,90 │   40%  │  40,00 ⚠️│
└────────────────────────┴────────┴────────┴────────┴──────────┘

  ⚠️ Agenda: margem 40%. Não descer de R$ 40,00.
     Durante a reforma (volume baixo) o custo real sobe para
     R$ 37,41 — evitar desconto até normalizar.
```

**A coluna "Piso" é a mais útil.** É até onde você pode negociar sem
estragar o negócio. Sugiro calcular como *o preço que deixa 35% de
margem* — e destacar em vermelho quando o piso estiver perto do preço
de venda, como está na agenda.

---

## O que criar

| Item | Trabalho |
|---|---|
| Tela de montagem com as 3 versões | médio |
| Geração do PDF nos 3 formatos | médio |
| Cálculo do piso por margem-alvo | pequeno |
| Marca d'água "USO INTERNO" | pequeno |
| Botão "enviar por WhatsApp" | pequeno — o motor já existe |

---

## Quatro cuidados

**1. A tabela não pode ser um segundo cadastro.** Ela lê os preços dos
produtos. Se alguém puder digitar preço na tabela, em duas semanas ela
diverge do PDV e ninguém sabe qual está certo.

**2. Data de validade é obrigatória.** Tabela sem validade circula por
anos no WhatsApp do cliente, e ele vai cobrar o preço de 2026 em 2028.

**3. A versão interna precisa ser difícil de enviar por engano.** Marca
d'água em todas as páginas e o arquivo saindo com nome
`INTERNO-nao-enviar-...pdf`.

**4. Categoria vazia não entra.** Hoje só 4 das 8 têm produto. Uma
tabela com "Brindes — em breve" passa impressão de loja incompleta.

---

## O que dá para alimentar hoje

De verdade, com preço real:

| Categoria | Itens | Situação |
|---|---:|---|
| Cópias e impressões | 3 | ✅ com faixas |
| Encadernação | 3 + capas | ✅ |
| Adesivos | 9 | ✅ com faixas por cartela |
| Agendas | 1 | ✅ com faixas |
| Fotografia | 0 | ⚠️ falta cadastrar (10×15 a R$ 2,49) |
| Brindes / Têxtil / 3D | 0 | ⚠️ vazio |

**São 16 produtos.** Dá uma tabela A4 deitado bem preenchida, sem
buracos.

---

## Minha sugestão de ordem

1. **A4 deitado, versão Cliente** — resolve o dia a dia
2. **Versão Interna** — a que te protege no desconto
3. **A3 para a parede** — mesmo conteúdo, fonte maior
4. Botão de enviar por WhatsApp

O passo 1 sozinho já te dá o que mandar quando perguntam "tem tabela?".

---

## Perguntas

1. **A tabela deve mostrar as faixas de quantidade** (1/10/50/100) ou
   só o preço avulso? Faixa ocupa espaço, mas vende volume.
2. **Quer o "cardápio" lateral** como no PDF da Parede Print — a lista
   de tudo que você faz, mesmo sem preço (banners, crachás, DTF)?
3. **A versão interna mostra custo** ou só margem e piso? Custo é mais
   completo, mas se vazar mostra sua estrutura ao concorrente.
4. **Cadastro a foto 10×15 a R$ 2,49** antes de gerar? Você já me deu
   esse preço e ela ficaria fora da tabela.
