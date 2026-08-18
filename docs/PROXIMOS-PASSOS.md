# Próximos passos — depois da v3.25.0 estabilizar

Todos os módulos já passaram por auditoria. O que resta não é bug de
módulo: são lacunas de **operação**. Levantamento feito com o sistema
rodando, não por leitura de código.

---

## 🔴 1. O sistema não tem autenticação (crítico)

`src/middleware.ts` só injeta o header `x-current-path` para marcar o
menu ativo. **Não existe login, sessão ou verificação de permissão em
lugar nenhum.**

Testado agora, sem nenhuma credencial:

```
GET  /api/crud/settings                    → 200, devolve tudo
POST /api/crud/customers {op:"delete"}     → 200, inativa o cliente
POST /api/crud/settings  company_name      → 200, gravou "INVADIDO"
```

O último foi revertido em seguida. Mas o fato é: **qualquer pessoa que
alcance a porta 3000 altera o CNPJ da empresa, a chave PIX e os preços.**
E `scripts/start.sh` sobe em `0.0.0.0` — a rede inteira alcança.

Hoje isso talvez esteja contido porque só a sua máquina acessa. No
momento em que o ERP for exposto (outro computador da gráfica, acesso de
casa, celular), vira problema real. Também não há registro de **quem** fez
cada alteração — num sistema com caixa e estoque, isso importa.

**Proposta:** login com usuário e senha (hash Argon2/bcrypt), sessão em
cookie httpOnly, dois papéis — **operador** (PDV, pedidos, clientes) e
**administrador** (painel, financeiro, preços). Middleware protegendo
`/api/*` e as páginas. Coluna `created_by` nas operações sensíveis.

Escopo estimado: uma versão inteira, com migração de schema.

---

## 🔴 2. Não há backup automático

`scripts/backup-db-json.mjs` existe, mas **nada o agenda** — nem
`install.sh`, nem `deploy/`. O backup só acontece se alguém lembrar de
rodar à mão.

O banco já foi perdido **duas vezes** durante estas sessões (ambiente
reciclado). Aqui era descartável; na gráfica seria o histórico de vendas,
o contas a receber e o cadastro de clientes.

**Proposta:** `pg_dump` diário via cron, retenção de 7 dias + 4 semanais,
cópia fora do servidor. Verificação de que o dump restaura — backup que
nunca foi testado não é backup.

Escopo: pequeno. Alto retorno.

---

## 🟠 3. Emissão de NF-e

Os campos fiscais estão prontos desde a v3.21.0 — CNAE, código IBGE, CRT,
regime, IE, IM — e o grupo `fiscal` tem 7 chaves. Não há nenhuma
integração: são dados esperando um emissor.

**Não é melhoria pontual, é projeto.** Exige decidir:

1. **Provedor** — Focus NFe, NFe.io, PlugNotas, eNotas (todos têm API
   REST e cuidam do XML/SEFAZ; emitir direto contra a SEFAZ é caro demais)
2. **Certificado digital A1** da VTDIGITAL (arquivo .pfx + senha)
3. **Qual documento** — NFS-e (serviço) é o que uma gráfica costuma
   emitir; NF-e (mercadoria) se houver venda de produto pronto. Muda o
   provedor e a prefeitura envolvida
4. **Homologação antes de produção** — nota emitida errada é dor de
   cabeça com contador

Sem essas quatro definições, qualquer código que eu escrevesse seria
chute.

---

## 🟡 4. Dívidas menores

| Item | Situação |
|---|---|
| `PrintDocument.tsx` | removido daqui; vai sobrar na instalação do usuário (o `tar` não apaga). Inofensivo — `rm -f` opcional no LEIA-ME |
| Build com `SIGKILL` | falta de RAM em servidor pequeno. `NODE_OPTIONS=--max-old-space-size=2048` resolve |
| `middleware` deprecado | Next 16 avisa para migrar para `proxy`. Só um warning hoje; vira erro em versão futura |
| `company_address` | resolvido via `structuredAddress`, mas o campo legado ainda existe em `settings.ts` |

---

## Ordem sugerida

1. **Backup automático** — pequeno, e protege tudo o que já foi feito
2. **Autenticação** — antes de o ERP sair da sua máquina
3. **NF-e** — quando as quatro decisões acima estiverem tomadas

A ordem inverte se o sistema já estiver acessível a outras pessoas: aí
autenticação vem primeiro.
