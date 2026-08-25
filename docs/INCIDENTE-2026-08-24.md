# INCIDENTE 2026-08-24 — perda de produtos e pedidos no servidor

> Status: **RECUPERADO** no mesmo dia, sem perda definitiva de dados.
> Este documento existe para que a causa vire regra de código, não
> memória de gente. A regra nova já está aplicada em `scripts/update.sh`
> e `scripts/instalar-base-curada.sh`.

---

## O que aconteceu (linha do tempo)

1. **Update no servidor resolveu um erro 500** — mas, durante o update,
   o `pg_dump` do backup **falhou** (binário do sistema mais antigo que
   o servidor PostgreSQL — caso já conhecido no aPanel). O `update.sh`
   de então apenas **avisava** ("fallback JSON também falhou") e
   **seguia o update sem backup restaurável nenhum**.
2. Dias depois, para consertar o carregamento, rodou-se o
   **`instalar-base-curada.sh`** — que apaga tudo, exceto clientes, e
   instala a base curada. O script **sempre faz backup completo antes**
   (`~/backup-antes-base-curada-<data>.sql`) — foi ele que salvou.
3. A carga da base curada não deixou o sistema usável (produtos 0) e,
   na tentativa de recuperar, restaurou-se do **fallback JSON pela
   metade**: voltaram 26 materiais, 4 orçamentos, 7 clientes —
   **produtos e pedidos ficaram zerados**.

## Como se recuperou

O backup pré-apagão (`backup-antes-base-curada-*.sql`) continha o
estado COMPLETO de minutos antes: 27 produtos, 4 pedidos, 4 orçamentos,
6 clientes, 56 materiais, 3 fornecedores.

Protocolo usado (modelo para o próximo incidente):

1. **Nada mais mexe no banco** até o inventário de backups.
2. Restaurar num **banco novo** (`app_db_recuperado`), sem tocar no
   banco quebrado — zero risco.
3. Conferir contagens no banco novo ANTES de trocar.
4. Trocar o `DATABASE_URL` do `.env`, rodar `migrar-banco.mjs --aplicar`
   (aditivo) e `check-version.mjs --fix`, reiniciar o app.
5. O banco quebrado fica de rede de segurança por dias, intacto.

## As duas regras que nasceram disso (já aplicadas)

### R1 — `update.sh`: sem backup restaurável, update NÃO roda
Antes: falha do `pg_dump` + falha do JSON virava `c_warn` e o update
continuava. Agora: `die` — aborta e diz onde está o log do `pg_dump`
(o motivo costuma ser versão do binário). O dump também precisa ter
nascido com conteúdo (`-s`), e o fallback JSON é **validado** (parse +
mínimo de tabelas) antes de ser aceito.

### R2 — `instalar-base-curada.sh`: não se apaga banco com backup não conferido
Antes: o `pg_dump` rodava e o script seguia para os DELETEs mesmo se o
arquivo tivesse nascido vazio. Agora: se o dump falha, **aborta antes
de apagar** (com o erro salvo em `~/.base-curada-pgdump.err`); se o
arquivo não tem a marca de um dump completo (`COPY public.customers`),
**aborta antes de apagar**.

## Fios soltos que este incidente deixou mapeados

- O servidor roda a branch `catalogo-v3.68.1`, que internamente é
  **v3.68.0** (VERSION/package.json) — cosmético, mas confunde em
  incidente (o `/api/version` reporta 3.68.0 "consistente").
- O `check-version.mjs` chama `psql` do PATH e **engole a falha** se o
  binário não existe — em servidor sem `psql` no PATH, o passo do banco
  é pulado em silêncio (a Fase B do protocolo só funcionou porque o
  PATH foi exportado antes). Corrigir: falha de banco = erro barulhento.
- Diferença de 1 cliente (7 no banco quebrado × 6 no backup): cadastro
  feito depois do backup precisaria ser re-incluído à mão.

## A restauração em números

| | banco quebrado | backup pré-apagão (restaurado) |
|---|---|---|
| produtos | 0 | **27** |
| pedidos | 0 | **4** |
| orçamentos | 4 | **4** |
| clientes | 7 | **6** |
| materiais | 26 | **56** |
