## [3.68.11] — 2026-08-25

- Lembrete de cobranca por WhatsApp — sininho nas cobrancas pendentes

## [3.68.10] — 2026-08-25

- Moldura na Consulta Rapida (textos da grafica) + fim dos orcamentos fantasma

## [3.68.9] — 2026-08-25

- Blindagem: tabelas do WhatsApp sob gestao do schema do ERP — nenhum deploy apaga mais conversas

## [3.68.8] — 2026-08-25

- Ficha 360º no chat do WhatsApp: balcão, orçamentos e cobranças na conversa; cadastro de cliente sem sair do chat

## [3.68.7] — 2026-08-25

- Receita do InfinitePay identifica quem pagou; avulsa com cliente

## [3.68.6] — 2026-08-25

- Volta do pagamento cai no comprovante certo; cliente nao ve o sistema

## [3.68.5] — 2026-08-25

- PDV cobra por link na hora; WhatsApp com numero do cliente

## [3.68.4] — 2026-08-25

- Deploy acha o banco sozinho; sem banco para alto

## [3.68.3] — 2026-08-24

- 3D: filamento e material do estoque, impressora cobra so horas

# Changelog — PrintFlow ERP

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).  
Versionamento: [SemVer](https://semver.org/lang/pt-BR/).

---

## [3.68.2] — 2026-08-24

Cartela na Consulta Rápida, incidente do update (backup obrigatório), pagamento com comprovante e URL pública automática.

- **PEÇA 0 · Unidade de venda**: `products` ganha `sale_unit_label` e
  `sale_unit_pieces` (aditivas); família `ADES-%` semeada como
  "cartela"; bloco "Unidade de venda" no cadastro; a Consulta Rápida
  mostra `por cartela · 60 un` e o texto copiado traz as unidades por
  faixa — formato desenhado com o dono
- **Incidente 2026-08-24** (`docs/INCIDENTE-2026-08-24.md`): update sem
  backup restaurável agora **ABORTA** (`update.sh`); o instalador da
  base curada **não apaga banco com backup não conferido**
- **Pagamento**: `/pagamento/retorno` vira comprovante completo (valor
  pago, PIX/cartão, parcelas, protocolo, comprovante); migração
  preenche `app_base_url` com o túnel do dono (`app.vtdigital.site`)
  quando vazio — InfiniteTag intocada. Guias novos:
  `SETUP-INFINITEPAY.md`, `SETUP-CLOUDFLARE-TUNNEL.md`
- **release.sh**: changelog mora em `docs/` — o caminho errado fazia o
  commit do bump falhar calado e a tag nascer no commit anterior
- **Smoke**: 303 → **308 checks** (5 novos de unidade de venda)
- **Docs**: `ONDE-ESTAMOS.md` em dia (entradas 3.68.0/3.68.1/3.68.2);
  LEIA-ME do pacote reescrito (o antigo instruía instalar base curada —
  cenário exato do incidente)

## [3.68.0] — 2026-08-24

Catálogo completo e ferramentas de atendimento.

- **Motor**: o clique da folha passa a ser dividido pelas peças que saem
  dela, nos dois modos de cálculo. Sem isso cada panfleto carregava o
  custo de impressão de uma A4 inteira.
- **Campo "Peças por folha"** também no modo unitário, que não tinha.
- **Catálogo com 27 produtos** em 7 categorias: cópias, encadernação,
  fotos, cartões e panfletos, adesivos, copos e agendas. A v3.67.0 foi
  empacotada com apenas 9 (só adesivos) — ver nota abaixo.
- **Tabela de preços interna** em A4 e A3 deitado
  (`scripts/gerar-tabela-precos.mjs`), no formato de parede.
- **Consulta rápida de preço** (`/consulta-preco`): busca o produto e
  copia a resposta pronta para o WhatsApp.
- **Formulário de produto** reorganizado em nove blocos nomeados.

> **Nota sobre a v3.67.0.** A tag `v3.67.0` foi criada em 23/08, e todo o
> trabalho de catálogo (27 produtos) veio depois dela, sem novo bump. O
> pacote reempacotado no dia 24 manteve o mesmo nome de versão, então o
> servidor instalou um arquivo diferente com o mesmo rótulo e ficou com 9
> produtos. Daí esta 3.68.0: versão nova para conteúdo novo.

---


## [3.30.0] — 2026-08-18

Auditoria de **lógica** das impressoras (a anterior cobriu validação e
aritmética). Documentado em `docs/AUDIT-IMPRESSORAS-LOGICA.md`.

### Adicionado — aviso de peça de desgaste cadastrada como colorante

`costRole` tem default `"colorant"`. Quem cadastra um cilindro, fusor ou
correia sem trocar o campo faz essa peça **escalar com a cobertura de
tinta** — o que não acontece na máquina: ela se gasta por folha que
passa, independente da arte.

O erro é invisível na cobertura de referência (os dois cálculos batem) e
só aparece em trabalho com muita ou pouca tinta. Numa arte de 20% de
cobertura o custo saía **R$ 0,4186/folha em vez de R$ 0,3643** — 15% a
mais, sem nada parecer errado na tela.

A tela de Impressoras agora detecta pelo nome (cilindro, fusor, cabeça,
correia, lâmina, rolo) e avisa, explicando o motivo. `getPrinterEngineHealth`
ganhou o contador `consumablesMaybeMechanical`.

### Nota

Foi encontrado porque o próprio cadastro de teste da v3.29.1 tinha esse
erro: o cilindro ficou como colorante e o número publicado na auditoria
estava certo apenas por coincidência — na cobertura de referência os dois
modelos dão o mesmo valor.

---

## [3.29.1] — 2026-08-18

### Auditoria — Impressoras e custo por página: sem achados

Sétimo e último módulo da varredura. Documentado em
`docs/AUDIT-IMPRESSORAS.md`.

Todas as validações de entrada recusam corretamente rendimento zero ou
negativo, multiplicador zero ou negativo, fator de área zero e exclusão
de categoria em uso. O custo por página foi conferido com um parque real
montado para o teste: colorido R$ 0,12276/pg, P&B R$ 0,09056/pg, com a
separação correta entre consumível colorante e desgaste mecânico.

Confirmado que o achado pendente de `AUDIT-CATALOGO.md` (consumível com
rendimento zero) **não é alcançável pela API** — o schema barra antes,
e a proteção no cálculo é defesa de segunda camada para importação
direta no banco.

---

## [3.29.0] — 2026-08-18

Auditoria completa do PDV e do caixa. Documentado em
`docs/AUDIT-PDV-CAIXA.md`.

### Corrigido — sangria concorrente esvaziava a gaveta (crítico)

O saldo era conferido **fora** da transação: cinco sangrias simultâneas
liam o mesmo valor e todas passavam. Um caixa aberto com R$ 100 liberou
**R$ 160** em sangrias, deixando a gaveta em −R$ 59,99 e R$ 160 de
despesa falsa no Financeiro — dinheiro que nunca existiu, derrubando o
resultado do mês.

A sessão passou a ser travada com `FOR UPDATE` e o saldo conferido
dentro da transação, como já era feito no Estoque e no estoque da venda.

### Corrigido — fechamento aceitava valor negativo

`toPositive(-500)` virava zero: o caixa fechava com quebra inventada de
erro de digitação, sem avisar ninguém. Agora responde 422 pedindo
correção.

### Testes

`e2e:smoke` foi de 173 para **179 checks**.

---

## [3.28.0] — 2026-08-18

Fecha a pendência da v3.27.0: as regras de pagamento saíram da biblioteca
e chegaram à tela do PDV.

### Adicionado — desconto à vista automático

O preço de tabela embute o custo do 3x. Quando o cliente paga em PIX ou
dinheiro, esse custo volta para ele como desconto, aplicado sozinho na
tela: R$ 208,86 viram **R$ 196,08**.

É a virada de discurso que a v3.27.0 propôs — em vez de avisar "tem juros
no cartão" no fechamento, o balcão oferece "desconto à vista". Mesmo
dinheiro, sem atrito e sem risco com o Procon.

### Adicionado — parcelamento com piso de valor

No crédito, o PDV mostra "ou 3x sem juros · R$ 69,62/mês" quando a venda
alcança o mínimo (R$ 150). Abaixo disso avisa a partir de quanto o
parcelamento é oferecido, em vez de simplesmente não aparecer.

### Adicionado — margem real da venda na tela

Ao lado do total, o operador vê quanto sobra depois do custo dos itens,
do imposto e da taxa daquela forma de pagamento. Fica vermelho se a
venda furar o piso configurado — antes isso só apareceria no fechamento
do mês, quando já não dá para desfazer.

Para isso o custo do produto passou a ser carregado pelo PDV
(`costSnapshot` na projeção e na linha do carrinho).

### Corrigido — troco em dinheiro ignorava o desconto

`cashPortion` usava o total cheio. Com o desconto à vista, o operador
cobraria R$ 208,86 de uma venda de R$ 196,08 e devolveria troco a menos.
O desconto também passou a ser somado ao desconto enviado ao servidor —
sem isso a venda seria gravada pelo valor sem desconto.

### Testes

`e2e:smoke` foi de 161 para **173 checks**.

---

## [3.27.0] — 2026-08-18

Motor de precificação corrigido, com as três decisões comerciais
definidas. Documentado em `docs/PROPOSTA-PRECIFICACAO.md`.

### Corrigido — a margem informada não era a margem recebida

O modo unitário aplicava a margem por divisor e **somava imposto e taxa
por fora**. Mas as duas incidem sobre o valor que o cliente paga, não
sobre o subtotal: pedindo 40% sobravam 39,27%.

Pior: o modo tiragem sempre usou divisor, então o mesmo produto custava
R$ 184,98 num modo e R$ 204,04 no outro — **10,3% de diferença conforme
a tela usada**. Agora os dois usam a mesma fórmula e a margem informada é
o piso real sobre a receita.

### Adicionado — preço embute o pior meio de pagamento

Novo `pricing_payment_cost` (padrão 6,12%, o 3x sem juros da InfinitePay
na faixa até R$ 20 mil/mês). O preço de tabela passa a garantir a margem
mínima **em qualquer forma de pagamento** — quem paga PIX gera folga, e é
dela que sai o desconto à vista, sem tirar do lucro.

Substitui a prática de avisar "tem juros do cartão" no fechamento, que
além de irritar o cliente é problema com o Procon quando não informada.

Também no painel: desconto do PIX, valor mínimo para parcelar (R$ 150),
máximo de parcelas (3x) e piso de margem (40%).

### Corrigido — acerto de máquina e refugo agora somam

O cálculo pegava o **maior** entre perda percentual e folhas de setup,
o que não corresponde a nada que acontece na máquina: são custos
independentes. Numa tiragem de 1000 peças (4/folha, acerto 10, perda 5%)
cobrava 263 folhas enquanto a produção consumia 273.

Em tiragem pequena era pior — o refugo era simplesmente descartado
quando o setup fosse maior.

### Adicionado — análise de forma de pagamento e simulador

`src/lib/payment-analysis.ts` calcula a margem real de cada forma de
pagamento, respeitando o mínimo para parcelar.
`scripts/simular-precos.mjs` mostra preço atual vs novo de cada produto
sem gravar nada.

### Testes

`e2e:smoke` foi de 150 para **161 checks**.

---

## [3.26.0] — 2026-08-18

Auditoria dos 6 módulos restantes — Produtos, Serviços, Tabelas de Preço,
Impressoras, Calendário e Configurações. Com esta, **todos os módulos do
sistema foram auditados**. Documentado em `docs/AUDIT-CATALOGO.md`.

### Corrigido — SKU e código de barras podiam repetir

Não havia índice único em `products.sku` nem em `products.barcode`. O PDV
resolve o item bipado com `find`, que devolve **o primeiro** resultado:
com código repetido, o operador vendia o produto errado, com o preço
errado, e nada avisava — o erro só apareceria no fechamento do caixa.

Índices únicos parciais (nulos e vazios não colidem, então produtos sem
código continuam convivendo) e 409 com mensagem específica. O catch da
rota também parou de devolver `e.message`, que num erro de constraint
carrega o SQL para o navegador.

### Corrigido — arredondamento comercial produzia dízima binária

`roundCommercialPrice(1.15, 0.1)` devolvia `1.2000000000000002`. O banco
escapava por causa do `round2` na gravação, mas o número sujo circulava
no `unitPrice` e no detalhamento mostrado ao cliente. A conta passou a
ser feita em centavos inteiros.

Era o único achado do motor de precificação que não dependia de decisão
comercial — os outros três seguem aguardando definição, porque mudam o
preço de venda de todos os produtos.

### Testes

`e2e:smoke` foi de 140 para **150 checks**.

---

## [3.25.0] — 2026-08-17

Fechamento das dívidas técnicas e melhorias. Documentado em
`docs/AUDIT-MELHORIAS.md`.

### Corrigido — ano errado na numeração de documentos na virada do ano

`documents.ts` usava `new Date().getFullYear()`. O servidor roda em UTC:
entre 21h e a meia-noite de 31/12 no Brasil, a numeração pularia para
`ORC-2027-0001` com a gráfica ainda operando em 2026 — documento fiscal
fora de sequência. Passou a usar o ano do fuso da operação. O contador e
o formato não mudaram.

Mesmo defeito corrigido no selo "Aniversário hoje" da ficha do cliente.

### Adicionado — aniversariantes da semana no painel

`birthDate` era coletado desde a v3.21.0 e só aparecia na ficha
individual, onde ninguém ia procurar. Novo card no painel com os
próximos 7 dias, "hoje" destacado.

Respeita o opt-out de WhatsApp: quem recusou aparece como "sem contato
para envio" em vez de virar alvo de campanha. Inativos e bloqueados
ficam de fora.

### Alterado — tipo da empresa unificado

`PosCompany` estava declarado **três** vezes (PDV, Pedidos, Orçamentos).
Foi o que fez a IE da v3.23.0 entrar em uma cópia só. Agora existe um
`CompanyIdentity` em `lib/company.ts`, com alias para não quebrar
imports. Um campo novo passa a obrigar as 3 páginas a fornecê-lo.

### Removido — `PrintDocument.tsx`

284 linhas que ninguém importava, e que já haviam custado uma correção
inócua na v3.21.0. O histórico do git preserva o arquivo.

### Testes

`e2e:smoke` foi de 135 para **140 checks**.

---

## [3.24.0] — 2026-08-17

Primeira auditoria do módulo de Estoque, Compras & Produtos. 7 bugs
encontrados e corrigidos, todos reproduzidos no servidor antes e depois.
Documentado em `docs/AUDIT-ESTOQUE.md`.

### Corrigido — saída simultânea furava o estoque (crítico)

`createStockMovement` validava o saldo com um `select` comum e só depois
gravava. Duas requisições liam o mesmo saldo e ambas passavam: material
com 10 un aceitava 5 saídas de 4 e terminava em **−10**. O PDV já havia
resolvido isso com `FOR UPDATE`; o Estoque tinha ficado de fora.

A leitura agora trava a linha, e a recusa informa quanto há disponível.

### Corrigido — receber a mesma compra 3× triplicava o estoque (crítico)

`receivePurchase` conferia o status **fora** da transação. Três
recebimentos concorrentes de uma compra de 100 un deixavam **300** no
saldo e 3 movimentos. A despesa nunca duplicou — `upsertAutoTransaction`
é idempotente — mas o estoque não tinha defesa equivalente.

A compra passou a ser lida com `FOR UPDATE` e o status reconferido dentro
da transação, o que finalmente faz o retorno `alreadyReceived` funcionar.

### Alterado — "Ajuste" define o saldo, não soma mais

O cálculo tratava `ajuste` como entrada: saldo 10 + ajuste 3 virava 13.
Quem fez a contagem física e digitou 3 esperava 3 — e a tela reforçava a
leitura errada, mostrando sinal em "Entrada (+)" e "Saída (−)" e nenhum
em "Ajuste manual".

Agora o delta é `contado − atual`, a opção se chama **"Ajuste — definir
saldo (=)"** e o campo vira **"Saldo contado"**, exibindo o saldo atual.
Zero passou a ser aceito em ajuste (a contagem não encontrou o item);
entrada e saída seguem exigindo valor positivo.

### Corrigido — excluir movimento deixava saldo negativo

Entrada de 50, saída de 50, excluir a entrada: saldo ia a **−50** em
silêncio. A exclusão agora é recusada (409) quando a reversão deixaria o
saldo negativo, sugerindo registrar um novo movimento.

### Corrigido — produto sem controle de estoque era movimentável

Produto com `trackStock = false` (sob demanda, o padrão da casa) aceitava
movimentação e passava a exibir saldo fantasma. Agora responde 422
explicando como ativar o controle.

### Corrigido — `automatic` podia ser forjado pelo cliente

A flag marca o que o sistema gerou e bloqueia exclusão manual. Vinha do
corpo da requisição, então dava para criar um movimento manual
impossível de apagar pela tela. Só é aceita internamente agora.

### Corrigido — `/api/purchases` sem validação vazava SQL

Sem `purchaseId`, a query rodava com `NaN` e o catch devolvia o SQL
inteiro ao navegador. A rota valida o id (aceita `purchaseId` ou `id`) e
o catch devolve mensagem genérica.

### Testes

`e2e:smoke` foi de 121 para **135 checks**. Os 14 novos disparam as
chamadas em paralelo: sem as travas, falham.

---

## [3.23.0] — 2026-08-17

Segunda passada da auditoria de propagação: módulos restantes e os campos
fiscais **da empresa**. Documentado em `docs/AUDIT-PROPAGACAO-CAMPOS.md`.

### Corrigido — o bloco fiscal da v3.21.0 tinha ido para código morto

`PrintDocument.tsx` **não é importado por ninguém**. A OS que sai na
impressora é `ProductionOrderA4`, dentro de `OrdersClient.tsx`. O bloco
com razão social, IE, IM e A/C que a v3.21.0 deu como entregue nunca
apareceu num papel — e a correção do `mobilePhone` era igualmente inócua.

Agora aplicado na OS real, junto do endereço com complemento e CEP. O
cupom 80 mm da OS ganhou CPF/CNPJ e A/C. O arquivo órfão recebeu um
cabeçalho apontando os componentes que de fato imprimem.

### Adicionado — inscrição estadual do emitente nos documentos

`company_ie` era editável no painel desde a v3.21.0 e não saía em lugar
nenhum: os quatro documentos mostravam só o CNPJ. Exigir a IE do cliente
no A4 e omitir a própria era incoerente.

Incluída no cupom do PDV, na OS A4, no cupom da OS e no orçamento A4.
O tipo `PosCompany` está **declarado duas vezes** — em `PosClient.tsx` e
em `OrdersClient.tsx` — e o typecheck foi quem pegou: sem a segunda
declaração, a IE apareceria no PDV e sumiria em Pedidos.

CNAE, código IBGE, CRT e regime tributário seguem sem consumo por ora —
existem para a emissão de NF-e, ainda não implementada.

### Corrigido — etiqueta de envio sem telefone

`superfrete.ts` montava o destinatário só com `customer.phone`. Quem
cadastrou apenas WhatsApp ia para a transportadora sem número de contato,
que é justamente por onde o entregador liga. Passou a usar
`phone || whatsapp`.

### Verificado sem alteração

Envios (destinatário completo, com número e complemento), Cobranças
(`customer` + `address` na InfinitePay), Kanban (`customerName` como
texto livre, correto para trabalho interno) e Relatórios (agrupam por
`coalesce(tradeName, name)`). A pendência antiga de `company_address`
está resolvida por `structuredAddress`.

### Testes

`e2e:smoke` foi de 118 para **121 checks**.

---

## [3.22.0] — 2026-08-17

Auditoria de propagação: os campos criados na v3.21.0 apareciam no
formulário e sumiam no resto do sistema. Documentado em
`docs/AUDIT-PROPAGACAO-CAMPOS.md`.

### Corrigido — "não enviar WhatsApp" era coletado e ignorado (crítico)

O checkbox gravava no banco e os dois botões de envio — OS em Pedidos e
cupom no PDV — mandavam a mensagem assim mesmo. Uma preferência que o
sistema registra e desrespeita é pior do que campo nenhum.

`isWhatsAppBlocked` e `whatsappNumber` em `lib/validators.ts` passam a
ser a **regra única**. Com opt-out, o link abre sem destinatário e um
toast explica o motivo ao operador. A ligação telefônica continua
liberada: o cliente recusou mensagens, não contato.

A página do PDV projetava o cliente coluna a coluna e recortava
`contactName` e `whatsappOptOut` antes de chegar à tela — ambos incluídos.

### Adicionado — ficha 360° mostra o que o cadastro coleta

Bloco **Dados cadastrais**, condicional por tipo: PF exibe RG com órgão
emissor, nascimento **com idade calculada** e estado civil; PJ exibe IE,
IM, regime, porte, fundação e contato. Origem e limite de crédito para
ambos. Só rende linha o que está preenchido.

Selos no cabeçalho: **"Não enviar WhatsApp"** e **"Aniversário hoje"**.
Na lista, a coluna Contato ganhou a marca **"sem zap"**.

### Adicionado — busca e filtro alcançam os campos novos

Filtro da carteira procura também em WhatsApp, IE, IM, RG e contato PJ.
A **busca global** (`/api/search`) passou a cobrir IE, IM e contato — é
o que o cliente tem à mão quando liga sem saber o CNPJ.

Novo **filtro por origem**, listando apenas as origens em uso, com
contagem e ordenadas por frequência.

### Corrigido — orçamento em A4 saía com menos dados que a OS

`QuotesClient` ganhou o bloco fiscal PJ (razão social, IE, IM, A/C) e o
endereço com complemento e CEP, que a OS já imprimia desde a v3.21.0.

### Testes

`e2e:smoke` foi de 112 para **118 checks**.

---

## [3.21.0] — 2026-08-17

Reestruturação do cadastro de Clientes conforme as telas PF/PJ enviadas
pelo usuário. Documentado em `docs/AUDIT-CADASTRO-CLIENTES.md`.

### Adicionado — cadastro estruturado PF/PJ

Seis colunas em `customers`: `rg_issuer`, `marital_status`,
`company_size`, `founded_at`, `origin`, `whatsapp_opt_out`.

O formulário passou de uma grade única para cinco blocos — Identificação,
Documentos pessoais / Dados da empresa, Endereço, Contato e Situação
comercial — **sem alterar layout, cores ou componentes**. O segundo bloco
troca de conteúdo conforme PF ou PJ. Nome de contato existe só para PJ.

Fora do escopo por decisão do usuário: segmento, Instagram, Facebook,
nº de celular e apelido.

### Adicionado — CPF/CNPJ obrigatório e validado

O cadastro completo exige documento com dígito verificador válido (422).
O **cadastro rápido do balcão (F8) continua livre** via `quickEntry`, no
PDV, em Pedidos e em Orçamentos. `birthDate` e `foundedAt` são validadas
como `YYYY-MM-DD` e recusadas se estiverem no futuro.

### Adicionado — máscaras corrigidas durante a digitação

Documento (alterna CPF/CNPJ pelos dígitos), CEP, telefone, WhatsApp e
inscrição estadual. O CEP voltou para o início do bloco de endereço e
mantém o preenchimento automático via ViaCEP.

### Adicionado — campos fiscais do emitente no Painel de Controle

Inscrição estadual, inscrição municipal, regime tributário, CNAE
principal, código IBGE do município, complemento e CRT — o que faltava
para emissão de nota fiscal. `company_city_code` = 3304557 (Rio de
Janeiro).

### Corrigido — `mobilePhone` nunca existiu

`PrintDocument.tsx` lia `customer.mobilePhone`, coluna inexistente: o
contato caía silenciosamente para o telefone fixo. Passou a usar
`whatsapp` / `phone`.

### Corrigido — importador de PDF perdia campos e vazava rótulos

Passou a extrair complemento, RG, órgão emissor, nascimento, estado
civil, IE, IM e contato, com `origin: "importacao"`. Sem âncora, os
regexes capturavam o rótulo seguinte (estado civil trazia
"Cônjuge..: Escolaridade:"); `grab()` foi ancorado e `clean()` cobre ~20
rótulos do legado.

### Alterado — documentos impressos

Cupom 80 mm mostra fantasia, razão social e `A/C:` para PJ. OS/A4 ganhou
bloco fiscal (razão social, IE, IM, A/C) exibido só para PJ, e o endereço
passou a incluir complemento e CEP.

### Testes

`e2e:smoke` foi de 101 para **112 checks**.

---

## [3.20.0] — 2026-08-17

Auditoria do Kanban de Produção. Documentado em `docs/AUDIT-KANBAN.md`.

### Corrigido — `reorder` era uma porta lateral sem regras (crítico)

`updateKanbanCard` impede que um card ligado a um Pedido vá para
"cancelado" — cancelamento exige motivo e estorno formais em Pedidos & OS.
O `reorderKanban` alterava a mesma coluna sem passar por nenhuma dessas
regras:

```
via update   → 409 "Cancele pedidos vinculados em Pedidos & OS..."
via reorder  → {"ok":true}   ← card cancelado, pedido intacto
```

Agora o `reorder` aplica a mesma trava.

### Corrigido — `reorder` não sincronizava o Pedido (crítico)

`updateKanbanCard` traduz a coluna do card em status do pedido (`pronto` →
produção concluída, `entregue` → entrega concluída). O `reorder` não fazia
nada disso:

```
card movido para "pronto" via reorder
  → card:   column = pronto
  → pedido: production_status = aguardando   ← não mudou
```

O quadro dizia "pronto" enquanto a tela de Pedidos dizia "nem começou". Como
arrastar é justamente a operação que usa `reorder`, esse era o caminho normal
de uso. Agora só os cards que realmente mudaram de coluna disparam a
sincronização — reordenar dentro da coluna não altera o andamento.

### Corrigido — `reorder` movia cards por acidente

A função aplicava a coluna a **todos** os ids recebidos, sem conferir a
origem: uma requisição de "reordenar backlog" que incluísse por engano o id de
outro card o trazia para o backlog silenciosamente.

Agora existe o parâmetro `allowMove`: sem ele, card de outra coluna é
recusado com 422 (e a resposta diz quais ids). Ids repetidos também são
recusados.

### Corrigido — prazo no passado no card

`dueDate: "2020-01-01"` era aceito. Mesma correção já aplicada em Orçamentos
(v3.16.0) e Pedidos (v3.19.0).

### Corrigido — `quoteId` sem chave estrangeira

`orderId` e `customerId` sempre tiveram FK; `quoteId` era um `integer` solto,
e um orçamento removido deixaria o card apontando para um id inexistente.
Agora tem FK com `on delete set null`.

### Adicionado — ordenar a fila arrastando

O campo `order` existia no banco e o endpoint `reorder` funcionava, mas **a
tela nunca os usava**: todos os cards ficavam com ordem 0 e não havia como
priorizar a fila de produção — o trabalho urgente ficava na mesma altura do
resto.

Agora, soltar um card **sobre outro** insere-o naquela posição, com uma linha
guia indicando onde vai entrar. Soltar no vazio da coluna manda para o fim. A
ordem escolhida é salva e respeitada ao recarregar.

### Corrigido — dois erros de lint pré-existentes em `KanbanClient.tsx`

### Alterado

- `MutateOp` ganhou a operação `reorder`.
- `e2e-smoke.mjs`: 93 → 101 verificações.

---

## [3.19.0] — 2026-08-17

Auditoria de Pedidos & OS. Documentado em `docs/AUDIT-PEDIDOS-OS.md`.

### Corrigido — pedido de R$ 0,00 virava receita (crítico)

`createOrder` não validava o total. Desconto maior que o subtotal zerava o
pedido e o zero seguia para o Financeiro:

```
POST /api/crud/orders { items:[{unitPrice:100}], discount:99999 }
  → PED-2026-0022 aceito, total 0.0000
  → transactions: receita | pedido | 0.00 | pendente
```

Quantidade `0,0001` produzia o mesmo efeito. Última porta aberta do mesmo bug
já fechado no PDV (v3.14.0) e no Orçamento (v3.16.0): agora há guarda de total,
teto de 100% no desconto percentual, recusa de desconto maior que o subtotal e
quantidade mínima de 0,001. As regras valem na criação **e** na edição.

### Corrigido — status inventado sumia da gestão (crítico)

Os cinco eixos de status eram `text` livre, sem validação:

```
PATCH { status:"banana", productionStatus:"voando" }  → aceito e gravado
```

As abas da tela filtram por valor exato, então um pedido com status fora da
lista **não aparecia em nenhuma aba** — invisível na gestão, apesar de existir,
ter card no Kanban e lançamento no Financeiro. Um erro de digitação numa
integração bastava para "perder" um pedido em produção.

Agora os cinco campos (mais `priority`) são enums, e o erro lista os valores
aceitos. Os enums incluem `cancelado` em produção/entrega/financeiro porque é
assim que `cancelOrder` marca o pedido desfeito, e mantêm `aprovado`/`recusado`
no masculino para não invalidar os pedidos já gravados.

### Corrigido — prazo de entrega no passado

`dueDate: "2020-01-01"` era aceito e virava prazo do card no Kanban e da
entrega. Agora recusado com 422.

### Corrigido — erro do módulo vazava mensagem crua

`/api/crud/orders` devolvia `e.message` no catch, podendo expor SQL. Agora
responde mensagem genérica e registra o detalhe no log.

### Adicionado — controle de atraso

O prazo era exibido mas nunca comparado com hoje: nada sinalizava atraso, numa
gráfica onde prazo é o que mais importa.

- nova aba **Atrasados** com contador;
- prazo vencido em vermelho, com selo `7d atraso`;
- prazo de hoje em âmbar, com selo `hoje`;
- pedidos concluídos ou cancelados não contam como atrasados.

### Corrigido — três erros de React 19 no OrdersClient

Herdados: `Date.now()` durante o render em **duas** impressões de OS (A4 e
80 mm) — que também podia divergir entre servidor e cliente — e reset do modal
de cliente por `setState` em efeito, trocado por `key` no pai. O módulo passa
no ESLint sem erros.

### Verificado — cancelamento está correto

Registrado por ter sido testado a fundo: estorna com `estorno_pedido`
preservando a receita original, é idempotente (segundo cancelamento → 409) e
resiste à corrida (5 cancelamentos paralelos → 1 estorno).

### Alterado

- `e2e-smoke.mjs`: 81 → 93 verificações.

---

## [3.18.0] — 2026-08-17

Importação de clientes do sistema antigo e endurecimento do CRM.

### Adicionado — importar clientes por PDF

O sistema anterior só exporta clientes como PDF (relatório "FICHA DO
CLIENTE"). O arquivo tem texto real, não é imagem escaneada, então os campos
podem ser lidos por rótulo — `Nome/Razão:`, `Bairro..:`, `Nº do CPF:` — em vez
de por posição, o que sobrevive à variação de espaçamento entre fichas.

**Clientes & CRM → Importar PDF.** O fluxo é em duas etapas:

1. **Analisar arquivo** — lê o PDF e mostra quantas fichas encontrou, quantas
   são novas, quantas já existem e quantas serão ignoradas, com prévia das
   10 primeiras. Nada é gravado.
2. **Confirmar importação** — grava.

Regras de gravação:

- **Deduplicação por documento**, ignorando máscara: `034.460.327-03` e
  `03446032703` são o mesmo cliente. Reimportar o mesmo arquivo não duplica.
- **Cliente já existente é completado, nunca sobrescrito**: só os campos em
  branco no PrintFlow recebem o dado do PDF. O que foi digitado aqui tem
  precedência.
- **PF ou PJ pela contagem de dígitos**, já que o legado deixa "Tipo Cadastro"
  em branco.
- **Documento inválido não bloqueia a ficha**: o cliente entra sem documento e
  o caso aparece no relatório de observações.
- Máscaras vazias do legado (`(  )     -`, `  .   .   /    -`) viram campo
  nulo, não texto sujo.
- Origem registrada nas observações: `Importado do sistema antigo · código 82`.

Novo endpoint `POST /api/crm/import`, `src/lib/import-customers.ts` e a
dependência `unpdf` para leitura do PDF.

### Corrigido — documento duplicado dependia só do código

`customers.document` não tinha índice único: a checagem de duplicata era um
`SELECT` seguido de `INSERT`, o mesmo TOCTOU que duplicou pedidos na v3.16.0.
Com importação em lote o risco cresce — centenas de inserções seguidas.

```
Teste: 5 cadastros paralelos do mesmo CNPJ
ANTES  passava por sorte de timing, sem garantia
AGORA  1 criado, 4 recusados com mensagem clara
```

Índice `customers_document_unique_idx` (parcial: documento é opcional).

### Corrigido — erro de duplicata vazava SQL

A rota `/api/crud/customers` devolvia `e.message` no catch, expondo o `INSERT`
inteiro ao navegador. Agora responde 409 com "Este documento já está
cadastrado para outro cliente"; o detalhe fica no log.

### Corrigido — CNPJ válido recusado como "CPF inválido"

O campo tipo tem default `pf`, então um CNPJ correto enviado sem marcar PJ era
validado como CPF e recusado — mensagem que não ajudava quem digitou o
documento certo. O tipo agora é inferido pela contagem de dígitos (14 = CNPJ,
11 = CPF) antes da validação.

### Alterado

- `scripts/repair-crm.mjs` cria o índice novo e trata bases com duplicatas:
  mantém o cadastro mais antigo e move o documento dos demais para as
  observações — nenhum cliente é apagado.
- Corrigidos dois erros de lint pré-existentes em `ClientsClient.tsx`.
- `e2e-smoke.mjs`: 79 → 81 verificações.

---

## [3.17.1] — 2026-08-17

Correção de segurança nos dados da empresa impressos nos documentos.

### Corrigido — campo vazio no Painel era preenchido pelo código

Os valores padrão de `company_*` em `src/lib/settings.ts` — e os fallbacks
`||` dentro do cupom — vinham com os dados da VTDIGITAL fixos no código:
nome, endereço, telefones, site e CNPJ.

Consequência: qualquer campo deixado em branco no Painel de Controle era
"completado" silenciosamente pelo código, sem que ninguém percebesse. O
operador achava que tinha limpado o campo, mas o documento continuava
imprimindo o valor antigo — e numa instalação em outra gráfica, sairiam dados
que não são dela.

```
Teste: apagar o telefone no Painel
ANTES  cupom continua imprimindo (21) 2038-3504 (valor fixo no código)
AGORA  a linha simplesmente não é impressa
```

Dado de empresa é responsabilidade do Painel, nunca do código-fonte: o que
está em branco deve sumir do documento.

Todos os `company_*` e `pix_key` passam a nascer vazios, e o cabeçalho do
cupom só renderiza a linha quando há dado. Vale para cupom, orçamento e OS,
que compartilham o mesmo `getPricingDefaults()`.

### Corrigido — CNPJ/CPF saía sem máscara

O Painel salva o documento como digitado. Sem formatação, um CNPJ gravado como
`12345678000190` saía cru no impresso. Agora recebe máscara na leitura
(14 dígitos → CNPJ, 11 → CPF); contagem diferente é devolvida intacta, para
não corromper inscrição estrangeira ou valor em digitação.

---

## [3.17.0] — 2026-08-17

Legibilidade do cupom na impressora térmica 80 mm, a partir de um cupom real
fotografado pelo usuário: só o texto em negrito saía nítido; endereço, CNPJ,
telefones, o item vendido e o rodapé saíam lavados.

### Corrigido — cupom saía lavado na térmica

Não era a impressora. A cabeça térmica só sabe queimar ou não queimar o ponto,
mas o navegador rasteriza o texto com antialiasing — os pixels cinzentos das
bordas viram pontos meio queimados. Só o que tinha `font-bold` tinha corpo
para resistir.

No `@media print` do cupom (`#receipt-print`, `#order-print-80mm`):

- tudo em `color: #000` com `font-weight` reforçado e
  `-webkit-font-smoothing: none` — sem meio-tom;
- divisórias tracejadas viram sólidas (tracejado fino desaparece);
- piso de 11 px: o rodapé usava 9 px e 10 px, e a 203 dpi a cabeça não tem
  resolução para formar o glifo.

### Adicionado — intensidade calibrável

Painel de Controle → PDV → **Intensidade da impressão térmica**: Normal /
Reforçado (padrão) / Escuro / Muito escuro. Cada bobina e cada cabeça gasta se
comporta diferente: peso 700 numa impressora nova pode empastar os caracteres
estreitos (`8`, `B`, `R`). Valor fora da faixa 400–800 cai no padrão 600.

### Adicionado — botão "Nítido" (impressão em texto puro)

Ao lado de "Imprimir Cupom". Abre o cupom já montado em texto puro dentro de
um `<pre>`, sem rasterização de layout — a máxima nitidez que a bobina aceita,
para quando a cabeça térmica já estiver gasta.

Reaproveita o `buildTextReceipt` que já existia para o WhatsApp. Nele, o
negrito era marcado com `*asteriscos*` (sintaxe do WhatsApp), que no papel
virariam sujeira: agora são convertidos em maiúsculas.

### Alterado — bloco do cliente reorganizado

O bairro dividia a linha com o telefone, partindo o endereço ao meio e
deixando o número solto à direita, sem rótulo. Agora segue a sequência de
correspondência, com os telefones identificados:

```
PADARIA PÃO QUENTE LTDA
12.345.678/0001-95
RUA LUZIA DE MACEDO DANTAS, 151
BANGU - RIO DE JANEIRO/RJ
CEP: 21863-030
TEL: (21) 3000-0000
WHATSAPP: (21) 99999-1111
```

Quando telefone e WhatsApp são o mesmo número, funde em uma linha
`TEL/WHATSAPP` em vez de repetir o dígito — a comparação ignora a máscara.
Linha sem dado não é impressa. Os mesmos rótulos valem para o cupom de texto,
mantendo impresso, botão "Nítido" e envio por WhatsApp consistentes.

---

## [3.16.0] — 2026-08-17

Auditoria do módulo Orçamentos. Sete problemas, todos reproduzidos contra o
sistema rodando antes da correção. Documentado em
`docs/AUDIT-ORCAMENTOS.md`.

### Corrigido — um orçamento virava vários pedidos (crítico)

`POST /api/orders/convert` conferia a existência do pedido com um `SELECT` e
inseria em seguida, sem trava — o mesmo TOCTOU do PDV, mas muito mais fácil de
disparar: bastava um duplo-clique em "Converter em Pedido".

```
Teste: 5 conversões paralelas do mesmo orçamento
ANTES  PED-2026-0040, PED-2026-0041, PED-2026-0042  → 3 pedidos
AGORA  PED-2026-0044 nas cinco respostas            → 1 pedido
```

Índice único parcial `orders_one_per_quote_idx` em `orders(quote_id)`. As
requisições perdedoras recebem o pedido vencedor com `existing: true`, sem
erro. O botão também trava durante a conversão.

### Corrigido — orçamento de R$ 0,00 virava receita paga (crítico)

Não havia validação de total mínimo, e o zero atravessava toda a cadeia:
proposta zerada → pedido com `financialStatus: pago` → **receita de R$ 0,00
marcada como paga** no Financeiro e no ticket médio dos Relatórios. Mesmo
buraco fechado no PDV na v3.14.0, aberto pela porta do orçamento.

### Corrigido — desconto percentual acima de 100%

`discountMode: "percent"` aceitava qualquer número; com `500` o sistema
calculava 500% de desconto. Teto de 100% e recusa de desconto maior que o
subtotal.

### Corrigido — validade no passado

`validUntil: "2020-01-01"` era gravado sem aviso e o orçamento nascia como
rascunho, não expirado. O vendedor podia enviar ao cliente uma proposta
vencida havia anos.

### Corrigido — orçamento aprovado podia ser alterado por baixo

A trava de edição só existia depois de virar pedido. Enquanto `aprovado`, itens
e valores podiam ser trocados livremente: uma proposta de R$ 5.000 aceita pelo
cliente virava R$ 10 sem deixar rastro.

Agora alterar valores de orçamento aprovado exige **reabrir para
renegociação** (botão novo, ou `reopen: true` na API). A reabertura devolve a
proposta para `rascunho` e registra o valor anterior nas observações. Mudança
apenas de status continua livre.

### Corrigido — preço não era conferido com o catálogo

O PDV recalcula o preço pelo cadastro; o orçamento aceitava qualquer
`unitPrice` do navegador, sem registro. Como orçamento é negociação e desconto
de linha é legítimo, o valor do vendedor continua valendo — mas a divergência
agora volta em `warnings[]` e a tela avisa:

```
Cartão de Visita 4x4 (10un): 0.10 vs 0.27 de tabela (-63.0%)
```

### Corrigido — expiração só acontecia no deploy

`repairExpiredQuotes()` rodava apenas em `install.sh`/`update.sh`. Entre dois
deploys, propostas vencidas seguiam exibidas como "enviado", inflando o funil
dos Relatórios. A página `/orcamentos` agora chama `expireStaleQuotes()` a
cada carga (UPDATE em lote), movendo também o card do Kanban para cancelado.

### Corrigido — três erros de React 19 no QuotesClient

Herdados, do mesmo tipo já corrigido no `PosClient`: `setState` síncrono em
efeito (abertura via `?novo=1` e reset do modal de cliente) e `Date.now()`
lido durante o render da proposta impressa — que também podia divergir entre
servidor e cliente. O módulo passa no ESLint sem erros.

### Alterado

- `scripts/repair-quotes.mjs` cria o índice novo e desvincula pedidos
  duplicados de bases antigas (mantém o mais antigo, não apaga nada).
- Erros do módulo deixam de devolver a mensagem crua ao navegador.
- `e2e-smoke.mjs`: 66 → 79 verificações.

---

## [3.15.0] — 2026-08-17

Melhorias de operação no PDV. Três recursos que o servidor já suportava mas a
tela nunca ofereceu, mais recuperação de carrinho.

### Adicionado — pagamento dividido

O balcão só conseguia registrar **uma** forma de pagamento por venda. Quando o
cliente pagava metade no PIX e metade no dinheiro, o operador tinha que
escolher uma e mentir — o que sujava o fechamento de caixa e a apuração de
taxas.

`createSale` aceitava `payments[]` desde a v3.10, com taxa calculada por
parcela. A tela simplesmente não usava. Agora:

- botão **⇄ dividir** (atalho **F5**) ao lado do seletor de pagamento;
- até 4 formas por venda, com botão "resto" para jogar o saldo restante;
- indicador ao vivo de quanto falta distribuir; o botão de finalizar só libera
  quando a divisão fecha;
- a taxa aparece separada, calculada por parcela — crédito 4,99% incide só
  sobre a parte no crédito;
- troco calculado sobre a **parcela em dinheiro**, não sobre o total;
- cupom impresso discrimina cada forma.

### Adicionado — últimas vendas, reimpressão e cancelamento

Depois de finalizar, o cupom sumia. Reimprimir a segunda via exigia sair do
PDV; cancelar uma venda só era possível pela API.

- botão **Últimas vendas** (atalho **F6**) lista o movimento das últimas 24h;
- **reimprimir** remonta o cupom térmico a partir da venda gravada;
- **cancelar** com motivo obrigatório, direto do balcão.

O cancelamento usa o `cancelSale` que já existia: devolve o estoque item a
item (produtos e materiais), estorna a receita e a taxa de cartão no
Financeiro e mantém a venda no histórico marcada como cancelada — nada é
apagado.

Novo endpoint `GET /api/pdv/recent-sales`.

### Adicionado — recuperação de carrinho

F5 acidental, queda de energia ou aba fechada no meio do atendimento apagavam
o carrinho inteiro. O carrinho agora é espelhado no navegador e oferecido de
volta ao reabrir o PDV, com a hora em que foi salvo. Rascunho de mais de 12h é
descartado.

O `clientRef` original é preservado na recuperação: se a venda chegou a ser
enviada antes da queda, a idempotência do servidor impede a duplicação.

### Alterado

- **F5** deixa de recarregar a página no meio da venda e passa a acionar a
  divisão de pagamento.
- Rodapé de atalhos atualizado: F2 buscar · F4 pagamento · F5 dividir ·
  F6 últimas · F8 cliente · F9 finalizar.
- `e2e-smoke.mjs`: 53 → 66 verificações.

---

## [3.14.0] — 2026-08-17

Auditoria do PDV. Três bugs críticos de concorrência e integridade, todos
reproduzidos com teste antes da correção.

### Corrigido — corrida de estoque (crítico)

`checkStock()` rodava FORA da transação que gravava a venda (clássico TOCTOU:
time-of-check to time-of-use). Duas vendas simultâneas liam o mesmo saldo e
ambas passavam.

```
Teste: estoque 10, cinco vendas paralelas de 3 unidades
ANTES  5 aprovadas · estoque final -5  (com allowNegativeStock: false)
AGORA  3 aprovadas, 2 bloqueadas · estoque final 1
```

A conferência passou a ser refeita DENTRO da transação com
`SELECT ... FOR UPDATE`: a segunda venda espera a primeira e enxerga o saldo
já debitado. Retorna 409 com `code: STOCK_RACE`.

### Corrigido — múltiplos caixas abertos (crítico)

Três requisições simultâneas de "abrir caixa" criavam três sessões, e a
conferência de gaveta perdia o sentido (cada venda ia para uma sessão
diferente). A verificação era um `SELECT` seguido de `INSERT`, sem trava.

Agora existe o índice único parcial `cash_sessions_one_open_idx`
(`WHERE status = 'aberto'`), declarado no schema. Teste com cinco aberturas
paralelas: uma abre, quatro recebem "Já existe um caixa aberto".

### Corrigido — venda de R$ 0,00 (alto)

Desconto maior que o subtotal, desconto de 100% ou quantidade `0,0001`
geravam cupom zerado, lançamento financeiro de R$ 0,00 e distorção do ticket
médio. Agora o total precisa ser maior que zero, com mensagem específica para
o caso de desconto, e a quantidade mínima é `0,001`.

### Corrigido — vazamento de SQL no caixa

O handler de `/api/pdv/cash-session` devolvia `e.message` ao navegador; em
violação de índice isso expunha o INSERT inteiro com nomes de colunas. Agora
a mensagem é genérica e o detalhe fica no log do servidor — mesmo tratamento
já aplicado no Financeiro na v3.11.0.

### Corrigido — 6 erros de lint do React 19 no PosClient

O arquivo tinha 6 erros `react-hooks` herdados (`setState` dentro de effect e
acesso a variável antes da declaração), que mascaravam problemas reais de
render em cascata:

- preferência de vendedor: `useEffect` + `setState` → leitura na montagem com
  `startTransition`
- sessão sincronizada de props: efeito → ajuste durante o render
- reset de campos dos modais (cliente, item avulso, caixa): três efeitos com
  `setState` → remontagem por `key`
- atalhos de teclado: o efeito usava `checkout()` antes da declaração e foi
  movido para depois da função

`PosClient.tsx` agora passa no ESLint sem nenhum erro.

### Operação
- `npm run e2e:smoke` foi de 47 para **53 verificações**, cobrindo corrida de
  estoque, estoque negativo, venda zerada, abertura concorrente de caixa e
  não vazamento de SQL.

---

## [3.13.1] — 2026-08-17

### Corrigido — conflito entre a taxa da maquininha e a tarifa do link

O grupo *Tributação* do Painel já tinha `card_fee_debit` (1,99%) e
`card_fee_credit` (4,99%), usados pelo PDV com gross-up quando o cliente passa
o cartão na **maquininha física**. O módulo de Cobranças, lançado na v3.13.0,
ignorava esse contexto e gerava duas distorções:

1. **Venda do PDV no cartão cobrada por link cobrava markup de maquininha.**
   `sale.total` já embute o gross-up de 4,99%; o link cobrava esse total e a
   InfinitePay ainda descontava a tarifa dela por cima. Em uma venda de
   R$ 270,00 o cliente pagaria R$ 284,18 por uma maquininha que não foi usada.
   Agora o link desconta `sale.card_fee` e cobra o valor real.

2. **A tarifa do checkout não virava despesa.** O PDV lançava `taxa_cartao`,
   mas o link lançava a receita cheia — o resultado ficava inflado. Agora a
   tarifa vira despesa na categoria própria `taxa_infinitepay`, para o DRE
   separar o custo do checkout online do custo da maquininha.

### Adicionado
- Taxas próprias da InfinitePay no Painel (grupo *Pagamentos*): Pix, crédito à
  vista e crédito parcelado, mais a política **quem paga a tarifa**
  (loja absorve ou repassa ao cliente com gross-up).
- Campos `passed_fee` e `provider_fee` em `payment_links`.
- Rótulos `Tarifa InfinitePay` e `Frete / etiqueta` no Financeiro, com as
  categorias disponíveis no seletor de lançamento manual.

### Alterado
- As regras de negócio da cobrança (pedido cancelado, já quitado, valor zero)
  passaram a ser avaliadas **antes** da checagem de configuração: a mensagem
  fica mais útil que "InfiniteTag não configurada".
- `repair-payments.mjs` avisa quando há cobrança paga sem tarifa registrada.

---

## [3.13.0] — 2026-08-17

Módulo **Cobranças** integrado à API de Checkout da InfinitePay.

### Contexto
O stub anterior (`/api/integrations/infinitepay`) nunca funcionou: enviava
`Authorization: Bearer <handle>` com `{ amount }`, e a API responde
`400 param is missing or the value is empty or invalid: handle`. O contrato
real exige o handle no CORPO e `items` com `price` em CENTAVOS. Nada no
sistema chamava esse endpoint.

### Adicionado — Módulo de Cobranças
- Nova camada `src/lib/infinitepay.ts` com o contrato correto, verificado
  contra a API de produção: `POST /links` e `POST /payment_check`.
- Nova tela `/cobrancas`: total a receber, recebido, link da loja, criação de
  cobrança (de pedido ou avulsa), verificação manual, comprovante e
  cancelamento.
- Nova tabela `payment_links` com vínculo para pedido, venda, orçamento,
  cliente e o lançamento financeiro gerado.
- Nova API `/api/payments` (`create`, `check`, `cancel`) e o webhook público
  `/api/payments/webhook`.
- Página `/pagamento/retorno` para onde o cliente volta após pagar, que já
  confirma o pagamento ativamente.
- Botão **Cobrar via InfinitePay** dentro de Pedidos & OS, com o link pronto
  para copiar ou enviar por WhatsApp.

### Segurança — webhook não confiável por padrão
A InfinitePay **não assina** o webhook: não há HMAC nem token no header.
Tratar o corpo como verdade permitiria a qualquer um marcar pedidos como
pagos com um POST.

- Nenhum webhook dá baixa sozinho: todo aviso dispara `payment_check` na API,
  e **só a resposta da API quita o documento**.
- `order_nsu` desconhecido é ignorado sem gravar nada.
- Pagamento menor que o cobrado é registrado mas **não quita** o documento,
  ficando sinalizado para conferência manual.
- Verificado em teste: webhook forjado de R$ 500 manteve a cobrança
  `pendente` e não lançou receita.

### Integração com o sistema
- **Pedidos/OS**: pagamento confirmado muda `financial_status` para pago e
  grava a forma real (PIX/Crédito).
- **Financeiro**: lança a receita automática vinculada ao documento, com
  parcelas e link do comprovante nas observações.
- **Relatórios**: entra no DRE e no mix de pagamento.
- **Frete**: pedido com frete cotado inclui a linha "Frete" na cobrança.
- Soma dos itens é conferida contra o total; divergindo, cobra em item único
  para o cliente nunca pagar valor diferente do documento.

### Painel de Controle
Novo grupo *Pagamentos · InfinitePay* (7 chaves): InfiniteTag, URL pública do
sistema, formas aceitas, baixa automática, validade do link e URLs de retorno
e webhook.

### Operação
- Criado `scripts/repair-payments.mjs`: normaliza valores, expira vencidas,
  religa cobranças pagas ao financeiro, reconstrói receitas faltantes, quita
  pedidos confirmados e sinaliza divergência de valor.
- Registrado em `install.sh` e `update.sh`.
- `npm run e2e:smoke` foi de 41 para **47 verificações**.

---

## [3.12.0] — 2026-08-17

Módulo **Envios & Frete** integrado ponta a ponta com a API SuperFrete.

### Contexto
Até a v3.11.0 existia apenas `/api/integrations/superfrete`: um stub isolado
que calculava frete e devolvia JSON. `grep superfrete src/` não retornava
nenhum consumidor — nada no sistema o chamava, não havia peso nos produtos,
nada era gravado no banco e não sabia emitir etiqueta.

### Adicionado — Módulo de Envios
- Nova camada `src/lib/superfrete.ts` cobrindo o ciclo real da API:
  cotação → carrinho → checkout → etiqueta → rastreio.
- Nova tela `/envios`: saldo da conta, envios em trânsito, entregues, gasto
  com frete, criação de envio a partir de pedido, pagamento da etiqueta,
  impressão, atualização de rastreio e cancelamento.
- Nova tabela `shipments` com vínculo para pedido, venda, entrega e cliente,
  guardando cada etapa (`superfrete_order_id`, `tracking_code`, `label_url`),
  o ambiente usado e o payload cru para auditoria.
- Nova API `/api/shipping` com as operações `quote`, `cart`, `checkout`,
  `label`, `track`, `cancel` e `sync`.
- Componente compartilhado `ShippingQuote` usado por Envios e PDV, para que
  os módulos cotem exatamente da mesma forma.

### Adicionado — Integração com o sistema
- **Produtos**: novos campos de peso, altura, largura e comprimento. A cotação
  soma o peso real dos itens do carrinho; quando o produto não tem medida,
  usa o pacote padrão do Painel de Controle e avisa na tela.
- **PDV**: cotação de frete direto na venda quando a modalidade é entrega. O
  valor entra em `sales.shipping_fee` e **o servidor soma no total** — o
  cliente não pode forjar o frete, mesma regra do preço do produto.
- **Entregas**: envio pago cria/atualiza o registro em `deliveries` com
  método `correios`, código de rastreio e valor.
- **Pedidos/OS**: `delivery_status` acompanha o envio automaticamente
  (pago → separado, postado → em rota, entregue → entregue).
- **Financeiro**: a etiqueta vira despesa automática na categoria `frete`,
  vinculada ao pedido/venda, aparecendo no DRE dos Relatórios.
- **Painel de Controle**: novo grupo *Envios & Frete* (11 chaves) com token,
  ambiente, CEP de origem, serviços cotados, pacote padrão e políticas de
  repasse ao cliente e de lançamento da despesa.

### Segurança operacional
- Checkout **confere o saldo antes de chamar a API** e informa quanto falta —
  o erro nativo da SuperFrete é genérico e deixaria o operador sem saber o
  que aconteceu.
- A tela de pagamento mostra valor da etiqueta e saldo atual, e avisa em
  vermelho quando o saldo não cobre.
- Bloqueios com mensagem específica: pedido cancelado, cliente sem endereço
  completo (lista os campos faltantes), impressão antes do pagamento e CNPJ
  da empresa ausente.
- Erros técnicos da API são traduzidos: `(correios.destination_postcode) é
  obrigatório` virou "CEP de destino não encontrado na base dos Correios".
- `sandbox` e `production` ficam gravados por envio, para os ambientes não se
  misturarem.

### Alterado
- `/api/integrations/superfrete` continua respondendo no contrato antigo, mas
  agora é só um adaptador sobre a camada nova.
- `sales` ganhou `shipping_fee`, `shipping_service` e `shipping_service_id`.

### Operação
- Criado `scripts/repair-shipping.mjs`: normaliza medidas, corrige nome de
  serviço, religa envios às entregas, sincroniza `delivery_status`,
  reconstrói despesas de etiquetas pagas e marca carrinhos abandonados.
- Registrado em `install.sh` e `update.sh`.
- `npm run e2e:smoke` foi de 33 para **41 verificações**.

---

## [3.11.0] — 2026-08-17

Fecha os dois últimos módulos sem camada server-side. Financeiro e
Relatórios passam a seguir o mesmo padrão dos outros dez módulos:
`src/lib/*.ts` + script de reparo + cobertura no smoke.

### Corrigido — Financeiro (crítico)
- **Valor em padrão brasileiro derrubava o lançamento.** `"10,50"` virava NaN
  no `numeric` e a API respondia 500 devolvendo o SQL inteiro ao navegador.
  Agora `src/lib/finance.ts` valida com Zod usando `money.ts`, aceita
  `"1.234,56"` e `"R$ 10,50"`, e o erro nunca expõe a query.
- **Valor negativo e descrição vazia eram aceitos** com 200 OK.
- **Lançamento automático podia ser excluído e adulterado** pela UI: a receita
  do PDV sumia do caixa e a reconciliação quebrava sem trilha. Lançamento com
  origem (`sale_id`/`order_id`/`purchase_id`/`cash_session_id`) agora é
  bloqueado para edição e exclusão — só a baixa é permitida.
- **Exclusão virou arquivamento** (`archived_at` + motivo), no padrão adotado
  desde a v3.0.4, com restauração.
- **Status `atrasado` nunca era atribuído.** O enum previa, a UI filtrava e o
  Dashboard somava, mas nada escrevia. `refreshOverdue()` marca os vencidos.
- Coerência status × datas: `pago` exige data de pagamento; em aberto zera.

### Corrigido — Relatórios (crítico)
- **Vendas e pedidos cancelados entravam no faturamento.** Contaminava receita,
  ticket médio, gráfico mensal, mix e top clientes. Agregações agora filtram
  `status <> 'cancelada'` / `<> 'cancelado'`, e a tela informa quantas vendas
  foram excluídas.
- **Fuso horário jogava faturamento para o mês errado.** O corte era em UTC
  (`toISOString`) e o rótulo em pt-BR: venda de 31/08 às 21:30 BRT caía em
  setembro. Criado `src/lib/period.ts`; a conversão acontece em SQL com
  `AT TIME ZONE` no fuso da loja (`APP_TZ`, padrão America/Sao_Paulo).
- **Mix de pagamento quebrava com pagamento dividido**: agrupava a string
  `"PIX + Dinheiro"` como se fosse uma forma. Agora lê o JSONB `payments` com
  `jsonb_array_elements`, com fallback para vendas legadas.
- **Margem negativa renderizava barra cheia**: `width` negativo é CSS inválido,
  era descartado e a pior margem aparecia como a melhor. Clamp em [-100, 100] e
  `HBars` passou a escalar por valor absoluto, com hachura no negativo.
- Ticket médio não considera mais venda cancelada no divisor.
- Agregação movida para SQL — a página carregava `sales`, `orders`, `quotes`,
  `customers` e `products` inteiros e somava em JavaScript.

### Adicionado — Integração entre módulos
- **Compra recebida gera despesa.** A tela do Financeiro prometia "compras, as
  despesas", mas `receivePurchase()` nunca tocava em `transactions`: o custo de
  insumo jamais entrava no resultado. Agora lança de forma transacional e
  idempotente (receber duas vezes não duplica).
- **Caixa integrado ao Financeiro**: sangria, suprimento e a quebra/sobra do
  fechamento cego viram lançamento vinculado à sessão.
- **DRE simplificado nos Relatórios**: receitas e despesas por categoria,
  resultado por competência, saldo em caixa realizado e margem. Relatórios não
  importava `transactions` — não existia lucro nem contas a pagar/receber.
- Cancelamento de venda e de pedido arquivam a receita em aberto e registram o
  estorno vinculado ao documento.

### Alterado — Schema
- `transactions` ganhou `sale_id`, `order_id`, `purchase_id`, `cash_session_id`
  (todas com FK), `automatic`, `archived_at`, `archive_reason` e `notes`.
- `syncFinancial` em `orders.ts` casa por `order_id`. Antes usava
  `ilike("Pedido PED-2026-001%")`, que casava também com `PED-2026-0010`,
  `0011`… — a partir do décimo pedido um sobrescrevia o outro.

### Alterado — UX / layout
- Seletor de período em Financeiro e Relatórios (mês atual por padrão, presets
  e intervalo livre). O card dizia "Saldo do período" e somava a base inteira.
- Financeiro: paginação, busca por descrição, agenda de vencimentos em 30 dias,
  cartões em vez de tabela no mobile, badge `auto` no lançamento do sistema.
- Ações com estado de carregamento e tratamento de erro — `markPaid` e excluir
  não tratavam falha e davam `refresh()` como se tivessem funcionado.
- `confirm()` nativo substituído por `Modal`, alinhado ao resto do sistema.
- Exportação CSV (com BOM para o Excel) e impressão em Relatórios.
- Categorias canônicas: o seed gravava `"Vendas"`/`"Insumos"` e o código
  automático `"venda"`/`"taxa_cartao"`; os filtros tratavam como distintos.
- `Donut` não muta mais acumulador durante o render (regra de imutabilidade do
  React 19) e ignora fatias não positivas.

### Operação
- Criado `scripts/repair-finance.mjs`: normaliza valores e categorias, religa
  lançamentos órfãos aos documentos, marca automáticos, reconstrói a despesa de
  compras já recebidas e aplica o status `atrasado`.
- `scripts/install.sh` e `scripts/update.sh` agora executam `repair-finance.mjs`.
- `npm run e2e:smoke` passou de 20 para 33 verificações, cobrindo valor em
  padrão BR, rejeição de valor inválido, não vazamento de SQL, bloqueio de
  lançamento automático, arquivamento, despesa de compra idempotente e exclusão
  de cancelados do faturamento.

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
