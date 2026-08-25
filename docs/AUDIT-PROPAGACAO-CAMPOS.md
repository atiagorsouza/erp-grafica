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

---

# Segunda passada — módulos restantes e campos da empresa (v3.23.0)

A primeira passada cobriu os campos do **cliente**. Faltavam os módulos
Envios, Cobranças, Kanban e Relatórios, e — principalmente — os **7
campos fiscais da empresa** adicionados ao painel na v3.21.0, que nunca
foram verificados do lado do consumo.

## Placar dos campos da empresa

| Campo | Quem lê | Situação |
|---|---|---|
| `company_ie` | só `settings.ts` | ❌ não sai em nenhum documento |
| `company_im` | só `settings.ts` | ❌ idem |
| `company_cnae` | só `settings.ts` | ⚠️ esperado (uso futuro na NF-e) |
| `company_city_code` | só `settings.ts` | ⚠️ esperado (uso futuro na NF-e) |
| `company_crt` | só `settings.ts` | ⚠️ esperado (uso futuro na NF-e) |
| `company_tax_regime` | só `settings.ts` | ⚠️ esperado (uso futuro na NF-e) |
| `company_complement` | `settings.ts` + `superfrete.ts` | ✅ em uso |

### Achado 6 — a IE da empresa não sai em documento nenhum

Os três documentos imprimem apenas o CNPJ do emitente:

- cupom 80 mm (`PosClient.tsx:1853`)
- OS / A4 (`PrintDocument.tsx:135`)
- orçamento A4 (`QuotesClient.tsx:1053`)

Uma gráfica com inscrição estadual precisa dela impressa. Já exigimos a
IE **do cliente** no A4 desde a v3.21.0 — pedir do cliente e omitir a
própria é incoerente.

CNAE, código IBGE, CRT e regime seguem sem consumo **por enquanto** —
existem para a emissão de NF-e, que ainda não foi implementada. Ficam
registrados aqui para não parecerem esquecimento.

## Módulos verificados — sem problemas

| Módulo | Resultado |
|---|---|
| **Envios / SuperFrete** | ✅ destinatário completo: nome, documento, CEP, **número e complemento**, e-mail e telefone. Remetente usa `company_complement` |
| **Cobranças / InfinitePay** | ✅ envia `customer` (nome, e-mail, telefone) e `address` com número e complemento |
| **Kanban** | ✅ usa `customerName` como texto livre — correto, cards podem ser trabalho interno sem cliente cadastrado |
| **Relatórios** | ✅ agrupa por `coalesce(tradeName, name)` — a fantasia aparece corretamente no ranking |
| **`company_address`** | ✅ pendência antiga resolvida: `settings.ts:166` cai em `structuredAddress` antes do valor legado |

### Achado 7 — Envios ignora o WhatsApp do cliente

`superfrete.ts:602` monta o telefone do destinatário só com
`customer.phone`. Quem cadastrou apenas WhatsApp vai para a
transportadora sem telefone de contato, e é por ele que o entregador liga.

### Achado 8 — `PrintDocument.tsx` é código morto (e eu caí nele)

Nenhum arquivo importa `PrintDocument`. Os documentos que realmente
saem na impressora são outros:

| Documento | Componente real |
|---|---|
| OS A4 | `ProductionOrderA4` — `OrdersClient.tsx` |
| OS 80 mm | `ThermalOrderReceipt` — `OrdersClient.tsx` |
| Orçamento A4 | `#quote-print-a4` — `QuotesClient.tsx` |
| Cupom PDV | `ThermalReceipt` — `PosClient.tsx` |

**Consequência direta:** o bloco fiscal PJ que a v3.21.0 registrou como
"adicionado à OS" foi para o arquivo órfão. **A OS real nunca teve esse
bloco** — nem o complemento no endereço. A correção da v3.21.0 para o
`mobilePhone` também era inócua: o arquivo não roda.

O arquivo recebeu um cabeçalho de aviso apontando os componentes certos,
em vez de ser excluído: serve de referência de layout e a remoção seria
uma mudança maior do que esta auditoria comporta.

## Correções aplicadas (v3.23.0)

| # | Achado | Correção |
|---|---|---|
| 6 | IE da empresa não saía em documento nenhum | cabeçalho do **cupom PDV**, da **OS A4**, do **cupom da OS** e do **orçamento A4**; `stateRegistration` no tipo `PosCompany` (que é **declarado duas vezes** — em `PosClient` e em `OrdersClient`) e repassado pelas 3 páginas |
| 7 | Etiqueta ia sem telefone para quem só tem WhatsApp | `superfrete.ts` usa `phone \|\| whatsapp` no destinatário |
| 8 | Bloco fiscal PJ da v3.21.0 foi para arquivo morto | aplicado na **OS real** (`ProductionOrderA4`): razão social, IE, IM, A/C e endereço com complemento e CEP. Cupom da OS ganhou CPF/CNPJ e A/C |

### Validação

- `typecheck`, `build`, `eslint` (8 arquivos) — limpos
- `e2e:smoke` — **121 checks** (eram 118). Os 3 novos gravam uma IE
  temporária, conferem que ela chega ao HTML de `/pdv`, `/pedidos` e
  `/orcamentos`, e **restauram o valor anterior**
- O typecheck foi quem revelou o `PosCompany` duplicado — sem ele, a IE
  apareceria no PDV e sumiria em Pedidos
