# Auditoria geral — 27/08/2026 (v3.71.0)

> **Método:** sistema levantado do zero e **exercitado de verdade** —
> PostgreSQL 18.4, schema aplicado, base curada carregada, build de
> produção, 20 telas navegadas, APIs atacadas com entrada hostil e
> concorrência real. Não é leitura de código: cada item abaixo tem
> comando e saída.
>
> Isso muda o peso das conclusões em relação às auditorias anteriores
> (`AUDIT-MODULOS-2026-08-24.md` foi explicitamente "somente greps").

---

## Veredito

**O sistema está saudável.** Não encontrei bug que ameace dado ou
dinheiro. Os pontos abertos são de robustez e escala, não de correção.

| Verificação | Resultado |
|---|---|
| 20 telas do menu | **200**, sem erro de runtime |
| Smoke ponta a ponta | **308/308** ✔ |
| Typecheck | limpo |
| Lint | **0** (era 15; baseline histórica era 11) |
| Build / BUILD_ID | gerado ✔ |
| Integridade referencial | **0 órfãos** |
| Precificação | **0 anomalias** |
| Contraste de campos | 13 medidos, todos > 3:1 |

---

## 1. Corrigido nesta rodada

### 1.1 SKU duplicado devolvia 500 🔴 (bug real, encontrado em execução)

Apareceu no log durante o smoke:

```
duplicate key value violates unique constraint "products_sku_unique_idx"
POST /api/crud/products 500
```

Havia uma rede de segurança na rota traduzindo o erro para 409, mas ela
só agia **depois** do Postgres recusar: transação estourada, stack
completa no log, e a mensagem ao operador era genérica — "Já existe um
produto com este SKU", **sem dizer qual**. Com dois mil itens no
catálogo, isso não ajuda ninguém a achar o duplicado.

**Consertado** em `createProduct` e `updateProduct`: guarda prévia no
mesmo padrão que o `barcode` já usava (que estava certo desde a
v3.66.0 — a guarda foi feita lá e esquecida aqui). Agora responde 409
nomeando o produto conflitante, sem exceção no log. Status mantido em
409 de propósito, para não quebrar quem consome a API.

### 1.2 Lint: 15 → 0

Três famílias, todas com efeito real e não apenas cosmético:

- **`setState` síncrono dentro de `useEffect`** (`TopBar`, `MobileNav`)
  — cascata de render, erro no React 19. `MobileNav` virou state
  derivado da rota: a gaveta já sai fechada no primeiro render, sem
  frame intermediário com o menu aberto por cima do conteúdo.
- **`PrintersEngine`** — o achado mais interessante: um `useMemo`
  manual cujas dependências vinham de `.find()` sobre arrays
  recalculados fazia o React Compiler **desistir de otimizar o
  componente inteiro** ("existing memoization could not be preserved").
  Uma micro-otimização escrita à mão estava custando a otimização
  automática de tudo. Removida — a conta é aritmética simples.
- **Aspas não escapadas** em `CalendarClient` e `ProductsClient`.

### 1.3 Healthcheck enriquecido

Era `select 1` → `{ok:true}`. Sinal de vida, mas inútil no incidente.

Agora responde numa chamada só: versão do código × versão carimbada no
banco, `BUILD_ID`, **qual banco o ERP está lendo** (host/porta/nome, sem
credencial), latência do banco, uptime e uma lista de `avisos`.

**Por que isso importa:** no incidente de 25/08 o ERP lia
`app_db_recuperado` e o motor do WhatsApp escrevia no banco antigo —
ninguém percebeu porque nada dizia em qual banco o ERP estava. Testei a
detecção simulando a condição:

```
banco carimbado 3.68.0 (código 3.71.0)
→ ok: true
  emDia: false
  avisos: ["versão divergente: código 3.71.0, banco 3.68.0 — rode check-version.mjs --fix"]
```

Divergência entra como **aviso, não como queda** (o sistema funciona,
só precisa do carimbo). Contrato antigo preservado: `{ok:true}` e o
status 200/500 continuam, então monitor externo e `healthcheck.sh` não
quebram.

---

## 2. Verificado e aprovado (com prova)

### Segurança

| Teste | Resultado |
|---|---|
| Portal sem chave | **401** ✔ (falha fechada) |
| Portal com chave errada | **401** ✔ |
| Token de sessão forjado | **401** ✔ (HMAC, tempo constante) |
| Ação inexistente no portal | **400** ✔ |
| SQL injection na busca (`' OR 1=1--`) | 200, sem vazamento (Drizzle parametriza) ✔ |
| ID acima do limite do integer | **405/400**, não 500 ✔ |
| Payload de 100 KB | **400** ✔ |
| JSON malformado | **400** ✔ |
| `NEXT_PUBLIC_*` com segredo | **nenhum** ✔ |
| `console.log` em produção | **0** ✔ |
| `: any` explícito | **1** em toda a base ✔ |

### Concorrência (dinheiro e estoque)

Teste real: material com saldo **5**, vinte saídas de 1 disparadas em
paralelo.

```
aceitas: 5 de 20 | saldo final: 0.000
✅ saldo nunca ficou negativo
```

O smoke cobre o mesmo para sangria de caixa e recebimento de compra.

### Fuso horário (a armadilha nº 1 do manual)

`created_at` é `timestamp without time zone` guardando UTC. A conversão
correta exige `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'` —
pular o primeiro joga a venda da noite para o dia seguinte.

Varredura: **todas** as conversões (`reports.ts`, `comissao.ts`,
`crm-alertas.ts`) estão corretas. **Zero** ocorrências de `::date` sem
a dupla conversão.

### Integridade dos dados

```
quote_items órfãos ......... 0
orders com cliente fantasma  0
materiais com saldo negativo 0
produtos com preço zerado .. 0
produtos vendidos no prejuízo 0
margem fora de 0..1 ........ 0
faixas de preço duplicadas . 0
faixas invertidas .......... 0
```

### Correções de rumo em documentos anteriores

Duas coisas que as auditorias antigas listam como pendência **já não
são verdade**:

1. **"Portal fase 6: o POST é stub"** (`AUDIT-MODULOS-2026-08-24.md`
   item 4) — **desatualizado**. O portal foi implementado na v3.69.0:
   login por código no WhatsApp, sessão HMAC de 30 dias, pedido virando
   orçamento rascunho, endereços. Testado e respondendo.
2. **"`pricing.ts` deve ter `import server-only`"**
   (`MANUAL-DO-PROGRAMADOR.md` §6.2) — **incorreto e perigoso se
   seguido**: `pricing.ts` é importado por 11 client components. Ele é
   matemática pura (zero acesso a banco, zero `process.env`), então
   está **certo** sem `server-only`. Adicionar quebraria a build.

---

## 3. Aberto — por ordem de risco real

### 🟠 A. Consultas sem limite (o único com risco de escala)

`src/lib/queries.ts`: **60 consultas, 4 com `.limit()`**. Pedidos,
Clientes e Orçamentos já ganharam paginação no servidor (v3.62.0), mas
o Dashboard e as telas restantes ainda puxam tabela inteira.

Hoje não dói (4 clientes, 27 produtos). Com o volume de 1 ano medido em
`docs/PLANO-PAGINACAO.md`, a página de Pedidos ia a 10,4 MB antes da
paginação. **É o item que vai machucar primeiro conforme a base cresce.**

Plano já existe e está escrito. Falta executar para PDV, Estoque e
Financeiro (passo 5b do plano).

### 🟠 B. Monolitos

```
PosClient      3.339 linhas
OrdersClient   2.243
QuotesClient   1.769
ClientsClient  1.725
```

Não é bug — funciona. É custo: **todo conserto no PDV mexe num arquivo
de 3,3 mil linhas**, o que aumenta a chance de quebrar algo ao lado.
Quebrar em `PosCatalog` / `PosCart` / `PosPayment` / `PosCashSession`
(a sessão de caixa já é rota própria, então o corte é natural).

Trabalho de fôlego. Recomendo fazer **um por vez, entre versões**, nunca
junto com correção de bug.

### 🟡 C. Webhook de pagamento sem assinatura

`/api/payments/webhook` aceita sem validar HMAC. **Mitigado hoje**: o
sistema reconfere o pagamento na InfinitePay (`payment_check`) antes de
dar baixa — testei, um `order_nsu` inexistente é rejeitado e logado.
Quando a InfinitePay oferecer assinatura, ativar.

### 🟡 D. Dois produtos sem faixa começando em 1

`Cartão de visita 9x5 cm` e `Panfleto 14x10 cm`. A tela **já avisa**
("Nenhuma faixa começa em 1 unidade"), então é decisão de negócio, não
bug: se alguém pedir 1 unidade, o preço sai do cálculo, não da tabela.
Só confirme se é o que você quer.

### 🟢 E. Sem exportação CSV/PDF nos relatórios

Não existe. Com 200 clientes reais chegando, você vai pedir.

---

## 4. Layout e design

**O que dá para afirmar:** as 20 telas respondem sem erro; contraste de
campos aprovado (13 medidos, todos acima de 3:1); as duas tabelas sem
`overflow-x-auto` são de **impressão A4** (`OrdersClient:1887`,
`QuotesClient:1513`) — correto, não são bug de tela; os `grid-cols-3/4`
sem breakpoint que restam são de documento A4 ou de blocos de 3 campos
curtos (CEP/número/complemento), que cabem.

**O que eu NÃO posso afirmar — e não vou fingir que posso:** não há
navegador no ambiente. Toda a análise é sobre o **HTML servido**, não
sobre a página **renderizada**. Isso não cobre:

- fonte pequena demais no celular real
- sobreposição de elementos
- botão saindo da borda
- teclado do celular cobrindo o campo em foco

É exatamente a mesma limitação registrada na v3.61.0. **Para consertar
layout de verdade eu preciso de prints seus**, ou de você me dizendo
qual tela está torta e em que aparelho.

---

## 5. O que eu faria em seguida (minha recomendação)

1. **Mergear a v3.71.0** e mandar a ordem ao agente do servidor.
2. **Layout com print na mão** — você navega, aponta o que está feio, eu
   conserto. É o único jeito honesto de fazer isso.
3. **Paginação nas telas que faltam** (item 3.A) — antes de doer.
4. **Quebrar o `PosClient`** — o maior arquivo, o módulo mais crítico.
5. **Exportação CSV nos relatórios** — barato e some da lista.

---

*Auditoria feita com o sistema rodando, não por leitura de código.
Todos os comandos e saídas estão reproduzidos acima.*
