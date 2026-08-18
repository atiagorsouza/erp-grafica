# PrintFlow ERP · v3.0.0

ERP + CRM para **gráfica rápida** e **papelaria personalizada**.

Módulos principais:

- PDV / Frente de caixa
- Orçamentos → Pedidos / OS
- Clientes & CRM
- Kanban de produção
- Motor de impressoras, produtos e custos
- Tabelas de preços (DTF, comunicação visual)
- Estoque & compras
- Financeiro e relatórios
- Calendário comemorativo
- Painel de controle

> **v3.0.0** — base limpa, sem motor de comunicação (WhatsApp/e-mail removidos). Foco em operação, produção e financeiro.

---

## Requisitos

| Item        | Mínimo                          |
|-------------|---------------------------------|
| Node.js     | 20+                             |
| npm         | 10+                             |
| PostgreSQL  | 14+                             |
| SO          | Linux / macOS / WSL             |

---

## Instalação (primeira vez)

```bash
# 1. Clone / copie o projeto
cd printflow-erp

# 2. Configure o banco
cp .env.example .env
# edite DATABASE_URL

# 3. Instale tudo (deps + schema + seed + build)
bash scripts/install.sh

# 4. Suba em produção
bash scripts/start.sh
```

Healthcheck:

```bash
curl -s http://127.0.0.1:3000/api/health
# → {"ok":true}
```

Instalação sem dados de demonstração:

```bash
SKIP_SEED=1 bash scripts/install.sh
```

---

## Atualização

Em uma instalação já existente:

```bash
# 1. Coloque o código novo (git pull, rsync, release tarball…)
# 2. Rode o updater (backup + deps + schema + rebuild — SEM reseed)
bash scripts/update.sh

# 3. Reinicie o processo
bash scripts/start.sh
```

O update grava backup em `.printflow/backups/` (código + `pg_dump` se disponível).

---

## Scripts úteis

| Comando                         | Descrição                                      |
|---------------------------------|------------------------------------------------|
| `bash scripts/install.sh`       | Instalação completa de produção                |
| `bash scripts/update.sh`        | Atualização segura entre versões               |
| `bash scripts/start.sh`         | Sobe o servidor Next.js em produção            |
| `npm run dev`                   | Desenvolvimento local                          |
| `npm run build`                 | Build de produção                              |
| `npm run db:push`               | Aplica schema (Drizzle)                        |
| `npm run db:seed`               | Seed principal de demonstração                 |
| `npm run db:seed:calendar`      | Datas comemorativas                            |
| `npm run db:setup`              | push + seed + calendário                       |
| `npm run typecheck`             | TypeScript sem emitir                          |
| `npm run preflight`             | Checagens de ambiente, DB, pg_dump e audit     |
| `npm run e2e:smoke`             | Teste ponta a ponta com servidor rodando       |

---

## Estrutura

```
.
├── VERSION                 # versão semântica atual
├── package.json
├── .env.example
├── scripts/
│   ├── install.sh          # primeira instalação
│   ├── update.sh           # updates
│   ├── start.sh            # produção
│   ├── seed.mjs
│   └── seed-calendar.mjs
├── docs/
│   ├── INSTALL.md
│   ├── UPDATE.md
│   └── CHANGELOG.md
├── deploy/
│   └── nginx-printflow.conf
└── src/
    ├── app/                # App Router (páginas + API)
    ├── components/
    ├── db/                 # Drizzle schema + client
    └── lib/
```

---

## Variáveis de ambiente

Veja [`.env.example`](./.env.example).

| Variável        | Obrigatória | Descrição                    |
|-----------------|-------------|------------------------------|
| `DATABASE_URL`  | sim         | Connection string PostgreSQL |
| `PORT`          | não         | Porta HTTP (padrão `3000`)   |
| `HOSTNAME`      | não         | Bind address (`0.0.0.0`)     |
| `NODE_ENV`      | não         | `production` / `development` |

---

## Versionamento

- Arquivo canônico: [`VERSION`](./VERSION)
- Changelog: [`docs/CHANGELOG.md`](./docs/CHANGELOG.md)
- Metadados locais pós-install/update: `.printflow/install.json`

Formato: **MAJOR.MINOR.PATCH** (semver).

---

## Licença / uso

Projeto privado — uso interno / sob contrato.
