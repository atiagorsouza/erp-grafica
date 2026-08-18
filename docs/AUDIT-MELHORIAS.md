# Dívidas técnicas e melhorias (v3.25.0)

Fechamento das três dívidas registradas ao fim da auditoria de Estoque,
mais o que a varredura encontrou no caminho.

## 1. `PosCompany` estava declarado **três** vezes

O registro anterior dizia "duas". Eram três: `PosClient.tsx`,
`OrdersClient.tsx` e `QuotesClient.tsx` — com listas de campos quase
iguais, divergindo só em `receiptFooter`.

Foi exatamente essa duplicação que fez a inscrição estadual da v3.23.0
entrar em uma cópia só: a IE aparecia no cupom do PDV e sumia na OS.

**Correção:** tipo único em `src/lib/company.ts` (`CompanyIdentity`, com
alias `PosCompany` para não quebrar imports). Os três módulos passaram a
reexportar do módulo central.

**Prova de que resolve:** adicionei um campo obrigatório temporário ao
tipo único e rodei o typecheck — as **3 páginas** (`pdv`, `pedidos`,
`orcamentos`) acusaram erro. Antes, um campo novo passaria despercebido
em duas delas.

## 2. `PrintDocument.tsx` removido

284 linhas que nenhum arquivo importava. Já havia custado uma correção
inócua: o bloco fiscal PJ e o conserto do `mobilePhone` da v3.21.0
foram aplicados nele e nunca chegaram ao papel.

Verificado que os estilos (`@page`, `.doc-box`, `.field-label`) eram
autocontidos e não usados em nenhum outro lugar. Removido via `git rm`
— o histórico preserva o arquivo se algum dia servir de referência.

## 3. Aniversariantes no painel

`birthDate` era coletado desde a v3.21.0 e só existia na ficha
individual. Ninguém abre 300 fichas para descobrir quem faz aniversário,
então o dado não gerava nenhuma ação. Numa gráfica, aniversário é gancho
comercial concreto.

Novo card **"Aniversariantes da semana"** no painel inicial: próximos 7
dias, no máximo 6 nomes, "hoje" destacado.

Regras que valem registrar:
- **respeita o opt-out** — quem recusou WhatsApp aparece marcado como
  "sem contato para envio", em vez de virar alvo de campanha
- **ignora inativos e bloqueados**
- ordena por proximidade da data

## 4. Bug de fuso encontrado durante o teste (bônus)

O primeiro teste do card falhou: o aniversariante de hoje não apareceu.
Não era o card — o container roda em **UTC** e já eram 00:01 de 18/08,
enquanto no Brasil ainda era 17/08.

O projeto já tinha `todayISO()` resolvendo isso em `lib/period.ts`; três
pontos não usavam:

| Local | Efeito |
|---|---|
| `queries.ts` (card novo) | aniversariante do dia sumia do painel depois das 21h |
| `documents.ts:36` | **numeração de documentos**: entre 21h e meia-noite de 31/12, geraria `ORC-2027-0001` com a gráfica ainda em 2026 |
| `ClientsClient.tsx` | selo "Aniversário hoje" acendia/apagava na hora errada |

O de `documents.ts` é o mais sério: numeração fiscal fora de sequência.
`nextDocumentNumber` está na lista de "não modificar", mas a mudança é
de **fuso**, não da lógica de numeração — o contador e o formato
continuam idênticos. Verificado após a correção: `ORC-2026-0051`, com
`document_counters.year = 2026`.

## Validação

- `typecheck`, `build`, `eslint` (9 arquivos) — limpos
- `e2e:smoke` — **140 checks** (eram 135). Os 5 novos cobrem o card:
  presença, aniversariante de hoje, exclusão de inativo, exclusão de
  data fora da janela e marcação de opt-out
- O teste do smoke calcula as datas no fuso da loja: se usasse o relógio
  do container, começaria a falhar sozinho de madrugada
