# Onde estamos — mapa de versões

> Arquivo de referência. Sempre que eu fechar uma versão nova, atualizo
> aqui. Se você quiser saber em que pé está sem reler a conversa, é este
> o arquivo.

**Última atualização:** 25/08/2026 (2ª)

---

## Resposta direta: depois da 3.44.0 saiu UMA versão

**A 3.45.0.** Só ela. E ela é a que fecha o buraco de segurança da API
do portal.

Você não está perdido à toa — eu fechei a 3.45.0 no meio de uma resposta
grande sobre segurança e não deixei isso claro. Pior: **taguei a versão e
esqueci de gerar o pacote `.tar.gz`.** Sem o pacote, não tinha como você
instalar. Acabei de gerar, está em `release/`.

---

## Estado agora

| | |
|---|---|
| **Versão no ar** | **3.68.12** — ficha lateral fixa no chat (3 colunas em telas largas, estilo Waplus) |
| Rodando em | servidor da gráfica (túnel `app.vtdigital.site`) · produção em 3.68.11 ✔ — este deploy é o 3.68.12 |
| Testes | `e2e:smoke` completo ✔ · typecheck ✔ · lint 11 (base) · /whatsapp 200 ✔ · ficha passa a carregar junto com a conversa (lateral sempre pronta em telas largas) |
| Observado | `company_email` ganha padrão `contato.vt@` (só se vazio) · `labor_hourly_rate` ficou 0 por escolha do dono · aviso de "password sem suporte visual" = falso alarme da ferramenta do servidor (Painel desenha os 3 segredos com máscara) |
| Lint | 11 problemas (baseline de sempre, nada novo) |
| Pacote | `update-3.68.2/` · `printflow-erp-v3.68.2.tar.gz` — `bash scripts/deploy-auto.sh <caminho-do-pacote>` (SEMPRE com caminho) |

### O que a 3.68.8 entregou — ficha 360º no chat do WhatsApp

**QUEM É QUEM.** A ficha que abria sobre a conversa só olhava pedidos.
Agora responde "o que esse cliente já fez?" sem sair do WhatsApp:

- **Últimas compras no balcão** (vendas do PDV, com forma de pagamento e data)
- **Últimos pedidos** (como antes, clicáveis)
- **Últimos orçamentos** — antes só uma contagem de abertos; agora
  número, valor e status de cada um (Rascunho/Enviado/Aprovado/…)
- **Últimas cobranças** — descrição, valor e situação (Aguardando/Pago/…)
- **LTV correto** — "Já comprou" soma pedidos E vendas de balcão
  (cancelados de fora). Cliente fiel do balcão deixava de parecer
  "nunca comprou".

**CADASTRO SEM SAIR DA CONVERSA.** Conversa com selo "sem cadastro"
ganhou botão **Cadastrar cliente**: telefone já vem travado no número
da conversa (o E164 que a identifica), o operador só digita o nome.
Se o telefone já pertence a um cliente, nada é duplicado — a conversa
só é vinculada a ele. Depois de salvar, a ficha 360º abre sozinha.

Detalhe técnico: `customer_id` em `whatsapp_conversas` continua sem
writer no código do bot — o ERP agora escreve esse campo só no fluxo
de cadastro do chat, que é decisão do operador.

### O que a 3.68.2 entregou — cartela, incidente e pagamento

**PEÇA 0 · Unidade de venda.** A Consulta Rápida copiava `1 un —
R$ 12,90` para o adesivo vendido **por cartela de 60** — o cliente do
WhatsApp lia "1 adesivo". O dado já existia (`pieces_per_sheet` +
descrição escrita pelo dono) e não chegava à tela. Agora: colunas
`sale_unit_label`/`sale_unit_pieces` (aditivas), seed da família
`ADES-%`, bloco "Unidade de venda" no cadastro e — no formato pedido
pelo dono — o texto copiado mostra as unidades por faixa:

```
*Adesivo Personalizado 40x15mm (vinil branco)*
1 — R$ 12,90  (60 unidades)
2 — R$ 11,75 cada  (R$ 23,50) (120 unidades)
```

**Incidente 2026-08-24 — e as duas regras que nasceram dele.** Update
com `pg_dump` falho seguiu sem backup; depois a reinstalação da base
curada apagou produção; recuperação veio do `backup-antes-base-curada`.
Agora: **update sem backup restaurável ABORTA** (`update.sh`) e **o
instalador não apaga banco sem backup conferido** (`instalar-base-curada.sh`).
Histórico completo: `docs/INCIDENTE-2026-08-24.md`.

**Pagamento volta a ser uma experiência.** O cliente que pagava ficava
preso na tela da InfinitePay (com `app_base_url` vazio o ERP nem enviava
`redirect_url`). Agora `/pagamento/retorno` é comprovante completo:
valor pago, PIX/cartão, parcelas, cliente, protocolo e comprovante. A
URL pública (`https://app.vtdigital.site`, túnel que o dono já tem) é
preenchida sozinha pela migração **se estiver vazia** — InfiniteTag
nunca é tocada. Guias: `docs/SETUP-INFINITEPAY.md` e
`docs/SETUP-CLOUDFLARE-TUNNEL.md` (com a regra do Access e os bypass
públicos).

**Fios que ficaram anotados:** `check-version.mjs` engole falha de
`psql` em silêncio (corrigir: banco inalcançável = erro barulhento);
re-exportar `base-curada.sql` com `app_version` em dia; branch do
servidor (`catalogo-v3.68.1`) internamente é 3.68.0.

### 3.68.1 e 3.68.0 (entradas que faltavam)

**3.68.1** — instalação do zero quebrava na primeira compra:
`document_counters` não vinha no export da base curada → CMP-2026-0001
duplicado → 500. Corrigido no exportador e na base.

**3.68.0** — catálogo completo no pacote + limpeza do resíduo de e2e.


**Versão do servidor: consulte `/api/version`** — até a 3.53.2 o banco nunca era carimbado, então eu não tinha como saber. O pacote 3.53.2 cobre o pulo
inteiro. Traz **mudança de banco** (tabela `registration_links`), mas o
`deploy-auto.sh` já roda `drizzle-kit push` sozinho.

### O que a 3.59.2 entregou — MARCA VTDIGITAL

**O ERP deixou de se chamar PrintFlow.** Agora é **VTDIGITAL** (sem a
palavra ERP — escolha do dono), com a logo dele.

**Descoberta que valeu checar antes:** os documentos que o CLIENTE
recebe (cupom, orçamento, OS) já usavam `company.name` — já mostravam
VTDIGITAL ART STUDIO desde a 3.54.0. "PrintFlow" só sobrava como nome
do SOFTWARE (aba, sidebar, rodapé de relatório) e como texto de
reserva. **O cliente nunca viu "PrintFlow".**

Trocado só o VISÍVEL (decisão dele): título, sidebar (VTDIGITAL / Art
Studio), relatório PDF, User-Agent SuperFrete, InfinitePay,
package.json. Nomes internos de arquivo/pacote ficam
(`printflow-erp-*.tar.gz`).

**LOGOS:** 5 enviadas → 3 usadas, redimensionadas para o uso real:
horizontal 640x210 (48 KB) · fundo escuro 512 (61 KB) · ícone 256
(31 KB). `scripts/aplicar-logo.mjs` grava como data URI **só onde está
vazio** (logo do Painel nunca é sobrescrita) e recusa >400 KB. Roda no
deploy. Conferido: `/configuracoes` em 93 KB, zero base64 no HTML.

**Sidebar:** o ícone era SVG em código; agora é a logo via
`/api/upload/logo` (binário + ETag). Marca CMYK fica ATRÁS da imagem —
server component não tem `onError`, então sem logo a rota dá 404 e
aparece a marca.

**Favicon:** não existia. `src/app/icon.png` + `apple-icon.png`
gerados da logo quadrada (Apple com fundo branco sólido).

### O que a 3.58.1 corrigiu

**BUG DO PRINT — "rota não encontrada" ao desligar o bot.** O proxy
`/api/whatsapp/[...rota]` tinha um Set de nomes e repassava GET e POST
para qualquer rota; o serviço só trata POST em `/pausar`. O **Next
pré-busca com GET** ⇒ toast vermelho aparecia sozinho, sem clique, e a
ação funcionava. Agora o proxy é `Record<rota, métodos[]>` e devolve
**405 + Allow** antes de tocar no serviço; 404 fica só para rota
inexistente. A UI também caía em `r.json()` de resposta não-JSON
(405/502) mostrando "Unexpected token" — agora mensagem por faixa.

**CATEGORIAS EDITÁVEIS PELA TELA** (pedido do dono):
`CategoriasManager` serve produto e material. Estoque → aba
"Categorias"; Produtos → botão que expande. Travas **no servidor**:
apagar com itens → 409 com a contagem · terceiro nível → 422 · pai de
si mesma → 422 · virar filha tendo filhas → 422.
**`crudHandler` agora respeita `status` no erro** (era 500 para tudo).

**Bug do `seed-demo`:** produtos referenciavam `pricing_tables` por ID
FIXO (1,7,8,9) — quebra ao recriar as tabelas ("violates foreign key").
Agora resolve por posição real.

### DECISÕES DO DONO (20/08)
- Botton: **vem em kit**, preço do material **varia** ⇒ 3 kits
  (22·44·58) com custo editável por compra. Fica em **Brindes**.
- Bottons reais: alfinete 44 · espelho 58 · chaveiro 44 · abridor 44 ·
  passador de agenda 22 · clips 22.
- **Atual Card: OFF.**
- **PORQUÊ DAS CATEGORIAS:** ele precisa de **tabela de preços em PDF**
  e **catálogo online no portal do cliente**. As categorias viram o
  ÍNDICE dos dois — por isso subcategoria vazia é útil (mostra o que
  ele faz mesmo sem produto cadastrado).
- **E-mails a construir:** transacional (sem opt-in) vs marketing (exige
  `marketing_opt_in`). Ver `ROADMAP-E-DECISOES.md`.

### O que a 3.58.0 entregou

**Árvore de categorias de produto em DOIS NÍVEIS — desenho do dono.**
Ele rejeitou duas rodadas dos meus nomes ("Corporativo & Escritório",
"Embalagem & Unboxing") e mandou a árvore pronta. Organiza por como o
CLIENTE pergunta, não por máquina.

4 mestres / 14 subs: 🖨️ Gráfica Rápida & Divulgação (Balcão&Cópias ·
Impressos Comerciais · Divulgação&Panfletagem · Comunicação Visual) ·
🎨 Papelaria Personalizada (Organização&Encadernação · Festas&Eventos ·
Papelaria p/ Lojas) · 🥤 Brindes & Estamparia (Copos&Acrílicos ·
Sublimação · Têxtil · Bottons) · 🤖 Impressão 3D (Decorativas ·
Cortadores · Corporativo).

**Schema:** `item_categories.parent_id` (auto-referência, **ON DELETE
SET NULL** — apagar mestre não apaga o trabalho de classificar).
Import `AnyPgColumn` só no `references`. **Só dois níveis** (smoke
verifica que não há netos).

**Tela:** `<optgroup>`. No FILTRO a mestre traz os filhos junto; no
CADASTRO só a folha é escolhível (produto pertence à subcategoria).
Categoria sem pai e sem filhos vai para "Sem grupo".

16 produtos remapeados à mão; 6 categorias antigas vazias removidas.
Seed roda no deploy (passo 7/9).

**Correções do dono:** adesivo vinil em m² é terceirizado, **até A3 na
Konica é dele e é o que mais sai**; camisa **sublimática é própria**,
camiseta **DTF é terceirizada**; body infantil sai muito. Bottons
reais: alfinete 44 · espelho 58 · chaveiro 44 · abridor 44 · passador
de agenda 22 · clips 22.

**Erro meu:** anotar `itemCategories: ReturnType<typeof pgTable>`
apaga os tipos de TODAS as colunas e quebra o build do PDV.

### O que a 3.57.0 entregou

**Categorias de material.** O banco já tinha `materials.category_id`,
a tabela `item_categories` e o enum com `'material'` — mas nenhuma
categoria de material existia. 22 materiais com "—" e select de uma
opção só.

8 categorias, ordem por FREQUÊNCIA de uso (adesivo em 1º: "é o que
mais sai"): 🏷️ Adesivo & Vinil · 📄 Papel & Cartonagem · 🎨 Tinta,
Toner & DTF · 🥤 Brindes para gravar · 🧊 Filamento & Resina 3D ·
✂️ Acabamento · 📦 Embalagem · 🧰 Uso geral.

`scripts/seed-categorias-materiais.mjs` classifica por palavra-chave,
só material SEM categoria. Regras ORDENADAS (específico antes de
genérico) — "Ribbon" cai em Tinta, não em Acabamento. Os 12 materiais
reais classificados, 0 sobrando. Roda no deploy (passo 7/9).

**Tela agrupada:** cada categoria é um bloco com nome, contagem e
quantos "em falta". "Sem categoria" por último = lista de pendências.

**Decisão do dono:** brindes controlados **por cor/modelo separado**
(long drink azul ≠ long drink transparente), cada um com seu mínimo.

**Lixo de teste removido:** 10 "E2E Papel" + 10 "E2E Produto" + 110
movimentos órfãos. O `e2e-smoke` criava e NUNCA apagava — e o deploy
roda o smoke em produção. Agora o smoke limpa o que cria (fora do
assert: falha de faxina não reprova deploy) e existe
`scripts/limpar-dados-teste.mjs` (só apaga o que não está preso a
pedido/venda/produto).

**Armadilha:** `item_categories.icon` guarda **EMOJI**, não nome de
ícone — a tela imprime o valor cru no `<option>`.

### O que a 3.56.0 entregou

**WhatsApp em abas** (ideia do dono): Conversas · Campanhas ·
Mensagens · Conexão. Ordem por FREQUÊNCIA de uso — a conexão era
primeira só por ter sido construída primeiro. Contador de conversas
esperando fica NA aba; sinal conectado/desconectado sempre visível ao
lado. Painéis ficam **montados e escondidos por CSS** (não
desmontados): o polling do chat segue vivo em qualquer aba e trocar de
aba não perde rascunho de campanha. Usa o `Segmented` que já existia.
`WhatsAppClient` ganhou prop `semCabecalho`.

**AUDITORIA COMPLETA — todos os módulos.** Faltavam Cobranças e
Envios: `scripts/auditar-cobrancas-envios.mjs`, 14 ✔, 0 bug de código.
(O **Painel de Controle** já havia sido auditado na 3.55.0 como
"Configurações" — 14 ✔ e 2 bugs corrigidos.)

**ACHADO QUE CUSTA DINHEIRO:** taxa de parcelado estava em 5,99% (que
é a de 3x); a de 12x é **12,40%**. Num pedido de R$ 1.000 em 12x são
R$ 64 a menos que o previsto — R$ 641/mês em 10 pedidos. Padrão subiu
para 6,12% e o hint mostra a escada (3x 6,12% · 6x 8,8% · 12x 12,40%).
**Pendente: o dono ajustar para 12,40% se aceita 12x.**

**Regra do SuperFrete escrita na tela** de Envios ("só para fora do
município") — lembrete, não trava. Aviso: 20/20 produtos sem
peso/dimensão caem no pacote padrão.

### O que a 3.55.2 corrigiu — SCHEMA SEM TTY

Site voltou na 3.55.1 mas **`/api/campanhas` → 500**: as tabelas
`campaigns`/`campaign_targets` nunca foram criadas.

**Causa:** `drizzle-kit push` é interativo; por SSH sem TTY ele não
conclui **e sai como sucesso**. O `deploy-auto.sh` tratava como `warn`
e seguia. O dono diagnosticou certo ("executar com TTY OU incluir
migrations SQL") e resolveu na mão com ALTER TABLE.

Entregas: **`scripts/migrar-banco.mjs`** (confere 6 tabelas / 8 colunas
/ 2 enums e cria o que falta; sem TTY; idempotente; **só cria**, nunca
dropa) · **`scripts/migrar-campanhas.sql`** (o SQL, para aplicar à mão)
· deploy passo 7/9 agora **FALHA** se o schema seguir incompleto ·
3 asserções no smoke exigindo 200 em `/api/campanhas`,
`/api/whatsapp-chat` e `?audiencia=1` (testadas dropando as tabelas).

Corrigidos dois nomes que eu havia chutado: as colunas de prazo são
`lead_time_creation|production|finishing|serial`, não `prazo_*_dias`.

**Servidor:** processo "zumbi" resistindo a `pkill -9` é quase certo o
**node_monitor do aPanel** ressuscitando — deve ser desligado para este
site, senão briga com o pm2.

### O que a 3.55.1 corrigiu — APAGÃO 19/08

**Eu derrubei o site do dono com uma instrução errada.** No
`DIAGNOSTICO-SERVIDOR.md` escrevi `npm install --omit=dev`. Isso pula
as devDependencies — e **TypeScript e Tailwind estão lá**, necessários
para COMPILAR. Sem TS o webpack não resolve os atalhos `@/` do
tsconfig: build morre em "Module not found" e o `.next` fica sem
`BUILD_ID`. Aí `next start` sai no primeiro segundo e o pm2 entra em
loop. Reproduzido e confirmado.

**Também corrigi uma afirmação minha:** eu disse que o build falhava
com exit 0. Errado — era `npm run build | tail`, e o pipe devolve o
código do tail. O `next build` sinaliza a falha certo.

Entregas: **`scripts/socorro.sh`** (6 verificações; `--consertar`
reinstala/rebuilda/sobe; distingue SIGKILL de erro de código) ·
`deploy-auto.sh` agora **exige `.next/BUILD_ID`** em vez de confiar no
exit code · **asserção no smoke** que reprova `--omit=dev` antes do
build (testada injetando o erro) · `SOCORRO-SITE-FORA.md` e correção
dos dois documentos errados.

**Pendência do servidor:** `pm2 list` sem processo `printflow` — falta
`pm2 save` + `pm2 startup`, senão nada volta após reboot.

### O que a 3.55.0 entregou

**BOTÃO NATIVO FUNCIONA NO BAILEYS — eu estava errado.** O dono avisou
que já tinha feito funcionar. `proto.Message.InteractiveMessage.NativeFlowMessage`
existe no baileys 6.7.24; o que `sendMessage({buttons})` não faz é
montá-la. `services/whatsapp/src/botoes.mjs`: cta_url, cta_call,
cta_copy, quick_reply via `generateWAMessageFromContent` +
`relayMessage`. Envelope `viewOnceMessage` é obrigatório;
`merchant_url` repetido junto de `url` senão some em parte dos
aparelhos. Import NOMEADO (`import { proto } from "baileys"`) —
`pkg.default.proto` é undefined. Fallback automático para link no
texto; `modo` no retorno diz qual caminho foi usado.

**Auditoria de Serviços/Calendário/Configurações** —
`scripts/auditar-3-modulos.mjs`, 14 ✔. Dois bugs:
· **Calendário**: `new Date(2027,1,29)` → 1º/mar silenciosamente; data
  em 29/02 caía um dia depois em 3 de cada 4 anos. Agora recua para o
  último dia do mês.
· **Configurações**: a API criava QUALQUER chave enviada (2 órfãs
  achadas). Criar agora exige chave do catálogo; atualizar segue livre.
· **Serviços**: sem bug — `serviceTotal` já cobra horas × valor-hora
  desde a 3.45.1. Aviso: valor-hora em R$ 0.

**DIAGNÓSTICO DO SERVIDOR** (`DIAGNOSTICO-SERVIDOR.md`): o erro em
`/configuracoes` era **deploy pela metade** — banco na 3.54.0, processo
no ar servindo o build da 3.47.1 (`/api/campanhas` → 404). Faltou
`npm run build` antes do `pm2 restart`.

### O que a 3.54.0 entregou

**Campanhas para base quente.** As 6 travas do
`MARKETING-WHATSAPP-BASE-QUENTE.md` viraram código: já escreveu ·
<12 meses · opt-in próprio (`marketing_opt_in`, campo novo separado do
opt-out) · máx 4/pessoa/mês · máx 50/dia · disjuntor em 1% (só julga
após 20 envios). Revalida no INSTANTE do envio, não só ao montar a
fila. Lotes de 5 comandados pela tela, sem worker em background. CTA
como link (botão nativo exige API oficial).

**Chat com takeover.** Conversas com contador de não lidas (= recebidas
após a última resposta nossa). Assumir cala o bot só naquela conversa.
Tolera a ausência das tabelas do serviço.

**Painel → WhatsApp & Marketing** (8 campos): janela, tetos, disjuntor,
jitter. Divisão: Painel = números · tela WhatsApp = conexão/conversas ·
Mensagens = textos.

**Dados da empresa preenchidos** do cupom impresso —
`scripts/preencher-empresa.mjs`, só toca campo vazio (ou `--forcar`).

### O que a 3.53.2 corrigiu

**Eu estava dando a versão errada do servidor.** `settings.app_version`
nunca era gravada: o deploy não chamava `check-version.mjs`, e ele só
gravava quando o valor já existia (`out && out !== version`) — a
primeira gravação nunca acontecia. Agora o deploy carimba e
`/api/version` devolve `installedVersion` e `upToDate` de verdade.

**`drizzle.config.json` ignorava o `.env`** — a URL do banco estava
escrita à mão apontando para `app_db@127.0.0.1`. Em instalação nova com
outro banco/usuário, o push ia para o lugar errado, respondia "No
changes detected" e o deploy quebrava depois com "relation settings
does not exist". Virou `drizzle.config.ts` lendo `DATABASE_URL`.

**Passos manuais viraram automáticos:** `seed-prazos` (seguro, só toca
produto no padrão de fábrica) e `diagnosticar-sistema` agora rodam no
deploy. Nenhum comando manual depois do `deploy-auto.sh`.

Instalação do zero testada: banco vazio → 40 tabelas, 99 configurações,
expediente 17h, prazos, versão carimbada. Rollback automático também
exercitado (build morreu por RAM e o script restaurou sozinho).

### O que a 3.53.1 corrigiu

**O Painel de Controle não abria em produção** (relatado pelo usuário).
As logos são data URIs de até 2 MB em `settings`; a página mandava o
valor inteiro ao navegador e o Next serializa duas vezes (HTML + RSC).
Resultado: 12 MB por tela. Agora `GET /api/upload/logo?key=` serve a
imagem com ETag/304 e a página envia só o marcador `__SET__`.
**12.092.658 → 92.628 bytes.** `/api/crud/settings` tinha o mesmo
problema (4 MB → 32 KB). `POST` recusa `__SET__` com 422 — sem essa
trava, um "Salvar" apagaria a logo silenciosamente.

**Varredura geral:** `scripts/diagnosticar-sistema.mjs`, 8 blocos
(peso das páginas, valores gigantes, órfãos, duplicatas, coerência
financeira, config pendente, Painel × banco, estado do bot). Não
altera nada. Resultado: 0 problemas, 4 avisos (CNPJ, e-mail,
`app_base_url` e valor-hora por preencher).

### O que a 3.53.0 entregou

**Desligar o bot sem sair do WhatsApp.** Antes, calar o bot só era
possível por `/desconectar`, que apaga a sessão, exige QR de novo e —
pior — faz o número não receber nada no intervalo. Agora conexão e bot
são separados: pausado, o serviço segue conectado, recebendo, gravando
e criando lead; só as respostas param. Botões de "1 hora" / "Até
amanhã" / desligar indefinido, com religamento automático verificado
na leitura (não por cron, que perderia a hora se o servidor parasse).
Opt-out continua funcionando pausado (LGPD não se pausa). Aviso de
ausência opcional, uma vez por conversa, texto editável
(`bot.ausencia`). Estado em `settings`, lido por ERP e serviço.
Rotas: `POST /pausar {minutos}` · `/retomar` · `/ausencia {ativa}`.

### O que a 3.52.0 entregou

**Nota fiscal saiu** dos textos voltados ao cliente — virou
"documentos", que cobre orçamento e recibo hoje e a nota depois.

**Mensagens editáveis pela web** (Painel → WhatsApp). Catálogo de 10
textos: o funil do bot inteiro mais o pedido de cadastro. O padrão
mora no código e a tabela `message_templates` só guarda customização —
banco fora do ar ou texto em branco caem no padrão, o bot nunca fica
mudo. Restaurar apaga a customização (não copia o padrão), variável
inventada é recusada com 422, e o editor abre com o bot offline.
Catálogo em `src/lib/mensagens.ts`: mensagem nova é um item na lista.

**Nome em dois campos** na página pública para PF (Primeiro nome /
Sobrenome). PJ segue com razão social num campo só.

### O que a 3.51.0 entregou

**Expediente real.** Corte de 15h → **17h** (o 15h era palpite meu, e
um script de migração troca só se ninguém tiver ajustado). E
**produzir deixou de ser a mesma coisa que atender**: `diasUteis`
(seg–sex, máquina) agora é separado de `diasAtendimento` (seg–sáb) e
`sabadoAte`. O sábado não encurta prazo nenhum; quando a peça fica
pronta na sexta, o sistema oferece retirada no sábado. Prazos reais
ditados pelo dono no `seed-prazos.mjs` — adesivo/vinil 1d, cartão 1d,
3D 2d, papelaria 3d, banner terceirizado 3d, 3D com modelagem 4d.

**Atual Card:** pesquisado, sem API pública. Ver
`ATUALCARD-INTEGRACAO.md` — o caminho é o telefone dos Agentes
Oficiais (41) 3134-2602.

### O que a 3.50.0 entregou

Página pública de cadastro (`/cadastro/<token>`) e o botão **"Pedir
cadastro"** na ficha do cliente. O operador clica, lê a mensagem, o bot
entrega o link; o cliente preenche no celular e o **mesmo** cadastro é
atualizado. Link vale 7 dias, serve uma vez, e o formulário público só
consegue gravar campos de uma lista branca — limite de crédito, status,
tags e anotações internas não atravessam (há teste tentando).

Depois de instalar: preencher **Painel → Integrações → URL pública do
sistema** (`app_base_url`). É de lá que sai o endereço do link.

**Você está rodando a 3.29.1 no servidor da empresa.** Continua valendo
o guia `docs/UPGRADE-3.29.1-PARA-3.44.0.md` — ele cobre até a 3.44.0, e a
3.45.1 não acrescenta nenhum passo de migração (é só código, sem mudança
de banco).

---

## O caminho desde onde você parou

Você está na **3.29.1**. De lá para cá:

| Versão | O que entrou |
|---|---|
| 3.30 – 3.38 | ciclo de precificação, catálogo, estoque, motor de preços |
| **3.39.0** | tempo de máquina no motor (`hourlyRate` × minutos); BOPP |
| **3.40.0** | preços reais do seu parque (Konica, valor-hora 2,50) |
| **3.41.0** | correção: quantidade era ignorada em m² |
| **3.42.0** | tabelas de preço no PDV; separa custo de preço de venda |
| **3.43.0** | folha indivisível (`piecesPerSheet`), piso em reais |
| **3.44.0** | peças por folha editável; preços de venda 2,2× |
| **3.45.0** | **segurança:** API key obrigatória na API do portal |
| **3.45.1** | **correção:** `backup.sh` e `restore.sh` estavam quebrados |
| **3.46.0** | horas de serviço viram custo (valor-hora) + backup automático |
| **3.46.1** | Serviços: nome duplicado e arquivado; verificador de instalação; tabelas de lona/adesivo |
| **3.46.2** | upload de logo no Painel; 1ª tentativa no campo do troco |
| **3.46.3** | **correção definitiva:** campo "Recebido R$" legível (variante escura real) |
| **3.46.4** | Konica: remove custo de exemplo que desligava o motor de preço |
| **3.46.5** | Konica: faixas reais — texto, meia cobertura e chapado |
| **3.46.6** | WhatsApp fase 1: telefone canônico (E.164) e único por cliente |
| **3.46.7** | Deploy automático + verificação real de contraste (WCAG) |
| **3.47.0** | **WhatsApp**: Baileys + QR + pré-cadastro inbound (serviço separado) |
| **3.47.1** | WhatsApp: suporte a `@lid` — o bot ficava mudo sem isso |
| **3.47.2** | WhatsApp: logs visíveis + `diagnosticar.mjs` |
| **3.47.3** | WhatsApp: fim da repetição — saudação por estado + fila por contato |
| **3.48.0** | Entrada/saldo 50-50 nos pedidos + desconto PIX 5% (era 6,12%) |
| **3.49.0** | Prazo de entrega em dias úteis, por produto (criação/produção/acabamento) |
| **3.49.1** | Prazo editável na tela do produto (a 3.49.0 esqueceu a ponta) |

**30 tags no total** no repositório.

---

## O que a 3.45.0 fez, em uma frase

A rota `/api/portal` respondia **200 com seu catálogo completo para
qualquer um na internet** — a checagem de token dependia de uma variável
que nunca existiu no `.env`, então era pulada. Agora exige chave, falha
fechada, e o catálogo não expõe mais custo nem margem.

Detalhes em `API-KEY-PORTAL.md` (inclusive sua chave).

---

## Como instalar a 3.45.1 no servidor da empresa

```bash
# no Debian da empresa, dentro da pasta do ERP
bash scripts/update.sh
```

O `update.sh` faz backup, instala, roda `drizzle-kit push` e reconstrói —
**sem reseed**, seus dados ficam.

Depois de subir, confira:

```bash
curl localhost:3000/api/version    # deve dizer 3.45.1
```

⚠️ **Um passo manual nesta versão:** a 3.45.1 exige a variável
`PORTAL_API_KEYS` no `.env`. Se ela não existir, a rota `/api/portal`
responde 503 de propósito (falha fechada). A linha está em
`API-KEY-PORTAL.md`.

---

## Combinado daqui para frente

Sempre que eu fechar uma versão, digo em uma linha no fim da resposta:

> **v3.XX.0 fechada** — o que mudou · pacote em `release/` · testes N ✔

E atualizo este arquivo. Se eu esquecer, me cobra.

---

## O que ainda não virou versão

Nada de portal, WhatsApp ou e-mail foi implementado — está tudo em
documento de plano, nenhuma linha de código:

- `PLANO-PORTAL-WHATSAPP-EMAIL.md` — arquitetura e fases
- `SETUP-CLOUDFLARE-TUNNEL.md` — rede
- `REGRAS-ANTIBAN-E-EMAIL.md` — travas do WhatsApp
- `DIAGNOSTICO-EMAIL-DNS.md` — SPF/DKIM/DMARC medidos
- `DIMENSIONAMENTO-400-CONTATOS.md` — seus 300 + 100

**Item 4 do plano comercial saiu na 3.50.0.** Faltam da mesma frente:
página pública do orçamento com Aprovar/Pedir ajuste, botão "Enviar
orçamento por WhatsApp", e entrada/saldo 50-50 nas telas.

Pendências antigas de dados: faixa por volume nas tabelas, volume mensal
da Konica, rendimento do kit de toner R$800, ribbons metálicos, papel
sublimático, `costMultiplier` real. Módulos ainda não auditados:
**Serviços, Calendário e Configurações**.

## O que a 3.59.2 corrigiu

- **Ícone da barra lateral**: era a logo inteira espremida em 40px e saía
  ilegível. Agora é só o símbolo "VT". Favicons refeitos do mesmo arquivo.
- **Cupom do PDV**: alinhado ao do sistema antigo, medindo a foto pela
  bobina de 80mm — fonte 11,5px (era 11), entrelinha 1,2 (era 1,25),
  rodapé à esquerda, "V A L O R  T O T A L" espaçado, coluna do R$
  alinhada. Corrigido o rodapé que era impresso **duas vezes**.
- **Migração de banco**: `migrar-banco.mjs` deixou de usar lista digitada
  à mão (9 colunas) e passou a derivar o esperado do `src/db/schema.ts`
  via `scripts/schema-dump.mts` — 42 tabelas, 21 tipos — unido às tabelas
  criadas em `migrar-campanhas.sql`. Era a causa dos 500 recorrentes a
  cada update (`item_categories.parent_id` na 3.58.1).
  `tsx` declarado em devDependencies; fallback para `npx`.

Pacote: `/home/user/VTDIGITAL-3.59.2-COMPLETO.tar.gz`
sha256 `09090c3a7a74264b6652dc134172bba6ec7824a674d6780f0b57b685ff18e0cc`
Testes: 245 ✔ · lint na baseline (11)

## Bug do WhatsApp — verificado e FECHADO (20/08/2026)

O dono voltou a citar o toast "rota não encontrada" ao desligar o bot.
Reproduzi na v3.59.2 com o serviço Baileys no ar:

- `POST /pausar` · `/retomar` · `/ausencia` → **200**
- `GET` nas mesmas (o que o Next pré-busca) → **405** com mensagem clara
- Serviço fora do ar → **503** "O serviço do WhatsApp não está rodando"

Nenhum caminho produz "rota não encontrada". A correção da 3.58.1
(`c84096f`) resolveu. **Pendência encerrada** — se reaparecer, é outra causa.

## v3.59.2 — conserto do processo de deploy (20/08/2026)

Instalar a 3.59.1 levou 5 tentativas. Os 4 defeitos eram do `deploy-auto.sh`
e do `aplicar-logo.mjs`:

1. **`RAIZ` calculado pela pasta do script** — rodando o `deploy-auto.sh`
   solto do pacote, `RAIZ` virava `/www/wwwroot` e o backup falhava. Agora
   procura o site pelo `package.json` com Next; aceita `--raiz`.
2. **Erro do backup em `2>/dev/null`** — escondia a causa. Agora mostra o
   erro real, pasta usada e o que conferir.
3. **Escolha automática de pacote** — reinstalou a 3.59.0 por cima dela
   mesma. Agora pergunta quando a versão do pacote == versão no ar
   (`--forcar` pula; sem TTY, recusa).
4. **Logo errada nunca corrigida** — `aplicar-logo.mjs` preservava qualquer
   valor existente. Agora grava `<chave>_origem=deploy`; logo do deploy é
   atualizada quando o pacote traz outra, logo trocada no Painel é
   preservada (a rota de upload apaga a marca). Ambos os cenários testados.

Pacote: `/home/user/VTDIGITAL-3.59.2-COMPLETO.tar.gz`
sha256 `c8222a53c5405171f0b85045e0b6530e9ded0bc8134e76bad311027283dfbe9b`
Testes: 245 ✔ · typecheck limpo

**Produção:** v3.59.1 no ar, logo do ícone correta (21388 bytes, verificada
na imagem). pm2 com systemd configurado.

## v3.60.0 — máscaras BR e CEP com autopreenchimento (20/08/2026)

Motivo: foto do cupom mostrava `2120383504`, `2197886914`, `3189224000154`
— nenhum campo da empresa tinha máscara (25 campos, todos texto puro).

- **Máscara na saída** (`src/lib/settings.ts`): CNPJ/CPF, telefone, CEP
  aplicados na leitura via `validators.ts` (já existia, foi reaproveitado).
  Banco guarda só dígitos — decisão do dono.
- **`mascararDocumento`**: só formata se o documento for VÁLIDO. 13 dígitos
  vira `31.892.240/0015-4` no formatador ingênuo — CNPJ inexistente com
  aparência de certo. Tenta recuperar zero à esquerda; se não validar, sai cru.
- **Máscara ao digitar** (`SettingsClient.tsx` + `control-panel-settings.json`):
  novo atributo `mask` (documento/telefone/cep/pix). PIX só mascara se for
  documento — e-mail e chave aleatória passam intactos.
- **CEP movido para antes do endereço** + `autofill: endereco` usando a rota
  `/api/cep/:cep` que já existia no PDV.
- **IE fica como digitada** — `formatStateRegistration` descartava letras e
  quebrou o smoke ("IE do emitente chega em /pdv"). Há IE com letras.
- **`V A L O R  T O T A L`**: `\u00a0` no lugar do espaço (HTML colapsava).

**PENDENTE DO DONO:** CNPJ e Telefone 2 estão gravados com 1 dígito a menos
(13/14 e 10/11). Não é máscara — é dado errado. Conferir em
Configurações → Identidade da empresa.

Pacote: `/home/user/VTDIGITAL-3.60.0-COMPLETO.tar.gz`
sha256 `b21441a2a24325d9fa51a598d590647913bf4bb30f4761b148f60ba2ec5b887e`
Testes: 245 ✔ · lint na baseline (11) · typecheck limpo

## v3.60.1 — varredura geral das máscaras + papel A4 (20/08/2026)

Foto do orçamento A4 mostrou `CEP 21860005` e dados do cliente crus.

- **`structuredAddress` usava o CEP cru** — era montado ANTES do bloco das
  máscaras. Como os 3 documentos (orçamento/OS/cupom) leem do mesmo
  `settings.ts`, corrigir na origem valeu para todos.
- **Dados do CLIENTE nos documentos** passaram a ser formatados na
  impressão (`formatDocumentAuto`/`formatPhone`/`formatCEP`) em
  QuotesClient, OrdersClient e PosClient. Antes vinham direto do banco —
  funcionava porque o cadastro salva mascarado, mas quebraria em importação.
- **Cadastro de clientes e página pública JÁ tinham máscara** — conferido,
  nada a fazer.
- **`@page size: auto` → `A4 portrait`**: a impressora escolhia o papel e o
  padrão de fábrica costuma ser Carta (216×279 vs A4 210×297) — margem
  irregular e risco de cortar o rodapé/assinaturas. Cupom térmico ganhou
  `@page thermal` (80mm × altura livre).

Pacote: `/home/user/VTDIGITAL-3.60.1-COMPLETO.tar.gz`
sha256 `82aca4816a19ab19a2794116d13d40fa7a05513f8195948a9b0ef106c55f6cc6`
Testes: 245 ✔ · lint baseline (11) · typecheck limpo

**Sandbox:** Postgres agora em `/home/user/pgdata` (o caminho padrão perdeu
permissão). Após reset: `chmod 700 /home/user/pgdata` ou recriar com initdb;
o snapshot descarta diretórios vazios (pg_notify) e corrompe o cluster.

## v3.61.0 — menu do celular (não existia) + responsivo (20/08/2026)

Dono relatou "muitos erros de layout no celular, menu só tem alguns".
Causa raiz: **abaixo de lg (1024px) NÃO HAVIA MENU**. `Sidebar` é
`hidden … lg:flex`; `MobileSidebarOverlay` existia mas **nunca foi montado**
(código morto, e ainda escrevia `window.__toggleMobileSidebar` durante o
render). TopBar sem hambúrguer. Só se navegava por links do conteúdo.

- **`MobileNav.tsx`** novo: gaveta com as 18 telas, fecha por rota/fora/X/Esc,
  trava o scroll do body, alvos de 44px. Ícone `menu` criado em `icons.tsx`
  (não existia — conferido antes de usar).
- **`shell/nav.ts`**: lista de navegação extraída da Sidebar → fonte única
  para desktop e mobile (senão a lista do celular ficaria para trás).
- **TopBar** passou a receber `pathname` e renderizar `<MobileNav/>`.
- `MobileSidebarOverlay.tsx` **removido**.
- **Scroll lateral** em 2 tabelas de tela (PosClient histórico, ClientsClient
  prévia de importação). Tabelas de documento A4/80mm intocadas.
- **6 grids** 3–4 col → 1–2 col no celular (`sm:` restaura). Blocos de
  impressão preservados.

Varredura: script comparando as 18 telas — 18 problemas → **0**.

**LIMITE DESTA VARREDURA:** Chromium não roda no sandbox (faltam libs).
A análise foi sobre o HTML servido, não sobre a página renderizada. Não
cobre fonte pequena, sobreposição, botão fora da borda ou teclado cobrindo
campo. Pedir prints ao dono.

Pacote: `/home/user/VTDIGITAL-3.61.0-COMPLETO.tar.gz`
sha256 `ce8941562c2cedfe694cc0a4b7e90989a3b0b3aab5d9c1626013d29e4942358e`
Testes: 245 ✔ · lint baseline (11) · typecheck limpo

## Paginação — passos 1 e 2 concluídos (2026-08-20)

- **Índices:** 17 novos em orders, quotes, customers, sales,
  stock_movements e transactions. Listagem de pedidos 1,31 ms -> 0,19 ms
  com 1.518 registros.
- **Pedidos:** paginação e busca no servidor. Página 10,4 MB -> 0,43 MB
  (24x) no volume de 1 ano. Contadores das abas continuam somando a base
  inteira; busca preserva os 6 campos, inclusive a descrição dos itens
  no JSONB. Busca/filtro na URL, debounce 300 ms, "carregar mais" no
  celular e páginas no computador.
- 245/245 no smoke, lint 11 (baseline), typecheck e build limpos.
- **Não empacotado e não enviado ao servidor** — aguardando aval na tela
  de Pedidos antes de repetir nas demais.
- Detalhes: `/home/user/PAGINACAO-PASSOS-1-2.md`

## v3.62.0 FECHADA (2026-08-21)

Pacote: `/home/user/VTDIGITAL-3.62.0-COMPLETO.tar.gz` (1.072.412 bytes)
sha256 `d98f7cb5b7285ffd16cd19564413d1c80f8dbfc34dc090078e0c084d83de739c`
Espelho: `/home/user/update-3.62.0/` · tag local `v3.62.0` (push pendente)

**Conteúdo:**
- Paginação no servidor: Pedidos, Orçamentos, Clientes (10 por página)
- Visão Geral: agregação no banco (11 tabelas inteiras -> COUNT/SUM)
- 17 índices novos (data, cliente, status, busca por texto)
- Impressão A4 legível no celular (Pedidos e Orçamentos)
- Conserto do build: checagem de tipos fora do `next build`
- LTV deixou de somar vendas canceladas
- "X vendas no período" deixou de contar canceladas

**Verificação:** 245/245 smoke · lint 11 · typecheck limpo · build gera
BUILD_ID · Visão Geral comparada seção a seção com a anterior.

**Produção dele:** 3.60.1, no ar (o 502 de 20/08 foi resolvido).
A 3.61.0 nunca foi aplicada; a 3.62.0 a substitui.

**AVISO no LEIA-ME:** o deploy precisa receber o caminho do pacote na
mão — sem isso ele escolhe o mais recente por data e pode pegar o
errado (foi o que aconteceu com a 3.61.0).

**Divergência conhecida:** Next 16.3.1 no servidor dele, 16.2.6 aqui.
O `package.json` não trava a versão exata.

## v3.63.0 FECHADA (2026-08-21)

Pacote: `/home/user/VTDIGITAL-3.63.0-COMPLETO.tar.gz` (1.073.650 bytes)
sha256 `92c4484702416352717747ac7b100549b10e257adb8b07e19655f6edb6de4563`
Espelho: `/home/user/update-3.63.0/` · tag local `v3.63.0`

Correções de segurança da auditoria:
- segredos (`superfrete_token`, `smtp_password`, `wa_token`,
  `infinitepay_api_key`) mascarados com `__SET__`; `pix_key` fora de
  propósito (é pública)
- estoque negativo recusado no cadastro (movimentação segue livre)
- 6 rotas: id fora do limite do integer devolve 400, não 500

Smoke 245 -> **257** (12 novos). Lint 11. Typecheck limpo.

**Produção dele:** 3.62.0 no ar, `upToDate: true`. A 3.63.0 ainda não
foi aplicada.

**Aberto:** dependências com CVE (next/postcss/sharp, subir sozinho) ·
Next 16.3.1 vs 16.2.6 · fuso no cliente · paginação de PDV/Estoque/
Financeiro (passo 5b).

## 2026-08-21 — WhatsApp 401 e o teste do horário de corte

**WhatsApp "não autorizado":** o `WA_TOKEN` existe em
`services/whatsapp/.env` mas **não existe no `.env` da raiz**. O
serviço exige token; o ERP manda vazio → 401. O reinício aplicado no
servidor foi no `printflow-whatsapp` (lado correto); quem precisa da
variável e do restart é o **`printflow`**. Conserto: acrescentar
`WA_TOKEN=` no `.env` da raiz + `pm2 restart printflow --update-env`.
Pendente de confirmação do dono.

**Teste de prazo vermelho:** NÃO era fuso nem bug do `/api/prazo`
(o endpoint usa `apartirDe` corretamente, `route.ts:12`). O dono mudou
`prazo_horario_corte` de 17:00 → **15:00** pelo painel; o smoke tinha
17:00 embutido nas contas. Reproduzido em laboratório com o corte em
15:00. Corrigido em `d671b92`: o bloco fixa 17:00, mede e restaura o
valor do dono, com assert de restauração. Mesmo tratamento no bloco de
e-mail, que dependia de `smtp_test_to` preenchido.

**Smoke: 269 → 270.** Typecheck limpo · lint 11 (baseline) · tag
`v3.65.0` movida para `d671b92` · pacote refeito
(sha256 `4c45645b…ae84e2`).

**Lição:** teste que lê configuração editável pelo dono vira alarme
falso quando ele exerce a configuração. Fixar o valor, medir a regra,
devolver o que era dele.

## 2026-08-22 — v3.66.0 fechada

**Entregue:** orçamento por WhatsApp em um clique (ícone na linha da
lista, envio pelo serviço, registro automático no histórico) · chat
reformado (lote de 30 + "ver anteriores", altura fixa, ficha com LTV e
últimos 5 pedidos, 7 respostas rápidas) · 7 modelos de campanha
incluindo convite ao catálogo · código de barras em produtos e
materiais com busca pelo leitor · fornecedor vinculado ao cadastro nos
materiais · validade do link de cadastro configurável (1–90 dias).

**Smoke 277 → 289.** Typecheck limpo, lint 11. Tag `v3.66.0` em
`cb901d9`. Pacote `/home/user/update-3.66.0/`
(sha256 `348980f4…30c126`).

**Migração de banco:** cria `materials.barcode`, `materials.sku`,
`materials.supplier_id`. Testado num banco 3.65.0 sem as colunas e com
dados: colunas criadas, fornecedor-texto e estoque preservados.

**Achado:** produto com código de barras repetido dava 409 genérico
("já existe um produto com este código"), sem dizer qual. Como o campo
virou editável, isso passaria a incomodar — agora responde 422 com o
nome do produto, igual aos materiais.

**Falso alarme investigado:** um smoke falhou em `/api/purchases` com
500. Não se repetiu em 5 execuções seguidas; era resíduo de execução
anterior no banco, não bug de código.

**Aberto:** InfinitePay (dono pegando credenciais) · tabela de preços
em PDF por categoria · Painel do Cliente · função do Calendário (dono
pensando) · NIIMBOT direto.

---

## 2026-08-23 — v3.67.0 fechada

**Pacote:** `/home/user/update-3.67.0/` · wrapper
`VTDIGITAL-3.67.0-COMPLETO.tar.gz`
(sha256 `1ef18a3cb1b81e13afa0214219b39b54da286c7798f6f691eb6ecc15fbe6cecd`)

Entrega em duas partes: o código novo **e** a substituição da base de
demonstração pela base real.

**No código:** vendedores com comissão sobre a margem · alertas de CRM
(aniversário e cadastro incompleto) · máscaras e validação em todos os
cadastros · fornecedor com endereço completo e busca por CEP · CPF
obrigatório com escape de boa-fé · WhatsApp na tela de pedidos.

**Nos dados:** custos reais do plotter (R$ 0,26/folha; o A3 deixou de
custar o dobro) · 26 materiais da contagem do dono, com código de
barras · 9 produtos de adesivo vendidos por unidade, com faixas de
preço · base zerada com 4 clientes, 4 orçamentos e 4 pedidos de
exemplo.

**Mecanismo novo:** `exportar-base-curada.mjs` +
`instalar-base-curada.sh`. Em vez de limpar item a item no servidor, a
configuração daqui é exportada e substitui a de lá. O instalador exige
`CONFIRMO`, faz `pg_dump` antes e carrega em transação única.

Testado num banco criado do zero: carga limpa, telas respondendo, app
subindo contra a base nova. Smoke 303 (3×), lint 11 (baseline),
typecheck limpo.

**Produção ainda na 3.65.0** — a 3.66.0 chegou a ser empacotada mas não
foi aplicada. A 3.67.0 substitui as duas.
