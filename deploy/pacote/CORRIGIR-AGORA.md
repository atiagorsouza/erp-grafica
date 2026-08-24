# Consertar o servidor — materiais 0, produtos 0

## O que aconteceu

A base curada é gerada a partir do schema **novo**. O banco ainda estava
no schema **antigo**, então o primeiro comando que citou uma coluna
inexistente abortou a carga inteira — e o `psql` terminou como se
tivesse dado certo.

Depois, na tentativa de consertar, foi rodado:

```
node scripts/exportar-base-curada.mjs
```

Esse comando **lê do banco onde ele roda**. Como o servidor estava
vazio naquele momento, ele **exportou o vazio e sobrescreveu o arquivo
bom**. Foi aí que o conteúdo se perdeu de vez.

**Nada foi perdido de verdade.** O arquivo correto está nesta pasta
(349 KB, com 26 materiais e 9 produtos) e o backup do instalador
também.

> **Nunca rode `exportar-base-curada.mjs` no servidor.** Ele é para
> gerar o arquivo aqui, não para consertar lá.

---

## O conserto

Envie **todos os arquivos desta pasta** para o servidor e faça na
ordem. Uma linha de cada vez.

**1.** Entrar na pasta do sistema:

```
cd /www/wwwroot/erp-grafica
```

**2.** Aplicar o schema — cria a tabela `sellers` e as colunas que
faltam. **Não apaga nada e pode rodar mais de uma vez:**

```
psql -U postgres -d app_db -f ~/schema-update.sql
```

> Substitui o `npx drizzle-kit push --force`, que **não funciona** no
> painel: ele exige terminal interativo e falha com *"Interactive
> prompts require a TTY"*.

**3.** Limpar o cache do Next.js. **Obrigatório** — foi o que causou o
erro `column "seller_id" does not exist` mesmo depois do schema certo:

```
rm -rf .next
```

**4.** Reconstruir:

```
npm run build
```

**5.** Carregar a base (use o `base-curada.sql` **desta pasta**, não um
regenerado):

```
bash ~/instalar-base-curada.sh
```

Digite `CONFIRMO` quando pedir.

**6.** Reiniciar:

```
pm2 restart printflow
```

---

## Como saber se deu certo

O instalador mostra no fim. Tem de aparecer:

```
      clientes:    4
      produtos:    9
      materiais:   26
      impressoras: 6
      faixas:      54
      config:      124
```

Se produtos ou materiais vierem **0**, o script agora **falha e avisa**
em vez de dizer que instalou.

---

## Sobre seus 38 clientes

A base curada **substitui** os clientes pelos 4 de exemplo.

- Se os 38 forem **de teste**, pode seguir direto.
- Se forem **reais**, me avise **antes do passo 5** — gero em dois
  minutos uma versão que não toca em clientes.

---

## O que foi corrigido para não repetir

| Problema do seu log | Correção |
|---|---|
| `drizzle-kit` exige TTY | `schema-update.sql`, aplicado com `psql -f` |
| `pg_dump` v17 × Postgres v18 | o instalador procura o binário em `/www/server/pgsql/bin` |
| Colunas faltando na carga | o instalador confere o schema **antes** e se recusa a rodar |
| Cache do Next.js | `rm -rf .next` virou passo obrigatório |
| "Sucesso" com base vazia | o instalador confere **depois** e falha se vier vazio |
