# Rabisco — Painel do Cliente

Desenho para discussão, **nada implantado**. Serve para você ver o
formato e dizer o que muda antes de eu escrever qualquer linha.

---

## 1. Onde cada coisa mora

Você levantou a questão certa: a base vai ficar na Hostinger, então
como conversam?

```
   CLIENTE (celular)
        │
        ▼
   portal.vtdigital.site        ← Hostinger (site do portal)
        │
        │  API com chave, por HTTPS
        ▼
   api.vtdigital.site           ← Cloudflare Tunnel
        │
        ▼
   Servidor do escritório       ← ERP + banco (a verdade fica aqui)
```

**Sim, é por API** — e ela **já existe**: `/api/portal`, com chave e
limite de requisições. Hoje entrega o catálogo; falta o resto.

### Uma decisão importante

O banco **continua no escritório**. A Hostinger hospeda só a *cara* do
portal, que pergunta tudo ao ERP.

Por quê: se o portal tivesse banco próprio, você teria duas verdades
sobre o mesmo pedido. Quando divergissem — e divergiriam —, ninguém
saberia qual valia.

**A consequência honesta:** se o escritório cair (luz, internet,
máquina), o portal fica fora do ar. Hoje o ERP inteiro já tem esse
risco. Se isso incomodar, aí sim conversamos sobre migrar o banco para
a Hostinger — mas é outro projeto, com backup e latência para pensar.

---

## 2. As telas

### Entrar

```
┌────────────────────────────┐
│   [logo VTDIGITAL]         │
│                            │
│   Seu WhatsApp             │
│   ┌──────────────────────┐ │
│   │ (21) 9____-____      │ │
│   └──────────────────────┘ │
│                            │
│   [    Receber código    ] │
│                            │
│   Não tem cadastro?        │
│   Fale com a gente         │
└────────────────────────────┘
```

**Sem senha.** O cliente digita o WhatsApp, recebe um código de 6
dígitos e entra. Senha em portal pequeno vira "esqueci minha senha"
toda semana — e você atendendo isso no balcão.

O acesso só funciona para **quem já é cliente**. Não existe
auto-cadastro por aqui: isso continua pela sua página de cadastro, que
já está pronta.

### Início

```
┌────────────────────────────┐
│  Oi, Camila 👋      [sair] │
├────────────────────────────┤
│  ⭐ 340 pontos             │
│  faltam 160 p/ R$ 25 off   │
├────────────────────────────┤
│  EM ANDAMENTO              │
│ ┌────────────────────────┐ │
│ │ PED-2026-0002          │ │
│ │ 80 adesivos redondos   │ │
│ │ ●━━━●━━━○━━━○          │ │
│ │ Em produção            │ │
│ │ previsão: sex, 29/08   │ │
│ └────────────────────────┘ │
│ ┌────────────────────────┐ │
│ │ PED-2026-0003          │ │
│ │ ●━━━●━━━●━━━○          │ │
│ │ Pronto para retirada ✅│ │
│ └────────────────────────┘ │
├────────────────────────────┤
│ [🛒 Catálogo]  [💬 Falar]  │
└────────────────────────────┘
```

### Acompanhar o pedido

```
┌────────────────────────────┐
│  ← PED-2026-0002           │
├────────────────────────────┤
│  ● Pedido confirmado       │
│  │   seg, 25/08 · 14:20    │
│  ● Arte aprovada           │
│  │   ter, 26/08 · 09:10    │
│  ● Em produção             │
│  │   agora                 │
│  ○ Acabamento              │
│  ○ Pronto                  │
│  ○ Entregue                │
├────────────────────────────┤
│  80 adesivos redondos 30mm │
│  R$ 0,2938 cada            │
│  Total      R$ 23,50       │
├────────────────────────────┤
│  Entrada paga  R$ 11,75    │
│  Falta         R$ 11,75    │
│  [    Pagar agora     ]    │
└────────────────────────────┘
```

### Tempo real — como eu faria

Você pediu **acompanhamento em tempo real**. Existem três caminhos:

| Como | Custo | Atraso |
|---|---|---|
| Recarregar a cada 30s | quase zero | até 30s |
| WebSocket | alto (conexão presa no túnel) | instantâneo |
| Push no WhatsApp | já temos | instantâneo |

**Minha recomendação:** recarregar a cada 30 segundos **enquanto a
tela estiver aberta**, mais o aviso no WhatsApp quando o pedido muda de
etapa — que você já tem funcionando.

O motivo é prático: ninguém fica olhando o portal esperando o status
mudar. A pessoa quer **ser avisada**. O WhatsApp faz isso melhor que
qualquer tela, e sem manter conexão aberta atravessando o túnel.

Se depois quisermos instantâneo de verdade, dá para evoluir sem
refazer nada.

### Meus dados

```
┌────────────────────────────┐
│  ← Meus dados              │
├────────────────────────────┤
│  Nome                      │
│  Camila Duarte Ribeiro     │
│  🔒 só a gráfica altera    │
│                            │
│  CPF                       │
│  529.982.247-25            │
│  🔒 só a gráfica altera    │
│                            │
│  E-mail                    │
│  camila@gmail.com          │
│  🔒 só a gráfica altera    │
├────────────────────────────┤
│  Telefone                  │
│  ┌──────────────────────┐  │
│  │ (21) 98842-3317      │  │
│  └──────────────────────┘  │
│                            │
│  [   Salvar alterações  ]  │
├────────────────────────────┤
│  ENDEREÇOS                 │
│  ┌──────────────────────┐  │
│  │ 🏠 Casa      principal│ │
│  │ R. Araquém, 412       │ │
│  │ Bangu — 21810-000     │ │
│  │        [editar] [🗑]  │ │
│  └──────────────────────┘  │
│  [ + Adicionar endereço ]  │
└────────────────────────────┘
```

**Travados** (só o operador muda): nome, CPF/CNPJ e e-mail.
**Livres:** telefone e endereços de entrega.

Quando o cliente tenta mudar um campo travado, aparece:

> *Para alterar o CPF, fale com a gente — é rápido.* [Pedir alteração]

O botão abre uma conversa já com o texto pronto. Do seu lado, chega
como uma tarefa no CRM.

**Endereços separados do cadastro.** Hoje o cliente tem *um* endereço.
Para entrega ele precisa de vários (casa, trabalho, o cliente dele).
Isso pede uma tabela nova, `customer_addresses`, com um marcado como
principal.

### Catálogo

Você perguntou o que aparece. Sugiro **você decidir por produto**, não
uma regra geral — cada item ganha uma chave:

| Chave | Efeito |
|---|---|
| Oculto | não aparece no portal |
| Só mostrar | aparece, sem preço: "consulte" |
| Com preço | mostra a tabela de faixas |
| Pedido direto | cliente monta e envia |

Assim os adesivos, que têm preço fechado, vão com preço; e o que
depende de arte ou negociação fica em "consulte".

**Todo pedido do portal nasce como rascunho de orçamento** — nunca
entra direto na produção. Já está escrito assim no código.

### Pontos

Regra simples, que cabe na cabeça do cliente:

```
   R$ 1,00 gasto  =  1 ponto
   500 pontos     =  R$ 25 de desconto
```

Isso é **5% de volta**. Pontos entram quando o pedido é **entregue**
(não quando é feito — senão pedido cancelado vira ponto). Validade de
12 meses.

Tudo configurável no painel: quantos pontos por real, quanto vale o
resgate, se está ligado.

### Falar com a gráfica

```
┌────────────────────────────┐
│  ← Falar com a gente       │
├────────────────────────────┤
│  Sobre qual pedido?        │
│  [ PED-2026-0002      ▾ ]  │
│                            │
│  ┌──────────────────────┐  │
│  │ Escreva aqui…        │  │
│  └──────────────────────┘  │
│  [📎 anexar]  [ Enviar ]   │
└────────────────────────────┘
```

A mensagem cai **no mesmo chat de WhatsApp que você já usa**, marcada
como vinda do portal. Você responde de um lugar só.

---

## 3. Responsividade

Você pediu, e concordo — mas vale inverter a ordem: **desenhar para o
celular primeiro** e deixar o computador ser a versão folgada.

Motivo: o cliente vai abrir isso no celular, quase sempre pelo link que
você mandou no WhatsApp. Se o desenho nascer para tela grande e for
"adaptado" depois, o resultado no celular fica sempre apertado.

| Tela | Layout |
|---|---|
| Celular | uma coluna, menu embaixo com o polegar |
| Tablet | duas colunas |
| Computador | menu lateral fixo |

---

## 4. O que precisa ser criado

| O quê | Onde |
|---|---|
| Tabela `customer_addresses` | banco |
| Tabela `loyalty_points` | banco |
| Campo "visibilidade no portal" no produto | banco |
| Código de acesso por WhatsApp | ERP |
| `/api/portal/*` — pedidos, dados, endereços, pontos | ERP |
| Chave "portal ligado/desligado" e regras de ponto | painel |
| O site do portal | Hostinger |

---

## 5. Ordem que eu proporia

**Primeiro** — endereços de entrega e visibilidade no catálogo. São
coisas que servem ao ERP mesmo sem portal: você passa a poder ter mais
de um endereço por cliente.

**Depois** — login por código e acompanhamento do pedido. É o que o
cliente mais vai usar: "meu pedido está pronto?".

**Então** — dados, endereços e catálogo com preço.

**Por último** — pontos e mensagens. São bons, mas ninguém deixa de
comprar por não ter.

---

## 6. Três coisas que eu questionaria antes de começar

**1. O portal vale o esforço agora?** Você atende por WhatsApp, e ele
já avisa o cliente quando o pedido anda. O portal ganha valor quando o
volume cresce a ponto de o WhatsApp não dar conta. Se a resposta for
"ainda não", talvez a ordem certa seja terminar o que está aberto no
ERP primeiro.

**2. Pontos criam obrigação.** Uma vez prometido, o cliente cobra. Se
um dia quiser desligar, tem que honrar o que já foi acumulado. Vale
começar com validade de 12 meses e um teto de desconto por pedido.

**3. Se o escritório cair, o portal cai junto.** Já disse acima, mas
repito porque é a única coisa aqui sem solução simples.

---

## O que eu preciso de você

1. **O rabisco está no caminho certo?** O que muda?
2. **Pontos:** 1 ponto por real e 500 = R$ 25 serve?
3. **Catálogo:** a chave por produto resolve, ou prefere uma regra só?
4. **Ordem:** concorda em começar pelos endereços, que já ajudam o ERP?
