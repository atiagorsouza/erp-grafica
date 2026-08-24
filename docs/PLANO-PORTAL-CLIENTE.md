# PLANO-PORTAL-CLIENTE — catálogo e pedido em cliente.vtdigital.com.br

> Estado: **PAPEL** — nada construído ainda. Este documento é o contrato
> entre dono e programador antes do primeiro commit de código. Decidiu-se
> assim em 2026-08-24: "quero que tenhamos construído tudo no papel para
> depois atacar — e não dar nada errado".
>
> Regra deste plano: nenhuma linha de código antes de o dono dizer **vai**.
> Tudo que está aqui foi verificado no código existente (v3.68.1) — as
> referências a arquivos são reais, não suposição.

---

## 0 · Resumo em 5 linhas

1. Catálogo online + pedido de orçamento em **`cliente.vtdigital.com.br`**,
   app Node/Express na Hostinger (plano já confirmado pelo painel: apps
   Node, Express, Node 22, deploy por zip — hoje 1 de 5 apps em uso).
2. O ERP na gráfica **empurra o catálogo e puxa os pedidos** — tudo
   conexão de SAÍDA. Nenhuma porta aberta, DNS intocado, e-mail intocado.
3. Pedido do cliente nasce **sempre como rascunho de orçamento**, preço
   zerado "a orçar" — internet não entra direto na produção (regra que
   já está escrita no TODO "fase 6" de `src/app/api/portal/route.ts`).
4. Fases: catálogo+pedido (v3.69.0) → notificação WhatsApp (v3.70.0) →
   aprovação de orçamento (v3.71.0) → acompanhamento de OS (v3.72.0) →
   aprovação de arte (v3.73.0).
5. No ERP, muda pouco: 1 rota ganha corpo de verdade, 1 script novo,
   1 tabela aditiva de idempotência. Nada renomeado, nada removido.

---

## 1 · Decisões já tomadas (e o porquê de cada uma)

### D1 — Sistema separado na Hostinger, não dentro do ERP
**Decisão do dono.** O painel da Hostinger mostra plano com 5 aplicações
web Node (1 usada — `ponte-voip`), deploy por zip, preset Express,
Node 22.x.

Por que é a certa aqui:

- O ERP roda **na gráfica**, atrás de internet residencial. Página
  pública dentro dele exigiria túnel + excessão no Cloudflare Access —
  mais peça sensível na infraestrutura de produção.
- Site público na Hostinger fica **sempre no ar**, perto do cliente,
  sem depender da internet da gráfica.
- A verdade dos dados (preço, estoque, pedido) continua **na gráfica** —
  o site não guarda nada que envelhece, só cache.

### D2 — Sincronização empurra/puxa, SEM túnel na v1
O ERP conversa com a Hostinger; a Hostinger **nunca** inicia conexão
com a gráfica.

```
ERP na gráfica (Bangu)                         cliente.vtdigital.com.br
scripts/portal-sync.mjs (systemd timer, 2 min) (Hostinger · Express · Node 22)
                                               │
 1. EMPURRA catálogo ────────────────────────► POST /api/catalogo (com chave)
    (só quando o hash muda)                      grava data/catalog.json
 2. PUXA pedidos ◄───────────────────────────── GET /api/pedidos-pendentes
 3. CRIA orçamento (localhost)                   fila data/orders.json
    POST /api/portal (com chave)
    → createQuote() → RASCUNHO
 4. CONFIRMA entrega ────────────────────────► POST /api/pedido/:id/ack
```

**Trade-off honesto:** o pedido chega ao ERP com atraso de até ~2 min.
Pra gráfica (não é bolsa de valores) sobra. Se um dia tempo real valer,
o upgrade é o Cloudflare Tunnel — e o **contrato de API não muda**:
o site passa a chamar `/api/portal` direto; o script de sync vira
desnecessário. Nada reescrito, só desligado.

Por que não o túnel já na v1: moveria o DNS do domínio pra Cloudflare
(e o e-mail do domínio mora aí), adicionaria processo na servidor da
gráfica e seria mais uma coisa pra diagnosticar no `SOCORRO-*.md`.

### D3 — "Fazer pedido" = pedir ORÇAMENTO
Preço final de gráfica depende de tamanho, acabamento, quantidade —
o motor de precificação calcula com o operador. Então:

- Site mostra **"a partir de R$ X"** (o `finalPrice` do produto).
- Cliente escolhe produto, descreve o que quer, deixa nome + WhatsApp.
- Nasce **rascunho com itens a preço 0** ("a orçar"). O
  `priceWarnings()` existente já acusa preço abaixo da referência — o
  operador vê o aviso e usa o motor pra fechar o número.
- Depois de fechar, o fluxo é o de sempre: enviar → aprovar → OS.
  **Produção só começa com entrada paga (50/50)** — regra que já existe
  (`depositPaidAt` nulo = não entra em produção).

### D4 — v1 sem fotos
Não existe campo de imagem em `products`. As categorias já têm
`icon` (emoji) e `color` (hex) — a vitrine sai bonita e limpa com isso.
Fotos entram depois como campo aditivo, sem quebrar nada.

### D5 — Sem login de cliente na v1
Catálogo é público; pedido é identificado por nome + WhatsApp (os mesmos
dados que o bot já coleta). Acompanhamento de OS (v3.72.0) usará
**link mágico por cliente** — padrão já provado pelo `/cadastro/[token]`.

---

## 2 · O que JÁ existe e é reaproveitado (verificado)

| Peça | Arquivo | Como entra |
|---|---|---|
| API pública com chave | `src/app/api/portal/route.ts` (v3.45.0) | GET existe (lista plana); POST é stub — ganha corpo |
| Guarda de auth | `src/lib/api-auth.ts` | `guardPublicApi`: chave no header, tempo constante, falha fechada, rate limit 120/min. **Intocada** |
| Criação de orçamento | `src/lib/quotes.ts` → `createQuote()` | Reusada como está: status `rascunho`, canal novo `Portal do Site` |
| Numeração | `nextDocumentNumber("quote")` | ORC-2026-XXXX automático, contadores já consertados na v3.68.1 |
| Telefone | `src/lib/phone.ts` | `toE164BR` / `phoneKey` para validar e casar cliente |
| Categorias 2 níveis | `item_categories` (module `product`) | Mestre → subcategoria, com `icon`, `color`, `order` |
| Preço "a partir de" | `products.finalPrice` (+ `product_price_tiers` no futuro) | v1 = `finalPrice`; depois, mínimo considerando faixas |
| Aviso de preço | `priceWarnings()` em `quotes.ts` | Item a preço 0 gera warning pro operador |
| Smoke | `scripts/e2e-smoke.mjs` | Ganha seção nova (ver §3.4) |

**Correção de uma expectativa antiga:** rascunho **NÃO** gera card no
kanban — `syncKanbanForQuote()` só cria card quando o orçamento é
**aprovado**. O pedido do portal aparece em **`/orcamentos`** (rascunho,
canal "Portal do Site"). Isso é o comportamento correto e fica assim.

---

## 3 · Lado ERP — o que exatamente muda (v3.69.0)

### 3.1 `GET /api/portal` — enriquecer o retorno

Hoje devolve lista plana. Passa a devolver o catálogo completo pronto
pra vitrine (27 produtos — payload minúsculo, sem paginação):

```jsonc
{
  "module": "customer-portal",
  "generatedAt": "2026-08-24T14:00:00-03:00",
  "catalogHash": "sha256:9f2c…",     // sync só empurra quando muda
  "categories": [
    {
      "id": 1, "name": "Gráfica Rápida", "icon": "🖨️",
      "color": "#06b6d4", "order": 1,
      "subcategories": [
        { "id": 11, "name": "Serviços de Balcão", "order": 1 }
      ]
    }
  ],
  "products": [
    {
      "id": 7, "name": "Cartão de visita 4x4", "sku": "CV44",
      "categoryId": 11, "description": "…",
      "fromPrice": 25.0
    }
  ]
}
```

Regras:
- Só `item_categories` com `module = 'product'`; hierarquia em 2 níveis
  (`parentId` nulo = mestre); ordenação por `order`, depois nome.
- Só produto `active = true`.
- **Nunca** sai daqui: `costSnapshot`, margem, custo — regra que já
  existe no GET atual e continua valendo pra tudo que o portal serve.
- `fromPrice` = `finalPrice` (numérico, já em reais). Faixas por
  quantidade (`product_price_tiers`) entram como refinamento futuro.

### 3.2 `POST /api/portal` — implementar o TODO "fase 6"

Contrato de entrada:

```jsonc
{
  "orderId": "pt_8f3ka92x",            // gerado pelo SITE — idempotência
  "customer": {
    "name": "Maria Silva",             // ≥ 2 caracteres
    "whatsapp": "21999998888",         // validado com toE164BR
    "email": null                      // opcional
  },
  "items": [
    {
      "productId": 7,                  // deve existir e estar ativo
      "description": "Cartão de visita 4x4 — couché 300g, 1000 un",
      "quantity": 1000
    }
  ],
  "notes": "Preciso pra sexta que vem"
}
```

Comportamento, em ordem:

1. **Zod valida tudo** (mesmos limites do `itemSchema` de quotes:
   descrição ≤ 240, quantidade ≤ 1.000.000; nome ≥ 2; WhatsApp
   brasileiro válido).
2. **Idempotência**: tabela nova `portal_orders`
   (`order_id text unique`, `quote_id`, `created_at`). Se `orderId`
   já foi importado → responde `{ ok, quote: { number }, duplicate: true }`
   **sem** criar nada. É o que impede pedido duplicado quando o sync
   cai exatamente entre criar o orçamento e confirmar o ack.
3. **Casa cliente pelo WhatsApp** normalizado (`phoneKey`): existe
   `customers.whatsapp`/`phone` com esse número → usa o id. Não existe
   → cria cliente PF mínimo (nome + whatsapp). **Nunca duplica** —
   mesma regra do bot e do cadastro público.
4. **`createQuote()`** com:
   - `status: "rascunho"` (sempre — sem exceção, sem parâmetro pra mudar)
   - `channel: "Portal do Site"`, `sellerName: "PORTAL"`
   - itens com `unitPrice: 0` e `productId` vinculado
   - `notes: "[Pedido do portal pt_8f3ka…] <o que o cliente escreveu>"`
     (o protocolo fica gravado no orçamento pra rastreio)
5. Resposta: `{ ok: true, quote: { number: "ORC-2026-0123" } }`.
   Nenhum outro dado do cliente volta (a chave é máquina-a-máquina,
   mas não há motivo pra devolver mais).
6. Auth continua `guardPublicApi` (chave + rate limit). Quem chama na
   prática é o `portal-sync.mjs` **no localhost** — um único caminho de
   código, hoje via sync e amanhã via túnel, sem mudança.

### 3.3 `scripts/portal-sync.mjs` — novo (e `systemd timer` na gráfica)

Ciclo (rodando a cada 2 min, usuário do ERP, sem root):

1. `GET http://127.0.0.1:3000/api/portal` (chave do `.env`)
   → se `catalogHash` ≠ do último empurrado:
   `POST {PORTAL_SITE_URL}/api/catalogo` com o JSON (chave de sync).
2. `GET {PORTAL_SITE_URL}/api/pedidos-pendentes` (chave de sync)
   → para cada pedido: `POST http://127.0.0.1:3000/api/portal`
   → sucesso: `POST …/api/pedido/{id}/ack`.
3. Falha de rede em qualquer passo = log de 1 linha e segue; o próximo
   ciclo tenta de novo (fila + idempotência seguram o resto).

Config nova no `.env` da gráfica (documentada, nada de default escondido):
`PORTAL_SITE_URL`, `PORTAL_SYNC_KEY`. A chave da API interna é a que já
existe em `PORTAL_API_KEYS`.

Estado do último hash: arquivo `data/portal-sync-state.json`
(gitignored) — sem tabela, sem coluna.

### 3.4 Smoke — seção nova em `scripts/e2e-smoke.mjs`

- GET `/api/portal` **sem** chave → 401 (falha fechada)
- GET com chave → 200; `categories` em 2 níveis; `products` com
  `fromPrice`; **nenhum** campo de custo/margem no payload
- POST corpo inválido (sem nome / WhatsApp errado / item vazio) → 422
- POST válido → 200; orçamento **rascunho** criado com canal
  "Portal do Site"; cliente criado; **segundo** POST com mesmo WhatsApp
  → cliente não duplicado
- Mesmo `orderId` de novo → `duplicate: true`, quantidade de orçamentos
  não muda
- Limpeza dos dados de teste no fim (padrão do smoke: apaga o que criou)

Contagem de ✅ sobe de 303 → ~315 (número exato registrado no
`ONDE-ESTAMOS.md` no fechamento da versão).

### 3.5 O que NÃO muda no ERP (lista explícita)

- Nenhuma tabela renomeada ou removida. Única mudança de banco:
  **CREATE TABLE `portal_orders`** (aditiva, entra no
  `scripts/migrar-banco.mjs`, que é idempotente) + no `schema-update.sql`.
- Documentos de impressão (`#order-print-a4`, `#quote-print-a4`,
  `#receipt-print`) — **intocados**.
- `/api/crud/*` — intocados.
- Fluxo orçamento → pedido → produção — intocado. O portal só alimenta
  a **entrada** do funil.
- `guardPublicApi`, rate limit, formato de chave — intocados.

---

## 4 · Lado site — pasta nova `portal-cliente/` (deploy separado)

Stack: **Express + HTML de template strings + 1 CSS**. Sem build, sem
framework, sem banco. Deps: `express` apenas. Sobe por zip no painel
da Hostinger (mesmo fluxo do `ponte-voip`: root dir, Express, Node 22).

```
portal-cliente/
  package.json          # start: node server.js
  server.js             # Express, PORT do painel
  lib/catalog.js        # data/catalog.json + hash em memória
  lib/queue.js          # data/orders.json — fila append + ack
  lib/keys.js           # x-sync-key em timing-safe (espelho do api-auth)
  lib/rate.js           # rate limit por IP no POST /api/pedido
  public/style.css      # mobile-first, cores VT
  views/*.js            # funções que retornam HTML (sem JSX, sem build)
  LEIA-ME-HOSTINGER.md  # passo a passo do painel, do jeito do dono
```

### 4.1 Rotas

| Rota | Auth | O que faz |
|---|---|---|
| `GET /` | pública | Vitrine: categorias → subcategorias → produtos, "a partir de R$X" |
| `GET /produto/:id` | pública | Detalhe + formulário de pedido |
| `POST /api/pedido` | pública + rate 5/h/IP + honeypot | Valida, gera `orderId` + protocolo curto, enfileira |
| `GET /obrigado` | pública | Confirmação com protocolo `PT-XXXX` e WhatsApp da gráfica |
| `GET /api/catalogo` | x-sync-key | Hash atual (o sync pergunta antes de empurrar) |
| `POST /api/catalogo` | x-sync-key | Recebe catálogo novo, grava no disco, troca hash |
| `GET /api/pedidos-pendentes` | x-sync-key | Lista fila não entregue (máx 50 por vez) |
| `POST /api/pedido/:id/ack` | x-sync-key | Marca entregue (mantém 30 dias, depois apaga) |

### 4.2 Telas (wireframe)

```
┌───────────────────────────────┐  ┌───────────────────────────────┐
│ VT · Gráfica                  │  │ ← Cartão de visita 4x4        │
│                               │  │                               │
│ 🔍 Buscar…                    │  │ a partir de R$ 25,00          │
│                               │  │ (descrição do produto)        │
│ 🖨️ GRÁFICA RÁPIDA             │  │                               │
│  ├ Serviços de Balcão         │  │ ── Pedir orçamento ────────── │
│  │  [Cartão 4x4] [Banner]     │  │ Quantidade: [1000]            │
│  │  [Chapa] …                  │  │ Detalhes (tamanho, papel,     │
│ 🎁 BRINDES                    │  │   acabamento):                │
│  ├ Canecas                    │  │ [________________________]     │
│  │  [Caneca 3D] …              │  │ Seu nome*: [Maria Silva    ]  │
│                               │  │ WhatsApp*: [(21) 99999-8888 ]  │
│ (grupos por categoria mestre, │  │ Observações: [_____________]   │
│  ícone e cor da categoria)    │  │        [ Pedir orçamento ]    │
└───────────────────────────────┘  └───────────────────────────────┘
┌───────────────────────────────┐
│ ✔ Recebemos seu pedido!       │
│ Protocolo: PT-8F3K            │
│ Vamos te chamar no WhatsApp   │
│ (21) … para fechar o preço.   │
│ [Voltar ao catálogo]          │
└───────────────────────────────┘
```

Detalhes de comportamento:
- **Catálogo ainda não publicado** (site novo, sync não rodou): página
  "catálogo em publicação" com telefone/WhatsApp da gráfica — nunca
  página branca.
- Honeypot: campo invisível "empresa" — bot preenche, humano não;
  preenchido = descarta silenciosamente (responde 200 igual).
- Protocolo curto (`PT-8F3K`, Base58 do `orderId`) é o que o cliente
  vê. O número real (`ORC-2026-0123`) só existe quando o ERP importa —
  a v3.70.0 leva ele ao cliente por WhatsApp (ver §6).
- Fila em `data/orders.json`: append atômico (escreve tmp + rename),
  nunca perde pedido por queda no meio da escrita.

---

## 5 · Segurança e falhas ("não dar nada errado")

### 5.1 Modelo de ameaça, curto e honesto

- **Duas chaves, papéis separados:**
  - `PORTAL_API_KEYS` (já existe) — só no `.env` **da gráfica**. O site
    **não tem** essa chave.
  - `PORTAL_SYNC_KEY` — nova; existe na gráfica (sync) e no site (env
    do painel). Protege catálogo-push e fila-de-pedidos. Timing-safe
    nos dois lados. Rotacionável trocando nos dois ambientes (receita
    no LEIA-ME).
- O que atravessa a internet: catálogo (público por natureza) e pedidos
  (nome + WhatsApp + texto) — os mesmos dados que o bot já coleta.
- Site não tem senha, não tem login, não guarda cartão, não vê preço de
  custo, não conhece o banco da gráfica.
- Abuso do form: rate limit por IP + honeypot + validação server-side +
  limites de tamanho. Pedido falso = um rascunho que o operador arquiva.
  Custo baixo por design (rascunho não move produção nem financeiro).
- HTTPS: Let's Encrypt pelo painel da Hostinger (item do checklist).

### 5.2 Tabela de falhas — o que acontece quando cada coisa cai

| Falha | Comportamento | Perda? |
|---|---|---|
| Internet da gráfica cai | Site segue no ar com o último catálogo; pedidos acumulam na fila; sync retoma sozinho no próximo ciclo | nenhuma |
| Hostinger fora do ar | Sync loga e tenta em 2 min; nenhum dado muda na gráfica | nenhuma |
| ERP reinicia no meio do sync | Orçamento criado mas ack não enviado → próximo ciclo repuxa → `orderId` já existe → `duplicate: true` | nenhuma (idempotência) |
| Dois cliques do cliente (double submit) | Site desabilita o botão; se ainda assim chegar 2× com `orderId`s distintos, são 2 rascunhos — operador arquiva um | aceitável |
| Sync empurra catálogo corrompido | Site valida shape antes de gravar (zod-like manual); inválido = mantém o anterior | nenhuma |
| Alguém descobre a sync key | Pode envenenar catálogo / ler pedidos → rotação documentada; dano limitado (catálogo é público, pedidos são nome+fone) | contido |
| Catálogo vazio no ERP | `GET /api/portal` devolve `products: []` → site mantém o último bom (hash não muda pra vazio? muda — regra: só publica se `products.length > 0`) | nenhuma |

### 5.3 Regras de ouro herdadas (não negociáveis)

- 4 gates antes de fechar: `typecheck` limpo · `lint` = 11 ·
  `build` com `.next/BUILD_ID` · `e2e:smoke` com tudo ✅.
- Nunca `npm install --omit=dev`.
- Banco: só coluna/tabela **aditiva**; migração idempotente.
- `import "server-only"` nas libs de domínio — nada disso vaza pro site.
- Fechamento de versão: `release.sh` → tag → `pack.sh` → `update-<v>/`
  com LEIA-ME → `ONDE-ESTAMOS.md` atualizado (o dono cobra).

---

## 6 · Fases seguintes (cada uma = uma versão com gates)

| Versão | O que entrega | Depende de |
|---|---|---|
| **v3.69.0** | Tudo deste documento: GET enriquecido, POST real + idempotência, `portal-sync.mjs`, site `portal-cliente/`, smoke, docs, deploy | — |
| **v3.70.0** | WhatsApp automático: "recebemos seu pedido, orçamento ORC-2026-0123" pro cliente + aviso pro dono (usa `mensagens.ts`, gateway que já existe) | v3.69.0 |
| **v3.71.0** | **Orçamento público**: link mágico por orçamento, botões Aprovar / Pedir ajuste (pendência antiga do `ONDE-ESTAMOS`) | v3.69.0 |
| **v3.72.0** | **Acompanhamento de OS**: link mágico por cliente (padrão `/cadastro/[token]`), etapa/prazo/saldo | v3.71.0 |
| **v3.73.0** | **Aprovação de arte** pelo cliente (`art_approvals` já existe no ERP) | v3.72.0 |
| futuro | Fotos no catálogo · refinamento de "a partir de" com faixas · carrinho só p/ itens de preço fixo · túnel p/ tempo real | — |

---

## 7 · Deploy na Hostinger — passo a passo (executado no dia do ataque)

1. Painel Hostinger → Sites → **Adicionar aplicação**: subdomínio
   `cliente.vtdigital.com.br`, preset **Express**, **Node 22.x**,
   diretório raiz `portal-cliente`.
2. Gerar `PORTAL_SYNC_KEY` (`openssl rand -base64 32`) → variável de
   ambiente **no painel** (nunca no zip).
3. `bash scripts/pack-portal.sh` → `portal-cliente.zip` (sem
   `data/`, sem `.env`) → upload / Reimplantar.
4. HTTPS no painel (Let's Encrypt) — ligar.
5. Na gráfica: `.env` ganha `PORTAL_SITE_URL` e `PORTAL_SYNC_KEY`;
   instalar o timer do `portal-sync.mjs` (systemd user timer, 2 min).
6. Teste ponta a ponta com pedido real: site → fila → sync → rascunho
   em `/orcamentos` (canal "Portal do Site").

---

## 8 · Decisões ainda abertas (nenhuma trava a v3.69.0)

1. **Canal/seller do rascunho**: proposta `Portal do Site` / `PORTAL`.
   Confirmar (aparece em relatórios por canal).
2. **Preço na vitrine**: proposta **mostrar** "a partir de" (catálogo
   sem preço não converte). Alternativa: só "consultar".
3. **Nome do app no painel**: `portal-cliente` (fica `cliente.`
   no domínio de qualquer jeito).

---

## 9 · Ordem de ataque (quando o dono disser "vai")

1. `GET /api/portal` enriquecido (+ `catalogHash`)
2. `POST /api/portal` real + tabela `portal_orders` + migração
3. Seção nova no smoke
4. `portal-cliente/` completo (site)
5. `scripts/portal-sync.mjs` + `pack-portal.sh`
6. **Ponta a ponta no sandbox**: site no ar (preview), pedido real,
   sync rodando, rascunho aparecendo no ERP — dono vê funcionando
7. `docs/SETUP-PORTAL-CLIENTE.md` + `ONDE-ESTAMOS.md` + LEIA-ME do site
8. 4 gates (typecheck · lint 11 · build+BUILD_ID · smoke)
9. `release.sh 3.69.0` → tag → `pack.sh` → `update-3.69.0/`
10. Deploy guiado na Hostinger (§7) com o dono

---

*Documento escrito sobre a v3.68.1 (b500963). Toda referência de
arquivo foi verificada no código. Mudou o código, muda este papel.*
