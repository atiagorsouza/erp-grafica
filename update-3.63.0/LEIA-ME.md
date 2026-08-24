# VTDIGITAL ERP — atualização 3.63.0

**De:** 3.62.0 (é o que está rodando hoje) · **Para:** 3.63.0

Versão só de **correções de segurança**, saídas da varredura feita na
3.62.0. Nenhuma tela muda de aparência.

---

## O que muda

### 1. Senhas e tokens não vazam mais 🔴

O endereço `/api/crud/settings` devolvia **todos** os valores em texto
puro — só as logos eram protegidas. Como ele não pede login, bastava
abrir o endereço para ler a credencial inteira.

Hoje o token do SuperFrete está vazio, então **nada vazou**. Mas na hora
em que você preenchesse — ou quando entrasse a senha do e-mail — a
credencial ficaria exposta.

Agora `superfrete_token`, `smtp_password`, `wa_token` e
`infinitepay_api_key` aparecem como `__SET__` (só o aviso de que existe
algo gravado), igual às logos.

> **A chave PIX continua visível de propósito** — ela é pública, sai
> impressa no cupom e no orçamento.

**No dia a dia:** ao editar um campo de senha, **deixe em branco para
manter a atual** ou digite a nova. O sistema avisa se você tentar salvar
o marcador por engano.

### 2. Estoque negativo não entra mais por engano

Cadastrar material com estoque `-999` era aceito e gravado. Agora
responde *"Estoque não pode ser negativo"*.

> **Movimentação continua podendo deixar saldo negativo** — se você der
> baixa de 10 tendo 5, o saldo fica −5, que é informação real de
> inventário. O que mudou é só o **cadastro digitado à mão**.

### 3. "Erro interno" virou mensagem clara

Seis telas devolviam *erro interno do sistema* quando recebiam um código
inválido — o que enchia o log e atrapalhava o diagnóstico. Agora
respondem "id inválido", como já faziam as outras.

---

## Verificação desta versão

- Smoke: **257 de 257** (eram 245 — **12 testes novos** cobrindo
  exatamente estes três casos, para não voltarem)
- Typecheck limpo · Lint 11 (mesmo de sempre) · build gera `BUILD_ID`

---

## Como aplicar

```bash
# 1. Virar root
sudo -i
cd /www/wwwroot/erp-grafica

# 2. BACKUP (não pule)
pg_dump "$DATABASE_URL" > ~/backup-antes-3.63.0-$(date +%F-%H%M).sql
ls -lh ~/backup-antes-3.63.0-*.sql      # confira o TAMANHO

# 3. Conferir o pacote
sha256sum -c printflow-erp-v3.63.0.tar.gz.sha256      # tem que dizer OK

# 4. Aplicar — COM O CAMINHO DO PACOTE
bash deploy-auto.sh /caminho/completo/printflow-erp-v3.63.0.tar.gz

# 5. Conferir
curl -s http://127.0.0.1:3000/api/version
ls -la .next/BUILD_ID
```

Esperado: `"version"` e `"installedVersion"` ambos **3.63.0**, e
`"upToDate": true`.

Se `installedVersion` vier atrasado:

```bash
node scripts/check-version.mjs --fix
```

> ⚠️ **Passe o caminho do pacote** (passo 4). Sem ele, o script escolhe o
> arquivo mais recente **por data** — foi assim que instalou a 3.60.1 no
> lugar da 3.61.0.

---

## Se der errado

```bash
pm2 logs printflow --lines 30 --nostream
```

Sem `BUILD_ID`:

```bash
export NODE_OPTIONS="--max-old-space-size=4096"
rm -rf .next && npm install && npm run build
ls -la .next/BUILD_ID
pm2 restart printflow --update-env
```

Voltar atrás: restaure o backup do passo 2 e reinstale o pacote 3.62.0.

Tudo isso está detalhado em `MANUAL-DO-PROGRAMADOR.md`.

---

## O que ficou para depois

Da varredura, seguem em aberto (nenhum urgente):

- **Dependências com falha de segurança** (`next`, `postcss`, `sharp`).
  Deve subir **sozinho**, numa versão só para isso — mexer em versão de
  biblioteca junto com outra coisa é receita de dor de cabeça.
- **Next 16.3.1 no seu servidor vs 16.2.6 no desenvolvimento.** Vale
  travar a versão exata.
- **Data pelo relógio do navegador** em dois pontos (idade do cliente,
  "é hoje?" no chat). Só erra se o computador estiver em outro fuso.
- **Paginação de PDV, Estoque e Financeiro** — passo 5b, ainda não feito.

Detalhes em `AUDITORIA-3.62.0.md`.
