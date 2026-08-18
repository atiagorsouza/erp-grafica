# Limitação Turbopack — Painel de Controle

## Status

**Resolvido por workaround operacional na v3.0.3.**

O projeto agora força Webpack nos scripts oficiais:

```json
{
  "dev": "next dev --webpack",
  "build": "next build --webpack"
}
```

Isso evita divergências de renderização no Painel de Controle em produção.

---

## Sintoma observado

Em alguns servidores com Next.js 16 + Turbopack, o Painel de Controle (`/configuracoes`) podia renderizar menos abas do que a configuração canônica define.

Configuração correta esperada:

1. Identidade da empresa
2. Precificação & taxas
3. Numeração de documentos
4. PDV · Frente de Caixa
5. Orçamentos
6. Pedidos & OS
7. Kanban de Produção
8. Clientes & CRM
9. Calendário Comemorativo
10. Fiscal & Nota Fiscal

---

## Fonte canônica

A fonte única das abas/campos é:

```bash
config/control-panel-settings.json
```

A UI (`SettingsClient.tsx`) e o reparo de update (`scripts/ensure-settings.mjs`) leem a mesma fonte.

---

## Por que não reinstalar o servidor?

Reinstalar não resolve a causa se o build continuar usando Turbopack.

O correto é:

```bash
bash scripts/update.sh
```

O update:

- faz backup
- aplica schema
- repara settings
- repara Pedidos & OS
- remove `.next`
- gera build novo com Webpack

---

## Verificação rápida

```bash
cat VERSION
npm run build
curl -s http://127.0.0.1:3000/api/crud/settings | jq '.groups | length'
```

Esperado:

```txt
3.0.3
10
```

Sem `jq`:

```bash
curl -s http://127.0.0.1:3000/api/crud/settings | grep -o '"id":"[^"]*"' | sort -u
```

---

## Se o servidor ainda mostrar abas antigas

1. Confira se está na pasta correta:

```bash
pwd
cat VERSION
```

2. Rode update:

```bash
bash scripts/update.sh
```

3. Reinicie o processo correto:

```bash
pm2 restart printflow
# ou
sudo systemctl restart printflow
# ou
bash scripts/start.sh
```

4. Se usa PM2 e ainda persistir:

```bash
pm2 delete printflow
PORT=3000 pm2 start scripts/start.sh --name printflow
```

5. Confirme o diretório do processo:

```bash
pm2 describe printflow
# verificar cwd / script path
```

---

## Decisão técnica

Enquanto a aplicação estiver no Next.js 16.2.x, o build oficial de produção usa Webpack por previsibilidade.

Turbopack pode ser reavaliado em versões futuras, com teste específico do Painel de Controle antes de liberar.
