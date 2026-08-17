# Auditoria — propagação dos campos novos (pós v3.21.0)

Pergunta que a auditoria responde: **os campos que passamos a coletar
aparecem em todos os lugares do sistema que pedem por eles?**

Método: para cada campo novo, contar onde ele é *lido* fora do próprio
formulário e do save. Um campo com apenas 2 referências
(`ClientsClient.tsx` ×2 = o input + o `saveCustomer`) é um campo que o
usuário digita e nunca mais vê.

## Placar

| Campo | Refs fora do form | Situação |
|---|---|---|
| `rgIssuer` | 0 | ❌ só entra, nunca aparece |
| `maritalStatus` | 0 | ❌ só entra, nunca aparece |
| `companySize` | 0 | ❌ só entra, nunca aparece |
| `foundedAt` | 0 | ❌ só entra, nunca aparece |
| `whatsappOptOut` | 0 | ❌ **coletado e ignorado** |
| `origin` | 0 (as outras 16 refs são homônimas) | ❌ nenhum relatório usa |
| `stateRegistration` | 1 (`PrintDocument`) | ⚠️ falta no A4 de orçamento |
| `municipalRegistration` | 1 (`PrintDocument`) | ⚠️ idem |
| `contactName` | 2 reais (`PosClient`, `PrintDocument`) | ⚠️ falta no A4 de orçamento |

> As 16 refs de `origin` e as de `contactName` em `StockClient`/`stock.ts`
> são homônimos sem relação com cliente (origem de movimentação de
> estoque, contato do fornecedor). Conferido um a um.

## Achados

### 1. `whatsappOptOut` é coletado e ignorado — o mais grave

O checkbox "não enviar WhatsApp" grava no banco e **nenhum dos dois
botões de envio consulta o campo**:

- `OrdersClient.tsx:1263` — envia a OS para `c.whatsapp || c.phone`
- `PosClient.tsx:1692` — envia o cupom para `receipt.customer?.whatsapp`

O operador marca a opção a pedido do cliente, o sistema aceita, e o
próximo clique manda a mensagem assim mesmo. É pior do que não ter o
campo: cria uma promessa que o software quebra. Com a LGPD no meio, uma
preferência de contato registrada e desrespeitada é exposição real.

### 2. A ficha 360° não mostra nada do que foi digitado

O drawer exibe telefone, e-mail, cidade, LTV, documentos e endereço.
Não exibe RG, órgão emissor, nascimento, estado civil, porte, fundação,
IE, IM, origem nem o contato PJ. Quem cadastrou precisa clicar em
"Editar" e abrir o formulário para conferir o que gravou.

Faltam também dois usos práticos que os campos habilitam:
- **aniversário do cliente** (`birthDate`) — nenhum aviso, nenhuma lista
- **selo de opt-out** — o operador não vê que aquele cliente recusou WhatsApp

### 3. Orçamento em A4 tem menos dados fiscais que a OS

`PrintDocument.tsx` ganhou o bloco PJ (razão social, IE, IM, A/C) na
v3.21.0, mas `QuotesClient.tsx:1082` continua com os 4 campos antigos:
cliente, CPF/CNPJ, contato e e-mail. Sem IE nem endereço. Dois documentos
que saem da mesma gráfica para o mesmo cliente, com dados diferentes.

### 4. Lista e busca não alcançam os campos novos

- **Filtro local** (`ClientsClient.tsx:109`) procura em nome, fantasia,
  documento, e-mail e telefone. Não acha por IE nem por RG.
- **Busca global** (`api/search/route.ts:15`) procura nome, fantasia e
  documento. Idem.
- **Sem filtro por origem** — o campo existe para responder "de onde vêm
  meus clientes?" e não há nenhuma tela que agrupe por ele.

### 5. Coluna "Contato" da lista ignora o opt-out

`ClientsClient.tsx:344` mostra telefone/WhatsApp sem qualquer marca de
que o cliente pediu para não receber mensagem.

## Fora de escopo (verificado, está correto)

- **PDV, Pedidos, Orçamentos** carregam cliente com `select()` sem
  projeção — os campos novos já chegam à tela, é só questão de exibir.
- **Cupom 80 mm** já traz fantasia, razão social e A/C (v3.21.0).
- **`openPhone`** abre o discador, não é canal de mensagem: opt-out de
  WhatsApp não deve bloquear uma ligação.

---

## Correções aplicadas (v3.22.0)

| # | Achado | Correção |
|---|---|---|
| 1 | `whatsappOptOut` coletado e ignorado | `isWhatsAppBlocked` / `whatsappNumber` em `validators.ts` — **regra única** consumida por PDV e Pedidos. Bloqueado, o link abre sem destinatário e um toast avisa o operador |
| 1b | PDV nem recebia o campo | `(app)/pdv/page.tsx` projetava cliente coluna a coluna e recortava `contactName` e `whatsappOptOut` — ambos adicionados |
| 2 | Ficha 360° não mostrava nada do que foi digitado | bloco **Dados cadastrais**, com linhas condicionais por PF/PJ (RG+órgão, nascimento **com idade**, estado civil / IE, IM, regime, porte, fundação, contato) + origem e limite |
| 2b | Sem sinal de opt-out nem de aniversário | selos **"Não enviar WhatsApp"** (âmbar) e **"Aniversário hoje"** (verde) no cabeçalho da ficha |
| 3 | A4 do orçamento mais pobre que a OS | bloco fiscal PJ (razão social, IE, IM, A/C) + endereço com complemento e CEP |
| 4 | Busca não alcançava os campos novos | filtro local inclui WhatsApp, IE, IM, RG e contato; **busca global** (`/api/search`) inclui IE, IM e contato |
| 4b | Sem filtro por origem | seletor "Todas as origens" na carteira, listando só as origens em uso, **com contagem**, ordenadas por frequência |
| 5 | Lista não avisava do opt-out | marca **"sem zap"** na coluna Contato |

### Decisão deliberada

Opt-out **não bloqueia o botão "Ligar"** (`openPhone`): a preferência
registrada é sobre mensagens de WhatsApp, não sobre telefonema. Bloquear
a ligação seria interpretar além do que o cliente pediu.

### Validação

- `typecheck`, `build` e `eslint` (7 arquivos) — limpos
- `e2e:smoke` — **118 checks** (eram 112), reexecutável. Os 6 novos travam
  a regra de opt-out (inclusive o caso "tem número mas recusou") e a busca
  global por IE/IM/contato
- Verificado no servidor: busca por `86123456` (IE), `998877` (IM) e
  `Maria` (contato) retorna o cliente; `sem zap` e o filtro de origens
  aparecem no HTML da lista
