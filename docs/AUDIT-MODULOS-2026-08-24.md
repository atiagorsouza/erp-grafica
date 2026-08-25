# Varredura dos módulos — 24/08/2026 (v3.68.3)

> **Somente leitura.** Nada foi alterado, nada foi executado além de
> greps e leituras de código. Este documento segue a tradição dos
> `AUDIT-*.md`: fato visto no código + sugestão.

Base inspecionada: 21 telas · 56 rotas de API · 20.111 linhas em
componentes · 14.269 linhas em `src/lib`.

---

## Sumário executivo (o que eu faria, na ordem)

| # | Item | Por quê | Custo |
|---|---|---|---|
| 1 | **Paginação nas telas que puxam tabela inteira** | `docs/PLANO-PAGINACAO.md` já mediu: Pedidos carrega TUDO (6 consultas sem limite via `queries.ts` — 16 funções, só 1 limita). Em 1 ano ≈ 2,2 MB de HTML por abertura; celular não abre | Médio — plano pronto |
| 2 | **Fechar as pendências de DADOS do parque** | Valor-hora da Bambu (R$ 2,50 — absorver o bico que saiu na 3.68.3), 5 preços BOPP estimados, vida útil da base de corte, 3 peças Konica | Baixo — é digitação, não código |
| 3 | **Operacional: re-exportar base-curada + check-version alto** | `base-curada.sql` carimba `app_version` 3.68.0 (atrasado — o smoke do sandbox pegou isso); `check-version.mjs` engole psql ausente | Baixo — 30 min |
| 4 | **Portal fase 6: o POST é stub** | `api/portal/route.ts:65` — TODO: criar orçamento rascunho + card no kanban. Portal v3.69.0 travado nas 3 decisões do §8 | Médio — depende de "vai" |
| 5 | **Quebrar os monolitos** | `PosClient` 3.175 · `OrdersClient` 2.243 · `QuotesClient` 1.769 · `ClientsClient` 1.725 linhas. Todo bug mexe em arquivo de 3 mil linhas | Alto — fazer aos poucos |
| 6 | **Webhook com assinatura** | `/api/payments/webhook` sem assinatura (mitigado: reconferência via `payment_check` antes de baixar). Se a InfinitePay passar a assinar, ativar | Baixo quando existir |

---

## Por módulo

### ✅ Saudáveis (fato constatado, sem ação)

| Módulo | Evidência |
|---|---|
| **Vendedores/Comissão** | Smoke cobre as regras: 10% sobre margem 100 = 10; >100% recusada (400); desativa em vez de apagar |
| **E-mail** | Configuração no Painel (não no .env), senha nunca vai ao navegador (`__SET__`) — v3.63.0 |
| **WhatsApp (proxy)** | Rotas com métodos explícitos, token de serviço, lições documentadas no próprio arquivo |
| **API pública** | `api-auth` falha FECHADA + comparação em tempo constante (v3.45.0) nas 10 rotas máquina-a-máquina |
| **Cadastro público** | Token com validade (`resolverToken`), checado antes de qualquer gravação |
| **Impressoras 3D** | Recém-corrigido na 3.68.3 (filamento = material; horas = máquina) |

### 🔶 Com melhoria barata

**Pedidos / Clientes / Orçamentos / Produtos** — puxam tabela inteira
(`queries.ts` tem 16 consultas, 1 limita; Clientes faz 7 chamadas por
abertura). A paginação no servidor é o item 1 do sumário. Índices das
buscas já existem (nome, número, status, created_at) — o problema é só
volume transportado.

**Cobranças/Pagamentos** — webhook sem assinatura (reconferido, ok
hoje). Quando a InfinitePay suportar HMAC, ativar. Além disso: o
comprovante na tela de retorno é bom; falta **reenvio de comprovante
por WhatsApp/e-mail** a partir da ficha do pedido (o módulo de mensagens
já existe — é ligar).

**Dashboard** — usa o mesmo `queries.ts` sem limite; com paginação
resolvida no item 1, já melhora junto.

**Consulta Rápida** — v2 pronta (unidades por faixa). Falta só a
saída física: **tabela em PDF e etiqueta NIIMBOT** (já anotado como
pendência).

### 🔶 Com melhoria estrutural (quando der)

**PDV (3.175 linhas)** — o maior arquivo do sistema. Funciona, mas cada
melhoria nova custa mais caro. Quebrar em `PosCatalog`, `PosCart`,
`PosPayment`, `PosCashSession` (o esqueleto de sessão de caixa já é
rota própria).

**Estoque** — contagem tem auxílio (código de barras na ficha do
material), mas não vi **inventário cego X conferido** nem alerta de
estoque mínimo no Dashboard. Vale conversar se o dono sente falta.

**Relatórios** — períodos funcionam (smoke cobre período
personalizado). Não vi exportação CSV/PDF — com 200 clientes reais
chegando, o dono vai pedir.

**Kanban/Calendário** — pequenos e corretos (358 linhas). Sem ação.

**Health check** — hoje `select 1`. Barato enriquecer: versão do
pacote, BUILD_ID, fila do serviço WhatsApp, espaço em disco — num
incidente como o de 24/08 isso encurta o diagnóstico.

---

## Pendências conhecidas (já anotadas em outros docs — só reuni aqui)

1. Importar os **200 clientes reais** (planilha → `crm/import`).
2. **Faixas por quantidade** não puxam sozinhas no Orçamento — decisão
   consciente (orçamento é negociação); rever se o dono quiser.
3. Portal v3.69.0 — 3 decisões do §8 do plano em aberto.
4. Re-exportar `base-curada.sql` com `app_version` em dia.

---

## O que eu NÃO recomendo mexer agora

- **Autenticação interna do ERP** — o Cloudflare Access É o login
  (decisão do dono). Duplicar com sessão própria é custo sem ganho.
- **`pricing.ts` (991 linhas)** — denso mas com históricos de correção
  documentados; só entrar com teste no bolso.
- Consumíveis de 2D (toner/tinta) — modelo certo, não generalizar a
  mudança da 3D para eles.
