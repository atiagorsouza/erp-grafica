# SPF, DKIM e DMARC — onde criar

Resposta à pergunta: **você cria no DNS do domínio, não no sistema.**

O ERP só usa o SMTP; quem decide se o e-mail chega na caixa de entrada
ou no lixo é o DNS.

> **Antes de tudo, descubra onde o DNS é gerenciado.** Você usa
> Cloudflare Tunnel para o `app.vtdigital.site`. Se o domínio de e-mail
> (`vtdigital.com.br`) também apontar para a Cloudflare, os registros
> vão **lá**, não na Hostinger. Ver a seção "Onde é meu DNS?" no fim.

---

## O caminho mais fácil

Se o domínio usa os nameservers da Hostinger, existe um botão que faz
tudo sozinho:

1. Entre no **hPanel** da Hostinger
2. **E-mails** → clique em **Caixas de correio** ao lado do domínio
3. Abra **Configurações do domínio**
4. Clique em **Conectar automaticamente**

Se esse botão funcionar, **pule o resto**. Ele cria MX, SPF, DKIM e
DMARC de uma vez.

---

## Manual — se o DNS estiver fora da Hostinger

No painel do seu provedor de DNS: **Domínios → Zona DNS → Adicionar
registro**.

### 1. SPF — diz quem pode enviar em seu nome

| Campo | Valor |
|---|---|
| Tipo | `TXT` |
| Nome | `@` (ou deixe vazio) |
| Valor | `v=spf1 include:_spf.mail.hostinger.com ~all` |

> **Só pode existir UM registro SPF no domínio.** Se já houver outro,
> não crie um segundo — junte tudo numa linha só. Dois registros SPF
> fazem o servidor de destino recusar suas mensagens.

### 2. DKIM — assina o e-mail para provar que é seu

São **três registros CNAME**:

| Tipo | Nome | Aponta para |
|---|---|---|
| `CNAME` | `hostingermail-a._domainkey` | `hostingermail-a.dkim.mail.hostinger.com` |
| `CNAME` | `hostingermail-b._domainkey` | `hostingermail-b.dkim.mail.hostinger.com` |
| `CNAME` | `hostingermail-c._domainkey` | `hostingermail-c.dkim.mail.hostinger.com` |

Três armadilhas comuns:

- Tem de ser **CNAME**, não TXT. Como TXT, a assinatura não funciona.
- No campo Nome escreva **só** `hostingermail-a._domainkey` — muitos
  painéis já acrescentam o domínio sozinhos. Se ficar
  `hostingermail-a._domainkey.vtdigital.com.br.vtdigital.com.br`, está
  errado.
- **Na Cloudflare, desligue o proxy** (a nuvenzinha laranja tem de
  ficar cinza). Com proxy ligado, o DKIM não valida.

### 3. DMARC — o que fazer quando algo falha

| Campo | Valor |
|---|---|
| Tipo | `TXT` |
| Nome | `_dmarc` |
| Valor | `v=DMARC1; p=none; rua=mailto:contato.vt@vtdigital.com.br` |

`p=none` significa "só me avise, não bloqueie nada". É o começo certo:
você recebe relatório e vê se está tudo bem antes de endurecer.

Depois de umas semanas sem problema, dá para subir para
`p=quarantine`.

---

## Conferir se funcionou

Espere algumas horas — DNS pode levar até 24 h para propagar.

**Pelo painel:** hPanel → E-mails → Caixas de correio → Configurações
do domínio. O domínio deve aparecer como conectado.

**Teste que vale mais:** mande um e-mail para `check-auth@verifier.port25.com`.
Ele responde com um relatório; você quer ver:

```
SPF check:   pass
DKIM check:  pass
DMARC check: pass
```

Alternativa mais visual: `mail-tester.com` — envie um e-mail para o
endereço que ele mostra e veja a nota (mire em 9/10 ou mais).

---

## Onde é meu DNS?

No terminal do servidor ou em qualquer computador:

```
nslookup -type=ns vtdigital.com.br
```

- Se responder `ns1.dns-parking.com` (ou parecido) → **Hostinger**
- Se responder algo com `.ns.cloudflare.com` → **Cloudflare**

Os registros vão para onde os nameservers apontam.

---

## Por que isso importa

Sem SPF e DKIM, o Gmail e o Outlook tratam sua mensagem como suspeita.
O pior não é ser barrado — é cair silenciosamente no spam. **Você acha
que enviou o orçamento, o cliente jura que não recebeu, e ninguém
descobre.**

É por isso que sugeri resolver o DNS **antes** de construir o módulo de
e-mail: sem isso, o módulo funcionaria e mesmo assim não entregaria.

---

## Observação sobre o cadastro atual

No painel, o SMTP está assim:

| Campo | Valor |
|---|---|
| Servidor | `smtp.hostinger.com` |
| Porta | `465` (SSL) |
| Responder para | `contato.vt@vtdigital.com.br` |
| **Usuário** | **vazio** |
| **E-mail comercial** | **vazio** |

**Faltam dois campos.** Sem o usuário, o envio não acontece — nem com
o DNS perfeito. Preencher em: **Painel de Controle → E-mail →
Usuário (e-mail de envio)**.

E note o domínio: o SMTP é `vtdigital.com.br`, enquanto o sistema roda
em `vtdigital.site`. **Os registros de DNS devem ir no
`vtdigital.com.br`**, que é de onde o e-mail sai.
