# Instalação — PrintFlow ERP

Guia da **primeira instalação** em servidor ou máquina local.

## 1. Pré-requisitos

- Node.js **20+** e npm
- PostgreSQL **14+** rodando e acessível
- Banco criado (ex.: `app_db`)
- Usuário com permissão de criar tabelas

Exemplo rápido de banco local:

```bash
sudo -u postgres psql -c "CREATE USER printflow WITH PASSWORD 'printflow';"
sudo -u postgres psql -c "CREATE DATABASE app_db OWNER printflow;"
```

## 2. Código

```bash
cd /opt   # ou o diretório desejado
# git clone <repo> printflow-erp
cd printflow-erp
```

## 3. Ambiente

```bash
cp .env.example .env
nano .env   # ajuste DATABASE_URL
```

Exemplo:

```env
DATABASE_URL=postgresql://printflow:printflow@127.0.0.1:5432/app_db
PORT=3000
HOSTNAME=0.0.0.0
NODE_ENV=production
```

## 4. Instalar

```bash
bash scripts/install.sh
```

O script:

1. Valida Node/npm
2. Garante `.env`
3. `npm ci` / `npm install`
4. Testa conexão PostgreSQL
5. `drizzle-kit push` (schema)
6. Roda seeds (a menos que `SKIP_SEED=1`)
7. `next build`
8. Grava `.printflow/install.json`

Sem dados demo:

```bash
SKIP_SEED=1 bash scripts/install.sh
```

## 5. Iniciar

```bash
bash scripts/start.sh
```

Verifique:

```bash
curl -s http://127.0.0.1:3000/api/health
```

## 6. Proxy reverso (opcional)

Exemplo Nginx em `deploy/nginx-printflow.conf`.

## Troubleshooting

| Sintoma | Ação |
|---------|------|
| `DATABASE_URL is required` | Confira `.env` |
| Falha no push do schema | Usuário do PG precisa criar tabelas/enums |
| Porta em uso | `PORT=3001 bash scripts/start.sh` |
| Seed falhou | Rode de novo `npm run db:seed` após corrigir o erro |

## Pós-instalação

1. Abra o sistema no navegador
2. Vá em **Painel de Controle** e ajuste dados da empresa
3. Cadastre impressoras / categorias se não usou seed
4. Configure backup do PostgreSQL no SO
