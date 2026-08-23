# O que dá para fazer daqui

Escrevi isto depois de olhar o que já existe no seu banco. A conclusão
que me surpreendeu: **a maior parte do valor não é construir coisa
nova — é ligar o que já está pronto ao canal que agora funciona.**

Você tem `art_approvals`, `payment_links`, `deliveries`,
`notifications` e `commemorative_dates` no banco há versões, sem uso
prático. Cada uma delas vira algo concreto quando ganha um canal de
saída.

---

## Onde estamos

```
✔ Motor de custo fiel ao seu parque      (validado: agenda R$ 21,14 × R$ 21)
✔ PDV, orçamento, pedido, OS, kanban
✔ Estoque, financeiro, InfinitePay, SuperFrete
✔ Telefone canônico e único por cliente
✔ WhatsApp recebendo e pré-cadastrando
```

O ERP sabe **quanto custa** e **o que está acontecendo**. Agora ele
tem **como falar**. É isso que destrava o resto.

---

## Uma régua para decidir

Antes da lista, o critério que usei para ordenar. Vale mais que a
lista em si:

| Pergunta | Por quê |
|---|---|
| Isso economiza tempo **seu**, toda semana? | Automação que roda uma vez por mês não paga o esforço |
| O cliente pediu, ou eu estou supondo? | Metade das ideias boas no papel ninguém usa |
| Aumenta o risco do número? | Ban não tem recurso no Baileys |
| Funciona se eu não mexer nele? | Coisa que exige babá vira dívida |

Marquei cada item com **valor**, **esforço** e **risco**.

---

# 1 · Chat de monitoramento
### valor alto · esforço médio · risco nenhum

Ver as conversas dentro do ERP e responder por lá. O bot faz o
pré-cadastro, você assume quando quiser.

Hoje as mensagens já são gravadas — a conversa com o Tiago está no
banco. Falta a tela.

**Por que é o primeiro:** sem isso você depende do celular para
atender, e o histórico do cliente fica partido entre WhatsApp e ERP.
Com isso, quem atende vê o cadastro, os pedidos anteriores e o que já
foi conversado, tudo junto.

Inclui: lista de conversas, não lidas, busca, botão **assumir/devolver
ao bot**, e link direto para o cadastro do cliente.

---

# 2 · Avisos automáticos de pedido
### valor alto · esforço baixo · risco baixo

O `orders` já muda de status. O `deliveries` já tem
`tracking_code`. Ninguém avisa o cliente.

```
Pedido aprovado      → "Recebemos seu pedido #123. Previsão: sexta."
Entrou em produção   → "Seu material entrou na produção 🖨️"
Pronto para retirar  → "Está pronto! Pode retirar até 18h."
Saiu para entrega    → "Saiu para entrega. Código: BR123..."
```

**Por que é barato:** já existe o gatilho (mudança de status), já
existe o canal, já existe o telefone canônico. É ligar os fios.

**Por que é seguro:** transacional para quem já é cliente e já
comprou. É a categoria de menor risco que existe — a pessoa **espera**
essa mensagem.

**Impacto real:** corta a maior parte dos "e aí, tá pronto?".

---

# 3 · Aprovação de arte pelo WhatsApp
### valor muito alto · esforço médio · risco baixo

A tabela `art_approvals` existe, com `file_url`, `version`, `status`,
`client_comment`. **Está pronta e parada.**

```
bot : Segue a arte do seu banner para aprovação 🎨
      [imagem]
      Responda APROVO ou peça ajuste.
cli : aprovo
bot : Perfeito! Entrou na produção ✅
```

A aprovação grava em `art_approvals`, muda o pedido de status e move o
card no Kanban. Se pedir ajuste, o texto vira `client_comment`.

**Por que isso é grande:** aprovação de arte é onde o trabalho de
gráfica trava. Hoje é conversa solta no WhatsApp, sem registro. Depois
ninguém sabe qual versão foi aprovada nem quando. Isso vira **prova
documentada** — e é o tipo de coisa que evita retrabalho pago do seu
bolso.

---

# 4 · Cobrança e link de pagamento
### valor alto · esforço baixo · risco baixo

`payment_links` já integra a InfinitePay, com `checkout_url`,
`status`, `paid_at`. Falta entregar o link.

```
Orçamento aprovado → "Segue o link para pagamento: ..."
Pagamento aprovado → "Pagamento confirmado! Já entrou na fila 🎉"
Vencimento amanhã  → lembrete discreto, uma vez só
```

**Cuidado que eu recomendo:** cobrança em atraso é onde marketing vira
constrangimento. Sugiro **no máximo dois lembretes** e sempre com tom
neutro. Depois disso, é telefone humano.

---

# 5 · Orçamento rápido no bot
### valor alto · esforço alto · risco médio

O bot consulta o motor de preços e responde uma faixa.

```
cli : quanto custa 100 cartões?
bot : 100 cartões 9×5, couché 300g, 4×0:
      R$ 89,00 · 3 dias úteis
      Quer que eu passe para um atendente fechar?
```

**Por que "risco médio":** não é risco de ban — é risco de **preço
errado no automático**. O motor está fiel, mas gráfica tem detalhe
(acabamento, arte pronta ou não, prazo).

**Como eu faria:** o bot dá a faixa e **sempre** oferece o humano.
Nunca fecha venda sozinho. E começa por 3–5 produtos de catálogo fixo,
não pelo catálogo inteiro.

---

# 6 · Portal do cliente
### valor médio-alto · esforço alto · risco médio

Aquilo que conversamos: Hostinger + Cloudflare Tunnel. O cliente
acompanha pedido, baixa nota, aprova arte, vê histórico.

**Uma opinião franca:** depois que os itens 1–4 estiverem no ar, boa
parte do que o portal resolveria já estará resolvido **pelo WhatsApp**
— que o cliente já tem aberto o dia inteiro, sem instalar nada, sem
senha.

Não estou dizendo para abandonar. Estou dizendo para **fazer depois** e
reavaliar o escopo. Talvez o portal acabe sendo só a parte pesada
(histórico longo, notas, arquivos grandes), o que é bem menos trabalho
que o plano original.

---

# 7 · E-mail transacional
### valor médio · esforço médio · risco baixo

Nota fiscal, orçamento em PDF, comprovante. Coisas que o WhatsApp faz
mal.

**Bloqueio conhecido:** `vtdigital.com.br` está com DKIM ausente e
DMARC em `p=none`; `vtdigital.site` não tem SPF nem DMARC. Sem
arrumar, e-mail cai em spam. É meia hora de DNS.

---

# 8 · Datas comemorativas
### valor médio · esforço baixo · risco ALTO

`commemorative_dates` já está populada. A tentação é óbvia: avisar
clientes sobre Dia das Mães, Natal, volta às aulas.

**É exatamente aqui que os números pioram.** Sai da categoria "cliente
espera" e entra em "mensagem que ninguém pediu": bloqueio sobe, e
`>2%` derruba a reputação do número.

Se for fazer, com as 6 condições que já combinamos: só quem escreveu
antes, últimos 12 meses, opt-in, máximo 4 por mês, lotes de 50/dia,
disjuntor em 1% de bloqueio.

**Minha sugestão:** use `commemorative_dates` primeiro **para dentro**
— alerta no painel para você preparar estoque e arte com antecedência.
O valor está no planejamento, não no disparo.

---

# 9 · Relatórios que respondem perguntas
### valor médio · esforço baixo · risco nenhum

Você já tem os dados. Faltam as perguntas certas:

- Qual produto dá mais **lucro por hora de máquina**?
- Que clientes sumiram nos últimos 90 dias?
- Quanto de A3 chapado você fez este mês? *(lembra do prejuízo?)*
- Qual a cobertura média real dos seus trabalhos?

A última resolveria a dúvida do técnico por página que ficou em
aberto.

---

# O que eu NÃO recomendo

Por honestidade, porque são as ideias que mais aparecem:

| Ideia | Por quê não |
|---|---|
| **Bot que fecha venda sozinho** | Gráfica tem detalhe demais. Erro vira prejuízo ou cliente irritado |
| **Importar a agenda do celular** | Os 400 contatos não deram consentimento. É o caminho mais curto para o ban |
| **Vários números** | Dobra a chance de perder um e triplica a confusão |
| **IA respondendo livremente** | Sem trilho, promete prazo e preço que você não pode cumprir |
| **Automatizar cobrança pesada** | Constrangimento custa cliente. Duas lembranças e telefone |

---

# Ordem que eu sugiro

```
AGORA      1. Chat de monitoramento        ← fecha o ciclo do WhatsApp
           2. Avisos de pedido             ← barato, elimina "tá pronto?"

DEPOIS     3. Aprovação de arte            ← maior ganho operacional
           4. Cobrança e link              ← acelera o caixa

QUANDO     5. Orçamento rápido             ← começar por poucos produtos
DER        9. Relatórios                   ← barato, decide melhor

MAIS       6. Portal                       ← reavaliar escopo antes
TARDE      7. E-mail                       ← arrumar DNS primeiro
           8. Datas                        ← só com as 6 condições
```

**1 e 2 juntos** já mudam sua semana: menos interrupção, menos
"cadê meu pedido", tudo registrado.

---

# Antes de qualquer coisa nova

Três pendências pequenas que valem mais que feature:

1. **Backup automático** — `bash scripts/backup-auto.sh --instalar-cron`
   Agora o banco tem a sessão do WhatsApp e as conversas dos clientes.
   Perder isso dói bem mais do que antes.

2. **Valor-hora** em Painel → Tributação. Sem ele, todo serviço com
   hora está subestimado.

3. **Preço do A3 chapado.** A R$ 0,99 você perde 57 centavos por face.
   Nenhuma automação conserta preço errado — ela só faz vender mais
   rápido no prejuízo.

---

## Uma nota sobre o que já conquistamos

O bot funcionar não foi sorte: foi telefone canônico (3.46.6), índice
único, suporte a `@lid` (3.47.1), logs visíveis (3.47.2) e fila por
contato (3.47.3). Cada um desses foi um bug real que apareceu
testando.

Menciono isso porque a próxima etapa vai ter os mesmos tropeços — e a
forma de atravessá-los é a mesma: você testa com gente de verdade,
manda a captura, eu corrijo com teste que reproduz o caso.

Funcionou até aqui.
