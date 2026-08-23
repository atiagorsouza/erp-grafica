# Rabisco — Módulo de E-mails

Desenho para discussão. **Nada implantado.**

---

## O que já existe hoje

| Peça | Situação |
|---|---|
| Configuração SMTP no painel | ✅ 9 campos |
| Motor de envio (`src/lib/email.ts`) | ✅ envia, valida, explica erro |
| Botão "testar conexão" | ✅ funciona |
| Tela de e-mails | ❌ não existe |
| Modelos de e-mail | ❌ não existem |
| Alguém que dispare | ❌ **ninguém** |

O motor está pronto e **só é chamado pelo botão de teste**. Nenhum
orçamento, pedido ou cobrança manda e-mail hoje.

Os modelos que temos (`mensagens.ts`) são **só de WhatsApp** e não têm
assunto — que é justamente o que um e-mail precisa.

---

## A pergunta antes do desenho

**Vale a pena agora?** Você mesmo disse que muitos clientes antigos não
têm e-mail, e o WhatsApp já resolve o aviso do dia a dia.

Onde o e-mail ganha do WhatsApp:

- **Orçamento formal com PDF anexo** — cliente PJ costuma exigir, e
  "manda por e-mail" é resposta padrão de setor de compras
- **Documento que o cliente precisa guardar** — nota, recibo
- **Prova de envio** — e-mail tem registro; WhatsApp apagado some

Onde o WhatsApp continua melhor: aviso de andamento, "está pronto",
qualquer coisa que precise de resposta rápida.

**Minha leitura:** o módulo se paga se for focado em **orçamento com
PDF para cliente PJ**. Como canal de aviso geral, não compensa.

---

## As telas

### Modelos de e-mail

Mesma lógica da tela de mensagens do WhatsApp, que você já conhece:

```
┌──────────────────────────────────────────┐
│  Modelos de e-mail                       │
├──────────────────────────────────────────┤
│  [Orçamento] [Pedido] [Cobrança] [Boas-…]│
├──────────────────────────────────────────┤
│  ASSUNTO                                 │
│  ┌────────────────────────────────────┐  │
│  │ Orçamento {numero} — {empresa}     │  │
│  └────────────────────────────────────┘  │
│                                          │
│  MENSAGEM                                │
│  ┌────────────────────────────────────┐  │
│  │ Olá, {nome}!                       │  │
│  │                                    │  │
│  │ Segue em anexo o orçamento         │  │
│  │ {numero}, no valor de {total}.     │  │
│  │                                    │  │
│  │ Validade: {validade}.              │  │
│  │                                    │  │
│  │ Qualquer dúvida, é só responder.   │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Disponíveis: {nome} {numero} {total}    │
│               {validade} {empresa}       │
│                                          │
│  [ Ver como fica ]  [ Enviar teste ]     │
│  [        Salvar modelo          ]       │
└──────────────────────────────────────────┘
```

**Tudo editável por você na tela** — nunca no código, como sempre
combinamos.

### Como o cliente recebe

```
┌──────────────────────────────────────────┐
│  ▬▬▬  VTDIGITAL ART STUDIO               │
├──────────────────────────────────────────┤
│                                          │
│  Olá, Camila!                            │
│                                          │
│  Segue em anexo o orçamento ORC-2026-    │
│  0003, no valor de R$ 53,02.             │
│                                          │
│  Validade: 07/09/2026.                   │
│                                          │
│  Qualquer dúvida, é só responder.        │
│                                          │
│  📎 orcamento-ORC-2026-0003.pdf          │
│                                          │
├──────────────────────────────────────────┤
│  VTDIGITAL ART STUDIO                    │
│  Rua Araquém, 910 — Bangu, RJ            │
│  (21) 2038-3504 · vtdigital.site         │
└──────────────────────────────────────────┘
```

Layout simples de propósito: e-mail muito enfeitado cai em promoções.
Cabeçalho com sua logo, corpo em texto, rodapé com contato.

### De onde se envia

Um botão **"Enviar por e-mail"** ao lado do de WhatsApp, nas telas de
orçamento e pedido. Mesmo fluxo que você já usa:

```
┌──────────────────────────────────────────┐
│  Enviar orçamento por e-mail             │
├──────────────────────────────────────────┤
│  Para:    camila@gmail.com               │
│  Assunto: Orçamento ORC-2026-0003 — VT…  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Olá, Camila! …                     │  │
│  │ (editável antes de enviar)         │  │
│  └────────────────────────────────────┘  │
│                                          │
│  📎 orcamento-ORC-2026-0003.pdf          │
│                                          │
│  [ Cancelar ]        [ Enviar ]          │
└──────────────────────────────────────────┘
```

**Prévia sempre editável** — igual ao WhatsApp. Você lê antes de sair.

### Histórico

Na ficha do cliente, uma aba mostrando o que foi enviado, quando e se
falhou. Serve para não mandar duas vezes e para responder "mandei sim,
dia 20".

---

## Os quatro modelos que eu criaria

| Modelo | Quando | Anexo |
|---|---|---|
| **Orçamento** | ao enviar o orçamento | PDF |
| **Pedido pronto** | quando fica pronto | — |
| **Cobrança** | saldo em aberto | link de pagamento |
| **Boas-vindas** | cadastro concluído | — |

Começaria **só pelo de orçamento**. É o que tem valor real; os outros o
WhatsApp já faz melhor.

---

## O que precisa ser criado

| O quê | Onde |
|---|---|
| Modelos com assunto (`email-modelos.ts`) | ERP |
| Tela de modelos | ERP |
| `/api/email/enviar` — com anexo | ERP |
| Botão nas telas de orçamento e pedido | ERP |
| Tabela `email_enviados` (histórico) | banco |
| Chave "e-mail ligado/desligado" | painel |

---

## Três cuidados que eu teria

**1. E-mail que cai em spam é pior que não mandar.** Você acha que
enviou, o cliente não recebeu, e ninguém descobre. Antes de ligar isso
para valer, o domínio precisa de **SPF e DKIM** configurados — senão
Gmail e Outlook mandam direto para o lixo.

**2. Nunca enviar sem o cliente ter pedido.** Vale a mesma regra do
WhatsApp: transacional (orçamento que ele pediu) é livre; marketing só
com aceite.

**3. Registrar tudo.** Envio sem registro vira discussão de "mandei" ×
"não recebi".

---

## Ordem que eu proporia

1. **Modelos + tela** — a base
2. **Envio de orçamento com PDF** — o que tem valor
3. **Histórico na ficha**
4. O resto, se fizer falta

---

## O que preciso de você

1. **Vale a pena agora**, ou fica para depois de terminar o catálogo?
2. **É só orçamento com PDF, ou quer os quatro modelos?**
3. **O domínio `vtdigital.site` tem SPF e DKIM?** Se não souber, eu
   verifico — mas sem isso o e-mail vai para spam.
4. **De qual caixa sai?** Você mencionou criar `contato@`, com o
   `noreply@` no máximo como Reply-To.
