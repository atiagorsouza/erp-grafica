# Incidente — deploy da 3.68.3 falhou no smoke (24/08/2026)

## O que aconteceu

Deploy da v3.68.3 no servidor: build ✔ (`BUILD_ID 93REtBqBAod4`), versão
respondendo ✔, mas o `e2e:smoke` passou só **4/179 checagens** — "Faltava
DATABASE_URL". O `deploy-auto.sh` acionou o rollback automático e o
servidor voltou para a **v3.68.2** (são e servindo).

## Causa raiz (dupla)

1. **`DATABASE_URL` vivia no ambiente do pm2**, não no SSH nem num `.env`
   na raiz. O deploy roda num shell novo — sem a variável.
2. O `deploy-auto.sh` antigo, sem a variável, **"pulava o banco"
   CALADO** (linha "DATABASE_URL ausente — pulando banco"): nenhuma
   migração rodou. O smoke, que acessa o banco direto, virou 175 falhas
   vermelhas que escondiam um erro de ambiente de uma linha.

O rollback funcionou como desenhado — a perda foi só o tempo.

## Correções (v3.68.4)

| Onde | Correção |
|---|---|
| `deploy-auto.sh` | Procura `DATABASE_URL` em shell → `.env` → `pm2 jlist` (e anota no `.env` para o futuro). Não achou? **Para antes de encostar em qualquer coisa** — nunca mais "pula o banco" |
| `e2e-smoke.mjs` | Sem banco: falha NA HORA com recado de 2 linhas (não 175 checks) |
| Bloco de instalação | Exporta a variável colada do pm2 ANTES do `deploy-auto` (o script da 3.68.2 ainda no servidor não se auto-serve — a partir da 3.68.4 ele se serve) |

## Validado

- Cenário do incidente (sem shell, sem `.env`): para em 1s com recado claro ✔
- `.env` presente + shell limpo: smoke completo passa ✔
- `bash -n` ✔ · parser do `.env` (aspas e CR) ✔
