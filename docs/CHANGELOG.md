# Changelog — PrintFlow ERP

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).  
Versionamento: [SemVer](https://semver.org/lang/pt-BR/).

---

## [3.10.0] — 2026-08-17

### Integração ponta a ponta
- Criado `scripts/e2e-smoke.mjs` para validar o fluxo completo:
  Cliente/CRM → Estoque/Compra → Produto → Orçamento → Pedido/OS → Kanban → PDV → Financeiro → páginas principais.
- Novo comando `npm run e2e:smoke`.

### Instalação / Update
- Corrigido install/update quando `.env` define `NODE_ENV=production`: `npm ci` agora força `--include=dev`, garantindo `drizzle-kit`, TypeScript e ferramentas de build durante deploy.
- Criado `scripts/preflight.mjs` com checagens de Node, npm, DATABASE_URL, PostgreSQL, `pg_dump` e `npm audit`.
- Novo comando `npm run preflight`.
- Backup do update agora tenta `pg_dump` custom, depois SQL, e se ambos falharem gera fallback JSON com `scripts/backup-db-json.mjs`.
- Criado `scripts/backup-db-json.mjs` para evitar update sem nenhuma cópia de dados quando `pg_dump` estiver ausente/quebrado.

### Operação
- Recomendado rodar antes de deploy: `npm run preflight`.
- Para validar fluxo completo com servidor rodando: `npm run e2e:smoke`.

---

## [3.0.12] — 2026-08-17

### Corrigido — Estoque & Compras
- Criada camada server-side `src/lib/stock.ts` para materiais, fornecedores, movimentações e compras.
- Corrigido bug crítico: movimentação manual não duplica mais ajuste de estoque; a API é a única responsável por alterar saldo.
- Movimentações agora são transacionais e validam item, tipo, quantidade, saldo e destino.
- Saída de estoque bloqueia saldo insuficiente.
- Movimentações automáticas não podem ser excluídas manualmente.
- Recebimento de compra agora é transacional e idempotente, criando movimentos automáticos e atualizando custo unitário.
- Materiais com saldo/histórico passam por arquivamento seguro em vez de exclusão destrutiva.
- Fornecedores agora validam dados básicos e deleção vira inativação.
- Criado `scripts/repair-stock.mjs` para normalizar dados legados de materiais, fornecedores, movimentos e compras.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-stock.mjs`.

---

## [3.0.11] — 2026-08-17

### Corrigido — Serviços & Acabamentos
- Criada camada server-side `src/lib/services-engine.ts` para validação de serviços e acabamentos.
- APIs `/api/crud/services` e `/api/crud/finishings` agora validam nome, custo, horas, tipo, unidade e categoria antes de gravar.
- Serviços próprios limpam parceiro automaticamente; terceirizados preservam parceiro.
- Exclusão destrutiva virou arquivamento quando serviço/acabamento está em uso por produtos/orçamentos.
- UI ajustada para comunicar arquivamento seguro em vez de exclusão simples.
- Criado `scripts/repair-services.mjs` para normalizar custos, horas, unidades e vínculos de acabamento existentes.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-services.mjs`.

---

## [3.0.10] — 2026-08-17

### Corrigido — Tabelas de Preços
- Criada camada server-side `src/lib/pricing-tables.ts` para validação e normalização de DTF UV, DTF Têxtil, Lona e Adesivo.
- API `/api/crud/pricing-tables` agora valida tipo, unidade, preço, dimensões e quantidade mínima antes de gravar.
- Unidades são normalizadas por tipo (`lona/adesivo → m2`, `dtf_textil → metro` quando aplicável).
- Linhas duplicadas são bloqueadas na API e desativadas pelo reparo de update.
- Exclusão destrutiva virou arquivamento (`active = false`) preservando histórico.
- UI mostra apenas linhas ativas e arquiva linhas em vez de removê-las.
- Criado `scripts/repair-pricing-tables.mjs` para normalizar dados legados e desativar duplicatas.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-pricing-tables.mjs`.

---

## [3.0.9] — 2026-08-17

### Corrigido — Produtos & Custos
- Criada camada server-side `src/lib/products.ts` para validação, cálculo e persistência segura de produtos.
- API `/api/crud/products` agora recalcula custo/preço no servidor usando catálogo real do banco, impedindo preço forjado pelo client.
- Produtos agora validam nome, modo de cálculo, impressão, material base, serviço, estoque, margem, tiragem, acabamento e materiais extras.
- Cadastro/edição registra ajuste de estoque quando o saldo de produto acabado muda.
- Geração de SKU automática preservada e reforçada por reparo de update.
- Exclusão destrutiva virou arquivamento quando produto já foi usado em orçamento, preservando histórico comercial.
- Criado `scripts/repair-products.mjs` para normalizar SKUs, números, margens, estoque e componentes existentes.
- UI corrigida para tratar exclusão como arquivamento/removal seguro.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-products.mjs` após `repair-print-engine.mjs`.

---

## [3.0.8] — 2026-08-17

### Corrigido — Impressoras & Tintas
- Criada camada server-side `src/lib/print-engine.ts` para validação e regras do motor de impressoras, categorias, consumíveis e formatos.
- APIs de categorias, consumíveis, impressoras e formatos agora validam dados antes de gravar.
- Consumíveis agora exigem rendimento maior que zero, evitando divisão inválida no custo por página.
- Categorias validam slug único, modo de medição, cobertura de referência, perda e margem.
- Impressoras validam categoria, status e multiplicador positivo.
- Formatos validam área, cobertura, custo override e bloqueiam valores inválidos.
- Deleção perigosa bloqueada:
  - categoria em uso por impressoras/produtos não pode ser apagada;
  - formato usado por produto não pode ser apagado;
  - impressora em uso vira `inativa` em vez de ser excluída.
- Criado `scripts/repair-print-engine.mjs` para normalizar dados legados, slugs, rendimentos, multiplicadores e formatos.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-print-engine.mjs` antes dos reparos de Orçamentos/Pedidos.

---

## [3.0.7] — 2026-08-17

### Corrigido — Orçamentos
- Criada camada server-side `src/lib/quotes.ts` para validação, cálculo e regras de negócio de propostas.
- Corrigido bug crítico: atualização parcial de status não zera mais itens, subtotal e total.
- Orçamentos convertidos em Pedido/OS não podem mais alterar itens/valores, preservando snapshot comercial.
- Exclusão destrutiva virou arquivamento/recusa segura (`status = recusado`) quando ainda não convertido.
- Criação usa configurações do Painel: validade, pagamento, vendedor e observações padrão.
- Orçamentos aprovados ainda não convertidos sincronizam card no Kanban; recusados/expirados movem card para `cancelado`.
- UI removeu envio por WhatsApp e canais ligados ao antigo motor de comunicação.
- Integração CRM/Dashboard via `/orcamentos?novo=1&customerId=...` agora abre novo orçamento com cliente pré-selecionado.
- Criado `scripts/repair-quotes.mjs` para expirar enviados vencidos e reparar cards Kanban de orçamentos aprovados/recusados/expirados.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-quotes.mjs` antes de Pedidos/Kanban.

---

## [3.0.6] — 2026-08-17

### Corrigido — Calendário Comemorativo
- Criada camada server-side `src/lib/calendar.ts` para validação, normalização e auditoria real das datas.
- API `/api/crud/commemorative-dates` agora suporta `GET ?audit=id` e retorna histórico usado pela UI.
- Criação/edição de datas agora valida mês/dia real, tipo, relevância, duplicidade e campos obrigatórios.
- `month_day` e `date` passam a ser preenchidos automaticamente de forma canônica (`MM-DD` e `2000-MM-DD` para recorrentes).
- Exclusão destrutiva foi substituída por desativação segura com auditoria, preservando histórico.
- Seed do calendário deixou de truncar dados; agora é idempotente e não apaga personalizações.
- Notificações do sistema agora incluem datas comerciais/feriados/relevância alta próximos conforme configuração `calendar_alert_days_before`.
- Criado `scripts/repair-calendar.mjs` para normalizar dados legados, corrigir datas inválidas e desativar duplicatas exatas.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-calendar.mjs`.

---

## [3.0.5] — 2026-08-17

### Corrigido — Kanban de Produção
- Criada camada server-side `src/lib/kanban.ts` para validação e regras do quadro.
- API `/api/crud/kanban` agora valida colunas, prioridade, datas, vínculos e valores antes de gravar.
- Mover card vinculado a Pedido/OS agora sincroniza status do pedido automaticamente:
  - `backlog` → produção aguardando
  - `producao` → em produção
  - `revisao` → em produção + arte em revisão
  - `pronto` → pedido concluído
  - `entregue` → pedido concluído + entrega entregue
- Cards cancelados agora aparecem em uma coluna própria `Cancelados` em vez de ficarem invisíveis.
- Cards vinculados a Pedido/OS não podem ser excluídos diretamente; devem ser cancelados/editados em Pedidos & OS.
- Tentativa de mover card vinculado para `cancelado` é bloqueada para garantir motivo e estorno via Pedidos & OS.
- UI do Kanban agora trata erros de drag/drop com toast e mostra vínculos OS/ORC nos cards.
- Criado `scripts/repair-kanban.mjs` para normalizar colunas, vincular cards a pedidos, sincronizar status e reordenar cards em updates.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-kanban.mjs`.

---

## [3.0.4] — 2026-08-17

### Corrigido — Clientes & CRM
- Criada camada server-side `src/lib/crm.ts` para validação e regras de produção de clientes, oportunidades e atividades.
- Cadastro/edição de cliente agora valida CPF/CNPJ, e-mail e CEP, normaliza telefone/CEP/e-mail/UF e bloqueia duplicidade de documento/e-mail.
- Exclusão de cliente virou arquivamento seguro (`status = inativo`), preservando histórico de orçamentos, pedidos, vendas, leads e atividades.
- Exclusão de oportunidade virou arquivamento no pipeline (`column = perdido`) com motivo, preservando histórico comercial.
- Leads agora validam fonte, probabilidade e cliente vinculado; etapa `ganho` ativa automaticamente o cliente.
- Atividades agora validam tipo e exigem vínculo com cliente ou oportunidade; tipos de comunicação automática foram removidos.
- UI do CRM removeu ações diretas de WhatsApp e fontes/tipos ligados ao antigo motor de comunicação.
- Criado `scripts/repair-crm.mjs` para normalizar dados legados em updates (fontes/tipos antigos, contatos e status).

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-crm.mjs` após os reparos de settings e pedidos.

---

## [3.0.3] — 2026-08-17

### Corrigido — Build / Painel de Controle
- Scripts oficiais agora usam Webpack explicitamente:
  - `npm run dev` → `next dev --webpack`
  - `npm run build` → `next build --webpack`
- Mitigada a limitação observada com Next.js 16 + Turbopack em que o Painel de Controle podia renderizar menos abas em produção.
- Documentada a decisão em `docs/TURBOPACK-LIMITATION.md`.

### Operação
- Não é necessário reinstalar o servidor. Rode `bash scripts/update.sh` para gerar build novo com Webpack e reinicie o processo.

---

## [3.0.2] — 2026-08-17

### Corrigido — Pedidos & OS
- Corrigido bug crítico em `POST /api/crud/orders`: atualizações parciais de status/prazo/prioridade não zeram mais `items`, `subtotal` e `total`.
- Criação, edição e cancelamento de pedidos agora passam por `src/lib/orders.ts`, centralizando regras de negócio.
- Criação/edição de pedido agora sincroniza, de forma transacional quando aplicável:
  - Kanban de Produção
  - Entrega/retirada
  - Lançamento financeiro
- Cancelamento agora é lógico e preserva histórico; também marca entrega e Kanban como cancelados e cria estorno financeiro.
- Kanban ganhou vínculo `order_id` para permitir sincronização confiável também em pedidos criados diretamente (sem orçamento).
- Rota `/api/crud/kanban` agora aceita `syncByOrder` além de `syncByQuote`.
- Rota `/api/crud/deliveries` agora sincroniza `orders.deliveryStatus` mesmo quando chamada diretamente.
- Criado `scripts/repair-orders.mjs` para updates em produção: vincula cards Kanban existentes a pedidos, cria entregas/financeiros ausentes e preserva dados existentes.

### Operação
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-orders.mjs` após schema/settings.

---

## [3.0.1] — 2026-08-17

### Corrigido
- Painel de Controle agora usa `config/control-panel-settings.json` como fonte canônica única para abas, campos e valores padrão.
- `scripts/ensure-settings.mjs` passa a ler a mesma fonte canônica da UI, evitando divergência entre servidor local e sandbox após updates.
- `bash scripts/update.sh` repara automaticamente configurações novas sem sobrescrever valores existentes.
- `GET /api/crud/settings` agora retorna `rows`, `groups` e `version` para diagnóstico.
- Corrigidos campos desencontrados de Kanban, Orçamentos e Calendário.
- Removidas opções de canal de entrada ligadas a comunicação automática (WhatsApp/e-mail) do Painel.

### Operação
- Após update em servidor já instalado, rode normalmente `bash scripts/update.sh`; ele executa o reparo do painel antes do rebuild.

---

## [3.0.0] — 2026-08-17

### Base limpa (breaking)

Nova linha de versão a partir de uma base reorganizada para produção.

#### Removido
- Motor completo de **comunicação** (WhatsApp / e-mail)
  - Páginas, APIs, cron, webhooks, lib e tabelas de outbox/inbox/templates/regras/consentimentos
  - Dependência `svix`
  - Itens de menu e seções do Painel de Controle ligados à central de comunicação
- Documentação legada de auditorias, erros e deploys antigos
- Scripts e bundles de deploy antigos
- Seed auxiliar `seed-full.mjs` (consolidado no fluxo oficial)

#### Adicionado
- Versionamento canônico (`VERSION` = `3.0.0`)
- Scripts oficiais de ciclo de vida:
  - `scripts/install.sh` — primeira instalação
  - `scripts/update.sh` — update com backup (sem reseed)
  - `scripts/start.sh` — start de produção
- Seeds oficiais em `scripts/seed.mjs` e `scripts/seed-calendar.mjs`
- Documentação enxuta: `README.md`, `docs/INSTALL.md`, `docs/UPDATE.md`, `docs/CHANGELOG.md`
- `.env.example` e `.gitignore` alinhados à produção
- Exemplo Nginx em `deploy/nginx-printflow.conf`
- Metadados locais em `.printflow/install.json`

#### Mantido
- App Router Next.js + PostgreSQL (Drizzle ORM)
- Módulos: Dashboard, PDV, Orçamentos, Pedidos, Clientes/CRM, Kanban, Calendário, Impressoras, Produtos, Tabelas de preços, Serviços, Estoque, Financeiro, Relatórios, Configurações
- Links manuais de WhatsApp Web nos documentos (sem envio automático)
- Campo de contato WhatsApp em clientes / empresa (cadastro apenas)

### Migração a partir de 2.x

1. Backup completo do banco e do código antigo
2. Substitua o código pela árvore 3.0.0
3. Preserve o `.env` de produção
4. Execute `bash scripts/update.sh`
5. Tabelas antigas de comunicação, se existirem, podem ser dropadas manualmente após validação:

```sql
-- opcional, somente após backup
DROP TABLE IF EXISTS communication_events CASCADE;
DROP TABLE IF EXISTS communication_inbox CASCADE;
DROP TABLE IF EXISTS communication_outbox CASCADE;
DROP TABLE IF EXISTS customer_consents CASCADE;
DROP TABLE IF EXISTS communication_rules CASCADE;
DROP TABLE IF EXISTS message_templates CASCADE;
DROP TABLE IF EXISTS communication_channels CASCADE;
DROP TYPE IF EXISTS communication_status;
DROP TYPE IF EXISTS communication_kind;
DROP TYPE IF EXISTS communication_channel;
```

---

## [2.x] — legado

Histórico anterior arquivado fora deste repositório limpo.  
Use a linha 3.0.0 como ponto zero operacional.
