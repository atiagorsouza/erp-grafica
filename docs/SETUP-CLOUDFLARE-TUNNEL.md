# SETUP-CLOUDFLARE-TUNNEL — ERP público com segurança

> Objetivo: `https://app.vtdigital.com.br` apontando pro ERP da gráfica
> **sem abrir porta na internet**, protegido por login na borda
> (Cloudflare Access), com escapes apenas para as rotas que o CLIENTE
> precisa abrir (retorno do pagamento, webhook, cadastro).
>
> Isso destrava, na ordem: retorno do pagamento InfinitePay com
> comprovante → webhook de baixa automática → link de cadastro público
> por WhatsApp → (futuro) API do portal.

---

## Por que túnel (e não portas/roteador)

O ERP roda na gráfica, atrás de internet residencial: sem IP fixo,
frequentemente atrás de CGNAT. O `cloudflared` faz **só conexões de
SAÍDA** — o servidor chama a Cloudflare, nunca o contrário. Nada de
port forwarding, nada de IP fixo, e se a internet cair ele reconecta
sozinho.

## ⚠️ A regra de segurança desta instalação

O ERP **não tem tela de login própria** (é ferramenta interna). Exposto
pelo túnel **sem mais nada**, qualquer pessoa que descobrir a URL abre
o painel inteiro. Por isso o passo 4 (Cloudflare Access) **não é
opcional** — é o login do sistema. As únicas rotas que ficam abertas
(são as que o cliente/robô precisa alcançar):

```
/pagamento/retorno      ← comprovante após pagar (navegador do cliente)
/api/payments/webhook   ← aviso de pagamento da InfinitePay (POST)
/cadastro/*             ← formulário público de cadastro por link
```

---

## 1 · Domínio na Cloudflare (escolha um caminho)

**Caminho A — mover o `vtdigital.com.br` inteiro (DNS) pra Cloudflare**
- Cloudflare (grátis) → Add a site → `vtdigital.com.br` → plano Free
- A Cloudflare importa os registros DNS existentes (conferir os de
  **e-mail/MX com calma** — se houver e-mail no domínio, um MX perdido
  derruba o correio)
- No registro do domínio (registro.br / Hostinger), trocar os
  nameservers pelos 2 que a Cloudflare mostrar

**Caminho B — usar `vtdigital.site` (se já for seu), sem mexer no .com.br**
- Mesmo processo, mas no `.site` — o `.com.br` (site, e-mail, Hostinger)
  fica intocado
- Nesse caso o ERP fica em `app.vtdigital.site` (era o plano original
  dos docs antigos)

## 2 · Criar o túnel

1. Cloudflare Dashboard → **Zero Trust** → Networks → **Tunnels** →
   Create a tunnel → **Cloudflared** → nome: `erp-grafica`
2. Copiar o token do comando de instalação que ele mostra
3. No servidor da gráfica (como root):

```bash
# Debian/Ubuntu (aPanel é Debian na maioria dos casos):
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb
cloudflared service install <TOKEN-COPIADO>
```

4. No painel do túnel → **Public Hostname** → Add:
   - Subdomain: `app` · Domain: `vtdigital.com.br` (ou `.site`)
   - Service: `http://localhost:3000` (a porta do ERP)

5. Testar: `https://app.vtdigital.com.br` abre o ERP **de fora**
   (celular no 4G, não na rede da gráfica)

## 3 · Manter vivo

O `cloudflared` roda como serviço (`systemctl status cloudflared`).
O ERP em si continua como está (pm2). Atualização do cloudflared:
repetir o `dpkg -i` com a versão nova.

## 4 · Cloudflare Access (o login do sistema)

Em **Zero Trust → Access → Applications → Add a self-hosted app**:

- Application domain: `app.vtdigital.com.br` (todo o domínio)
- Policy "Operadores": Action **Allow** → Include → Emails →
  o e-mail do dono (+ quem mais atender)
- Login method: One-time PIN por e-mail (não precisa de mais nada)

**Bypass (rotas públicas)** — criar app self-hosted separado por rota,
com policy Action **Bypass** → Everyone, nos caminhos:

| Rota | Quem abre |
|---|---|
| `/pagamento/retorno` | navegador do cliente voltando do pagamento |
| `/api/payments/webhook` | servidor da InfinitePay (POST) |
| `/cadastro` | cliente completando cadastro pelo link do WhatsApp |

> Regra prática: cada vez que o sistema ganhar rota pública nova
> (portal, retorno, webhook), ela entra nesta lista — e **só** ela.

## 5 · Ligar no ERP

Configurações → Pagamentos:

- **InfiniteTag**: a tag (sem `$`/`@`) — pode ser já, agora
- **URL pública do app**: `https://app.vtdigital.com.br` — **só depois
  do túnel responder**; antes disso o checkout mandaria o cliente pra
  um endereço morto

Teste final (5 min): Cobranças → nova cobrança R$ 1 → pagar no PIX →
o cliente tem que **voltar sozinho** pro comprovante
(`/pagamento/retorno`) e a cobrança tem que virar **paga sozinha**
(webhook). Detalhes em `docs/SETUP-INFINITEPAY.md`.

---

## Diagnóstico rápido

| Sintoma | Causa provável |
|---|---|
| URL não abre | túnel parado (`systemctl status cloudflared`) ou hostname errado |
| Abre mas pede login | Access funcionando (bypass faltando pra rota pública específica) |
| Cliente paga e não volta | `app_base_url` vazio nas configurações do ERP |
| Paga, volta, mas "em processamento" pra sempre | webhook bloqueado no Access (conferir bypass `/api/payments/webhook`) ou URL errada |
| E-mail do domínio parou de chegar | MX não importado ao mover o DNS (caminho A) — conferir registros MX |
