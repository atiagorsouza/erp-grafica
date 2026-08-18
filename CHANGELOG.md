## [3.10.0] — 2026-08-17 · Motor de Produção 4/5 — Produtos & Custos (CENTRAL)

### Corrigido
- **Preço calculado no cliente e gravado direto** (crítico — alimenta PDV/Orçamento/Pedido):
  `costSnapshot`/`sellPrice`/`finalPrice`/`breakdown` vinham do browser e podiam ser forjados.
  Agora o servidor **sempre recalcula** com `pricing.ts` (a mesma fórmula do simulador), tanto
  no modo unitário quanto por tiragem (batch). *Testado: enviar finalPrice 0,01 num produto
  real → gravado 0,3497 (custo 0,1943 + margem + imposto + taxa).*
- **Preço congelava quando o custo da base mudava**: alterar material/consumível/impressora
  não atualizava o `finalPrice` do produto até reabrir e salvar. Adicionado **recálculo em
  massa** (`op: "recalc"` + botão "Recalcular preços"). *Testado: dobrar o custo do material →
  recalc subiu o preço de 0,3497 para 0,4217 em 8 produtos.*
- **Excluir produto usado orfanava referências**: `quoteItems.productId` e
  `kanbanCards.productId` (FK set null). Agora bloqueado (409), sugerindo inativar. *Testado:
  produto em card de produção recusado.*
- **Sem validação**: nome vazio, taxas/quantidades negativas ou NaN aceitas. Agora Zod.

### Adicionado
- **`src/lib/products.ts`**: `createProduct`/`updateProduct`/`deleteProduct`/
  `recalculateAllProducts`, todos recalculando o preço no servidor. Ajuste manual de estoque
  gera movimento auditável (entrada/saída) no update.
- Botão **"Recalcular preços"** no cabeçalho — reprocessa todo o catálogo com os custos atuais
  das bases (fecha o ciclo do Motor de Produção: mudou impressora/material/serviço/acabamento
  → um clique reprecifica tudo).

### Integração entre módulos (o motor central)
- Produtos consome Impressoras & Tintas (categoria/consumível/impressora/formato), Materiais,
  Serviços e Acabamentos — e alimenta PDV, Orçamentos e Pedidos com `finalPrice` confiável
  (todos já resolvem preço no servidor). O preview ao vivo da UI continua, mas é informativo;
  a verdade é o cálculo do servidor.

### Limpeza
- Rota `products` (152 linhas com lógica) virou camada HTTP fina sobre `lib/products`. UI não
  envia mais preço; envia só as entradas do produto.

## [3.9.0] — 2026-08-17 · Motor de Produção 3/5 — Serviços & Acabamentos

### Corrigido
- **Excluir serviço usado orfanava produto/orçamento**: `products.baseServiceId` e
  `quoteItems.serviceId` (FK set null) ficavam nulos, tirando o serviço-base do cálculo.
  Agora bloqueado (409) contando produtos e itens de orçamento afetados. *Testado.*
- **Excluir acabamento vinculado mudava o custo do produto**: `productFinishings.finishingId`
  tem **cascade** — excluir removia o acabamento dos produtos silenciosamente. Agora
  bloqueado (409). *Testado: acabamento em produto recusado.*
- **Sem validação**: `baseCost`/`unitCost`/`estimatedHours` negativos ou NaN, `type`
  inválido, nome vazio eram aceitos. Agora validado por Zod.
- **Edição parcial resetava campos**: editar só o custo zerava `estimatedHours`/`type`
  (default do `.partial()`). Corrigido com schema de update sem defaults. *Testado: editar
  custo preservou terceirizado/3h.*

### Adicionado
- **`src/lib/services.ts`** com CRUD + validação + proteção de exclusão de serviços e
  acabamentos, contando dependências em produtos e orçamentos.

### Integração / verificação
- Serviços & Acabamentos → Produtos (baseServiceId, productFinishings) e Orçamentos
  (quoteItems.serviceId, cujo preço já é resolvido no servidor desde a v3.6.0). Excluir base
  usada é bloqueado para preservar o custo dos produtos.

### Limpeza
- Rotas `services` e `finishings` viraram camadas HTTP finas. UI envia valores crus e
  `categoryId` como número/null (evita erro de coerção com string vazia).

## [3.8.0] — 2026-08-17 · Motor de Produção 2/5 — Tabelas de Preços

### Corrigido
- **Sem validação**: CRUD cru aceitava `type` fora do enum (→ erro 500 cru), label vazio,
  preço/dimensões/mínimo negativos ou NaN. Agora validado por Zod com mensagens claras.
- **Edição parcial resetava campos**: editar só o preço zerava `unit`/`minQty`/`type` para o
  default (mesmo efeito do `.partial()` com `.default()` já visto no Calendário). Corrigido
  com schema de update sem defaults. *Testado: editar preço preservou lona/m²/mín 2.*
- **Exclusão sem tratamento de erro**: falha silenciosa. Agora com toast de sucesso/erro.

### Adicionado
- **`src/lib/pricing-tables.ts`** com validação de type (dtf_uv/dtf_textil/lona/adesivo),
  unidade (unidade/metro/m2/folha), preço, dimensões úteis e quantidade mínima.

### Integração / observação
- Verificado: as tabelas de preço são hoje um **catálogo de referência** — `ProductsClient`
  recebe `pricingTables` como prop e o operador consulta o R$/m² para compor o preço, mas
  **não há FK de produto** apontando para a tabela nem consumo automático no motor
  (`PricingTableRow` está definido em `pricing.ts` mas não é usado em cálculo). Por isso a
  exclusão é livre (não orfana produtos). Integração automática com o motor fica registrada
  como melhoria futura para o módulo Produtos & Custos.

### Limpeza
- Rota `pricing-tables` virou camada HTTP fina. UI envia valores crus (servidor serializa).

## [3.7.0] — 2026-08-17 · Motor de Produção 1/5 — Impressoras & Tintas

### Corrigido
- **Excluir categoria/impressora/formato em uso orfanava produtos** (risco #1 do motor de
  custo): as rotas apagavam sem checar. A categoria tem cascade que apaga impressoras +
  consumíveis + formatos junto, e os produtos que referenciam ficavam com
  `printerId`/`printFormatId`/`printerCategoryId` nulos (FK set null) — o cálculo de custo
  perdia a base silenciosamente. Agora a exclusão é **bloqueada (409)** contando os produtos
  afetados. *Testado: impressora e categoria em uso recusadas; produto permaneceu intacto.*
- **Sem validação**: as 4 rotas eram CRUD cru — aceitavam custo/rendimento/multiplicador
  negativos ou NaN, nome vazio, `measureMode` arbitrário. Agora validado por Zod.
- **Rendimento 0 zerava o custo silenciosamente**: consumível com custo > 0 e
  `yieldPages = 0` gerava custo/página = 0 sem aviso. Agora é bloqueado (422).
- **Slug de categoria colidia**: nomes iguais geravam slug duplicado → erro 500 cru (o slug
  é `unique`). Agora o slug é gerado no servidor e recebe sufixo único quando necessário.

### Adicionado
- **`src/lib/printers.ts`** centraliza CRUD + validação + proteção de exclusão das 4
  entidades (categorias, consumíveis, impressoras, formatos).
- Conversão de unidades (%/decimais) movida para o servidor — a UI envia valores crus,
  eliminando a conversão dupla.

### Integração / verificação do cálculo
- Conferida a matemática do motor (`pricing.ts` intacto): consumível R$300/6000pg = R$0,05/pg;
  categoria (0,05 + 0,02 fixo) × 1,05 waste = 0,0735; impressora × 1,2 = 0,0882/pg. O
  simulador da UI usa as mesmas funções e lê os decimais gravados — consistente ponta a ponta.
- Impressoras & Tintas → Produtos (base do custo por página/folha). Excluir base usada é
  bloqueado para preservar o cálculo dos produtos.

### Limpeza
- As 4 rotas viraram camadas HTTP finas. Removido o gerador de slug duplicado no cliente
  (agora no servidor). `pricing.ts` mantido como está — auditado e correto.

## [3.6.0] — 2026-08-17 · Módulo Orçamentos

### Corrigido
- **Cliente ditava o preço** (mesmo risco do PDV): a UI mandava `unitPrice`/`total` do browser
  e a rota gravava direto — dava para forjar preço de produto. Agora o servidor resolve o
  preço: produto→`finalPrice` do cadastro, serviço→`baseCost`, avulso→valor digitado (exige
  descrição). *Testado: forjar 0,01 num produto de 0,27 → gravado 0,27.*
- **Card duplicado no Kanban**: `syncProductionCard` criava um card "Pedido X" já quando o
  orçamento era aprovado (vínculo obsoleto por `quoteId`), e a conversão criava **outro**.
  Removido — o card nasce só na conversão (por `orderId`). *Testado: 1 card, não 2.*
- **Editar/excluir orçamento já convertido**: não havia proteção; alterar valores depois de
  gerar o pedido dessincronizava o snapshot. Agora `update`/`delete`/`status` são
  **bloqueados** (409) quando já existe pedido. *Testado: edição, exclusão e troca de status
  recusadas.*
- **Expiração inexistente**: o status "expirado" e `quote_validity_days` do Painel nunca eram
  usados. Agora ao abrir a tela os vencidos em aberto (rascunho/enviado) viram "expirado";
  aprovados/recusados não são tocados. *Testado: vencido→expirado, aprovado vencido intacto.*
- **Sem validação**: itens vazios, quantidade/preço NaN aceitos. Agora validado por Zod.

### Adicionado
- **`src/lib/quotes.ts`**: createQuote/updateQuote/setQuoteStatus/deleteQuote/
  expireOverdueQuotes, com transação atômica e `saveItems` usando o `tx` correto (corrigido
  erro de FK ao inserir itens antes do commit).
- Novas operações na rota: `op: "status"` e `op: "delete"` protegidos.

### Integração entre módulos
- Orçamento → Produto/Serviço (preço do cadastro), Orçamento → Pedido (conversão idempotente
  intocada), Orçamento → Kanban (card só na conversão, sem duplicar), Orçamento → Painel
  (janela de validade). O botão de conversão continua sumindo via `hasOrder()`.

### Limpeza
- Rota `quotes` (200 linhas com lógica embutida) virou camada HTTP fina sobre `lib/quotes`.
  Removida a função `syncProductionCard` (fonte da duplicação de card).

## [3.5.0] — 2026-08-17 · Módulo Calendário

### Corrigido
- **Auditoria 100% quebrada**: a UI tinha um modal de auditoria (timeline) que chamava
  `GET ?audit=id`, mas a rota **não tinha GET** e **nunca gravava** nada — a tabela
  `commemorative_date_audit` existia órfã. Agora toda criação/edição/exclusão/ativação é
  registrada, e o histórico é lido de verdade (created / updated / toggled / deleted, campo
  a campo).
- **Editar só o título resetava tipo e relevância**: o `.partial()` do Zod ainda aplicava os
  `.default()` dos campos ausentes, sobrescrevendo `type`/`relevance`/`active`. Agora campo
  ausente é preservado.
- **`date`/`monthDay` dessincronizados**: a UI só gravava `month`+`day`; a coluna `date`
  ficava travada em `2000-01-01` e `monthDay` nulo. Agora ambos são recalculados
  automaticamente e ficam coerentes.
- **Sem validação**: aceitava mês 13, dia 32, tipo/relevância inválidos, título vazio. Agora
  validado por Zod, com **normalização** de dia por mês (ex.: 31/fev → 29).

### Adicionado
- **`src/lib/calendar.ts`**: createDate/updateDate/deleteDate com auditoria, `auditTrail` e
  `upcomingDates` (próximas ocorrências anuais).
- **Faixa "Próximas datas"** no topo, usando `calendar_alert_days_before` do Painel de
  Controle (config que existia mas nunca era consumida) — antecipa campanhas sazonais.
- **Nova aba "Agenda de produção"**: mostra os `production_schedules` agendados em Pedidos &
  OS, agrupados por dia, com impressora, horário, status e link para o pedido. Antes esses
  agendamentos só existiam no dashboard ("agenda de hoje") e não tinham tela navegável.

### Integração entre módulos
- Calendário ↔ Pedidos: a agenda de produção reflete o que é agendado na OS (via `orderId`),
  com selo clicável que abre o pedido. Calendário ↔ Painel de Controle: alerta usa a janela
  de dias configurada.

### Limpeza
- Rota `commemorative-dates` virou camada fina sobre `lib/calendar` (CRUD cru substituído).
  Escape de aspas corrigido no modal de exclusão.

## [3.4.0] — 2026-08-17 · Módulo Kanban de Produção

### Corrigido
- **Arrastar o card não mexia no pedido** (bug central): mover um card ligado a um pedido só
  mudava `kanban_cards.column`; o `orders.productionStatus` ficava dessincronizado — as telas
  de Kanban e Pedidos divergiam. Agora o arraste usa `op: "move"`, que atualiza card **e**
  pedido na mesma transação: backlog→aguardando, producao/revisao→em_produção,
  pronto→concluído, entregue→concluído + entrega marcada como entregue. A sincronização já
  funcionava no sentido Pedidos→Kanban; agora é **bidirecional**.
- **Excluir card de pedido órfanava a produção**: o quadro apagava o card sem aviso, deixando
  o pedido "sem produção" e sem como recriar. Agora cards com `orderId` são **protegidos**
  (409 — "cancele o pedido"); o botão de excluir some para eles e o de editar permanece.
- **CRUD cru sem validação**: aceitava título vazio, coluna/prioridade inválidas e
  `estimatedValue` NaN. Agora validado por Zod (`lib/kanban`).

### Adicionado
- **`src/lib/kanban.ts`** (create/update/delete de cards avulsos, com validação) e
  **`moveKanbanCard`** em `lib/orders.ts` (mapeamento inverso Kanban→produção + entrega).
- Selo **PED** no card vinculado, clicável, que abre o pedido (`/pedidos?id=`) — integração
  visível entre os dois módulos.

### Integração entre módulos
- Kanban ↔ Pedidos agora coerentes nos dois sentidos; mover para "entregue" no quadro fecha
  produção e entrega do pedido. O card do pedido nasce/vive/morre com o pedido.

### Limpeza
- Removida a operação morta **`syncByQuote`** (o vínculo passou a ser por `orderId` desde a
  v3.2.0). Rota do Kanban virou camada HTTP fina sobre `lib/kanban` + `moveKanbanCard`.
  Escape de aspas corrigido no modal de exclusão.

## [3.3.0] — 2026-08-17 · Módulo Clientes & CRM

### Corrigido
- **Exclusão de cliente destruía o histórico**: as FKs são `onDelete: set null`, então
  apagar um cliente com pedidos/vendas/orçamentos deixava tudo órfão ("Consumidor final")
  silenciosamente, corrompendo histórico e financeiro. Agora a exclusão é **bloqueada** se
  houver vínculos (com contagem detalhada) e a UI oferece **inativar** para preservar tudo.
- **Zero validação**: aceitava CPF/CNPJ e e-mail inválidos e o mesmo documento repetido
  N vezes. Agora valida dígito verificador de CPF/CNPJ, formato de e-mail e **impede
  documento duplicado** (create e update).
- **Lead "ganho"/"perdido" não fechava nada**: não ajustava probabilidade nem registrava
  motivo. Agora ganho → 100%, perdido → 0% e **exige/registra o motivo da perda**
  (`lostReason`, que existia no schema mas nunca era usado).
- **LTV inflado**: somava pedidos/vendas cancelados. Agora ignora `cancelado`/`cancelada`.
- **Edição de lead apagava o histórico de contato**: `saveLead` sobrescrevia
  `nextActionAt`/`lastContactAt` a cada edição. Essas datas passaram a ser carimbadas pelo
  servidor apenas quando há contato real.

### Adicionado
- **`src/lib/crm.ts`** centraliza as regras: `createCustomer`, `updateCustomer`,
  `deleteCustomer`, `customerLinks`, `createLead`, `updateLead`, `moveLead`, `deleteLead`,
  `createActivity`, `updateActivity`, `deleteActivity` e `customerSummary` (métricas 360°
  agregadas no servidor, sem trazer todos os documentos para o browser).
- Novas operações nas rotas: `customers` ganha `op: "links"`; `crm-leads` ganha
  `op: "move"` (funil + fechamento). Toda atividade vinculada a um lead **carimba o último
  contato** automaticamente.

### Integração entre módulos
- Clientes ↔ Pedidos/Vendas/Orçamentos: exclusão respeita vínculos e o LTV/360° reflete
  apenas documentos ativos. Pipeline → Orçamento continua via "criar orçamento do lead".

### Limpeza
- Três rotas CRUD cruas (`customers`, `crm-leads`, `crm-activities`) que gravavam qualquer
  payload sem validação foram substituídas por camadas HTTP finas sobre `lib/crm`.
  Escape de aspas corrigido no modal de exclusão.

## [3.2.0] — 2026-08-17 · Módulo Pedidos & OS

### Corrigido
- **Financeiro ignorava a situação escolhida**: o `create` sempre lançava a receita como
  `pago`, mesmo com "parcial"/"pendente" no formulário. Agora o lançamento respeita
  `financialStatus` (pago → hoje; pendente/crédito → a receber em 30 dias).
- **Kanban não sincronizava em pedido sem orçamento**: a sincronização era feita por
  `quoteId`, então pedidos criados direto no balcão (sem orçamento) nunca moviam o card ao
  avançar a produção. Adicionada a coluna `kanban_cards.order_id` (FK com cascade) e a
  sincronização passou a ser por `orderId` — cobre 100% dos pedidos.
- **Edição de pedido dessincronizava tudo**: mudar itens/valores não atualizava o
  lançamento financeiro nem o card do Kanban. Agora `update` ressincroniza ambos.
- **Avanço de entrega quebrado**: gravava `deliveryStatus` via `update` (que exige itens),
  podendo falhar. Agora usa a operação `patch`, sem exigir itens.
- **Cancelamento não estornava**: apenas marcava `status: cancelado`. Agora estorna o
  financeiro (cancela o a-receber em aberto ou gera contrapartida se já recebido), marca a
  entrega como devolvida e remove o card do Kanban — coerente com o cancelamento do PDV.
- **Criação não era atômica**: pedido, entrega, kanban e financeiro rodavam soltos; falha
  no meio deixava registros órfãos. Agora tudo em uma transação.
- **Sem validação**: itens vazios, quantidade/preço inválidos ou NaN eram aceitos. Agora
  há validação Zod (mesma abordagem do PDV).

### Adicionado
- **`src/lib/orders.ts`** centraliza as regras: `createOrder`, `updateOrderItems`,
  `patchOrderStatus`, `cancelOrder`, `deleteOrder`, `convertQuoteToOrder` — todas com
  transação atômica e recálculo de totais no servidor (o cliente não dita valores).
- Novas operações na rota: `op: "patch"` (status/produção/arte/entrega/prioridade/prazo,
  sincroniza Kanban) e `op: "cancel"` (com estorno). `op: "delete"` agora **exige pedido
  cancelado** e limpa entrega/kanban (antes deixava órfãos).
- Botão **"Excluir definitivamente"** no drawer para pedidos cancelados (a operação existia
  no backend, mas não tinha interface).

### Integração entre módulos
- Pedidos → Financeiro (a-receber por situação), Pedidos → Kanban (card por `orderId`),
  Pedidos → Entregas (registro automático), Orçamento → Pedido (conversão idempotente que
  reaproveita o card do Kanban do orçamento). O botão de conversão some via `hasOrder()`.

### Limpeza
- `orders/route.ts` (196→75 linhas) e `convert/route.ts` (140→24 linhas) viraram finas
  camadas HTTP; toda a lógica saiu para `lib/orders.ts`. Removida a sincronização frágil
  `syncByQuote` do fluxo de status (substituída por `orderId`).

## [3.1.1] — 2026-08-17

### Corrigido — Painel de Controle "pela metade"
- **Causa raiz**: o Painel monta as abas a partir de uma lista estática (as 10 abas
  sempre existem no código), mas cada campo lê `settings[key]`. O seed antigo gravava
  só 4 chaves de empresa e **nenhuma** de PDV/Orçamentos/Pedidos/Kanban/CRM/Calendário,
  então as abas apareciam com todos os campos vazios — dando a impressão de "abas
  faltando/quebradas". Não era bug de UI: era **dado ausente**.
- **Chaves desalinhadas** entre seed e UI: o seed gravava `company_document` e
  `company_address`, mas a UI usa `company_cnpj` e campos de endereço estruturados
  (`company_street/number/district/city/state/cep`). Agora o seed usa exatamente as
  chaves da UI.

### Adicionado
- **`scripts/repair-settings.mjs`** (npm `settings:repair`): idempotente, preenche toda
  chave que a UI espera **sem sobrescrever** valores do usuário, corrige a categoria/aba
  de chaves antigas, **migra** `company_document → company_cnpj` e `company_address →
  company_street`, e **remove** chaves obsoletas (`communication_*` e legado já migrado).
- O reparo roda automaticamente no `install.sh` (após o seed) e como passo dedicado do
  `update.sh` (agora em 8 etapas).

### Corrigido — `update.sh` para migração do fork antigo
- `git pull --ff-only` falhava por **histórico divergente** ao migrar de uma instalação
  pré-Clean Start para a v3.x (o v3.0.0 recriou o histórico git). Agora o passo detecta
  a divergência, faz `git stash` do que houver de local e alinha com o branch remoto via
  `git reset --hard` — sempre **após o backup do banco** e com confirmação (`--yes`
  automatiza). Isso destrava a primeira atualização em produção sem git na mão.

## [3.1.0] — 2026-08-17

- PDV: caixa correto, split de pagamentos, cancelamento com estorno e integracao com as configuracoes

# Changelog — PrintFlow ERP

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) · Versionamento: SemVer.
A versão vigente está sempre no arquivo [`VERSION`](./VERSION).

## [3.0.0] — Clean Start

Base limpa do projeto. Todo o legado (documentação antiga, seeds duplicados, scripts de deploy
herdados, módulo de comunicação) foi removido ou reescrito.

### Removido
- **Central de Comunicação inteira (WhatsApp + E-mail).** Foram retiradas do clone:
  páginas (`/comunicacoes`), APIs (`/api/communication/*`, `/api/cron/communication`,
  `/api/webhooks/resend`, `/api/integrations/whatsapp`), CRUDs de canais/templates/regras/outbox/
  consentimentos, bibliotecas `src/lib/communication.ts` e `src/lib/communication-template.ts`,
  tabelas `communication_*`, `message_templates` e `customer_consents` no schema, seção
  "Comunicação" do Painel de Controle e os disparos automáticos em orçamento, pedido, arte e entrega.
- Documentação herdada em desacordo com o código (17 arquivos `.md` de auditoria/relatório).
- Seeds triplicados (`seed.mjs`, `seed-full.mjs`, `seed-calendar.mjs` na raiz) e scripts de
  deploy/instação antigos (`install.sh`, `update.sh`, `start.sh`, `deploy.sh`, `push-to-github.sh`).
- Bundles e artefatos de update (`erp-update.bundle`, `tsconfig.tsbuildinfo` versionado).

### Adicionado
- **Versionamento novo**: arquivo `VERSION` como fonte da verdade, `src/lib/version.ts` para a UI,
  `GET /api/version` (versão, canal, integridade do banco, versão instalada) e o validador
  `scripts/check-version.mjs` (com `--fix`).
- **Pipeline de primeira instalação**: `scripts/install.sh` (idempotente, 7 etapas — pré-requisitos,
  `.env`, conexão, dependências, schema, dados iniciais, build + healthcheck).
- **Pipeline de atualização**: `scripts/update.sh` com backup automático pré-migração,
  `drizzle-kit push`, build, publicação e healthcheck; aceita `--v`, `--skip-pull`, `--no-backup`.
- **Ciclo de release**: `scripts/release.sh <versão> "<mensagem>"` atualiza `VERSION`,
  `src/lib/version.ts`, `package.json`, `CHANGELOG.md` e cria a tag `vX.Y.Z`.
- Operação: `scripts/backup.sh`, `scripts/restore.sh`, `scripts/healthcheck.sh`,
  `scripts/db-reset.sh`, `ecosystem.config.cjs` (PM2) e `scripts/lib/common.sh`.
- Atalhos npm: `setup`, `update`, `backup`, `restore`, `check`, `release`, `db:push`, `db:seed`,
  `db:reset`, `version:check`.
- Documentação mínima e confiável: `README.md`, `INSTALL.md`, `UPDATE.md`, `.env.example`,
  `.gitignore` e repositório git inicializado com histórico limpo.

### Corrigido
- `seed.mjs` referenciava colunas/tabelas inexistentes (`customers.source`, `customer_consents`,
  `communication_*`) — agora o script roda limpo e usa `ON CONFLICT` nas configurações.
- Contadores de documento passam a ser semeados com o ano corrente, evitando numeração errada.
- `settings` de comunicação removidos do seed e da árvore de configuração da interface.
- Orçamento → Pedido voltou a ser 100% transacional, sem dependência de módulo externo.

## [2.x] — Legado (arquivado)
Versões anteriores do fork original. Sem suporte; migração para 3.0.0 é feita por
`bash scripts/update.sh`, que aplica o schema atual preservando os dados comerciais.
