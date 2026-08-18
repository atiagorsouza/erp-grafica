# Instalação limpa — PrintFlow ERP v3

Guia oficial de **primeira instalação**. Para atualizar uma instalação existente, veja
[`UPDATE.md`](./UPDATE.md).

## 1. Requisitos

| Requisito | Versão mínima | Verificação |
|---|---|---|
| Node.js | 20 LTS | `node -v` |
| npm | 10 | `npm -v` |
| PostgreSQL | 14 | `psql --version` |
| pg_dump / gzip (backup) | — | `pg_dump --version` |
| git (recomendado) | 2.30 | `git --version` |

Porta padrão: `3000` (mude com `PORT` no `.env`).

## 2. Preparar o banco

```bash
sudo -u postgres psql -c "createuser -s postgres" 2>/dev/null || true
sudo -u postgres psql -c "createdb -O postgres erp_grafica"
```

## 3. Baixar o código

```bash
git clone https://github.com/atiagorsouza/erp-grafica.git
cd erp-grafica
```

## 4. Instalar (um comando)

```bash
bash scripts/install.sh
```

O script executa **7 etapas idempotentes**:

1. **Pré-requisitos** — valida Node ≥ 20, npm e psql.
2. **Ambiente** — cria `.env` a partir de `.env.example` se não existir.
3. **Conexão** — testa o PostgreSQL antes de qualquer escrita.
4. **Dependências** — `npm ci` (lockfile) ou `npm install`.
5. **Schema** — `drizzle-kit push` cria/atualiza todas as tabelas.
6. **Dados iniciais** — catálogo (categorias, impressoras, consumíveis, formatos, materiais,
   acabamentos, serviços, produtos, tabelas de preço), parâmetros e calendário comemorativo.
   Se a base já tem dados, o seed é **ignorado** (nada é sobrescrito).
7. **Build + start + healthcheck** — build de produção, subir o processo e validar `/api/health`.

Use `bash scripts/install.sh --yes` para executar sem perguntas.

## 5. Conferir

```bash
bash scripts/healthcheck.sh          # health + versão
curl -s localhost:3000/api/version   # detalhes da build
```

Painel: **http://localhost:3000**

## Instalação alternativa (manual, passo a passo)

```bash
cp .env.example .env      # edite DATABASE_URL
npm ci
npx drizzle-kit push
node scripts/seed.mjs && node scripts/seed-calendar.mjs
npm run build
npm run start
```

## Process manager

O `install.sh` detecta automaticamente, nesta ordem: **PM2 → systemd → nohup**.

```bash
# PM2 (recomendado)
npm i -g pm2
pm2 startup && pm2 save
bash scripts/install.sh

# systemd (unit exemplo)
sudo cp deploy/erp-grafica.service /etc/systemd/system/ && sudo systemctl enable --now erp-grafica
```

## Nginx (opcional)

```nginx
server {
  server_name grafica.suaempresa.com.br;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | String de conexão PostgreSQL |
| `NODE_ENV` | não | `production` em servidor |
| `PORT` | não | Porta HTTP (padrão 3000) |
| `APP_ENV` | não | `production` bloqueia `db:reset` |

## Desinstalar

```bash
npm run backup
sudo -u postgres psql -c "dropdb erp_grafica"
rm -rf node_modules .next logs backups
```
