# Upgrade v3.29.1 → v3.44.0

Salto de **15 versões / 30 commits**. Este guia cobre o que muda, o que
fazer e o que conferir depois.

## ✅ É seguro

Todas as mudanças de banco são **aditivas**: 20 colunas novas e 1 tabela
nova. **Nenhuma coluna foi removida ou renomeada**, nenhum dado
existente é reescrito.

Todo campo novo tem default que reproduz o comportamento antigo — seu
cadastro atual continua calculando exatamente igual até você preencher
os campos novos.

---

## Procedimento

```bash
# 1. BACKUP — antes de qualquer coisa
bash scripts/backup.sh
#    ou, na mão:
pg_dump "$DATABASE_URL" > backup-antes-3.44.0.sql

# 2. Substituir o código
tar -xzf printflow-erp-v3.44.0.tar.gz -C /caminho/do/app

# 3. Atualizar (não faz reseed, preserva dados)
cd /caminho/do/app
bash scripts/update.sh

# 4. Conferir
curl -s localhost:3000/api/version    # deve dizer 3.44.0
npm run e2e:smoke                     # 179 checks
```

`scripts/update.sh` já faz backup, `npm install`, `drizzle-kit push` e
rebuild. Se preferir manual:

```bash
npm install
npx drizzle-kit push --force
npm run build
bash scripts/start.sh
```

---

## O que muda no banco

### Tabela nova

| Tabela | Para quê |
|---|---|
| `product_price_tiers` | faixas de preço por quantidade (50/100/250...) |

### Colunas novas

**`materials`** — embalagem de compra

| Coluna | Default | Efeito se vazio |
|---|---|---|
| `pack_name` | null | nenhum |
| `pack_quantity` | 0 | `unit_cost` continua digitado à mão |
| `pack_cost` | 0 | idem |

**`printers`**

| Coluna | Default | Efeito se vazio |
|---|---|---|
| `hourly_rate` | 0 | não cobra tempo de máquina |

**`print_formats`** — geometria do rolo térmico

| Coluna | Default | Efeito se vazio |
|---|---|---|
| `feed_mm` | 0 | usa `area_factor`, como antes |
| `columns` | 1 | rolo de coluna única |

**`products`**

| Coluna | Default | Efeito se vazio |
|---|---|---|
| `machine_minutes` | 0 | não cobra tempo |
| `base_pricing_table_id` | null | sem tabela terceirizada |
| `base_pricing_table_qty` | 1 | — |
| `base_pricing_table_pieces` | 0 | usa a referência da tabela |

**`pricing_tables`**

| Coluna | Default | Efeito se vazio |
|---|---|---|
| `sell_price` | 0 | linha não é vendável no PDV |
| `pieces_per_sheet` | 1 | uma peça por folha |
| `min_charge` | 0 | sem piso de custo |
| `min_charge_sell` | 0 | sem piso de venda |

---

## ⚠️ Três mudanças de CÁLCULO — leia antes

Estas alteram preços de produtos **já cadastrados**. São correções de
bugs, mas você vai ver números diferentes.

### 1. Formato passou a valer no modo unit (v3.31.0)

**O bug:** no modo `unit`, o select "Formato" era decorativo. Cobertura
de tinta e fator de área eram ignorados — foto 100% custava igual a
texto 5%, A3 custava igual a A4.

**O efeito:** produtos em modo unit com formato de alta cobertura ou
área maior ficam **mais caros** (e mais corretos). Numa foto 10×15 a
impressão subiu 38%.

**Confira:** produtos unit que usem formato foto ou A3.

### 2. Duas correções no motor de impressão

- **Preto no CMYK** — o toner preto marcado `mono` era excluído do
  cálculo colorido. Se o seu parque usa CMYK, marque o preto como
  `both` (o campo "Aplica-se a").
- **`fixedCostPerPage`** agora pode embutir manutenção rateada.

### 3. Tabelas de preço geram preço de verdade (v3.42.0)

Antes eram só uma planilha de consulta. Agora podem ser vendidas no PDV
e compor produtos. **Nada quebra**, mas as linhas existentes ficam com
`sell_price = 0` — ou seja, não vendáveis até você preencher.

---

## Depois de atualizar

1. **Confira `/impressoras`** — a fórmula não mudou, mas o formato agora
   pesa no modo unit.
2. **Reabra e salve** os produtos importantes: o `costSnapshot` só é
   recalculado ao salvar.
3. **Preencha o que interessar** (tudo opcional):
   - embalagem de compra nos materiais → custo unitário automático
   - `sell_price` nas tabelas → vendável no PDV
   - `hourly_rate` + `machine_minutes` → tempo de máquina em 3D/recorte

---

## Rollback

```bash
# restaura o código
tar -xzf printflow-erp-v3.29.1.tar.gz -C /caminho/do/app

# restaura o banco
psql "$DATABASE_URL" < backup-antes-3.44.0.sql
```

As colunas novas são ignoradas pela v3.29.1, então o rollback só de
código também funciona — mas o banco fica com as colunas extras
(inofensivas).

---

## Resumo das versões

| Versão | O que trouxe |
|---|---|
| 3.30.0 | auditoria do motor de impressoras |
| **3.31.0** | embalagem de compra · **fix: formato ignorado no modo unit** |
| 3.32.0 | **fix: preto fora do CMYK** · área térmica · +14 formatos |
| 3.33.0 | insumos reais da Konica |
| 3.34.0 | **faixas de preço por quantidade** · ribbons por tipo |
| 3.35.0 | faixas aplicadas no PDV e Orçamento |
| 3.36.0 | geometria do rolo térmico (`feed_mm`, `columns`) |
| 3.37.0 | PDV reprecifica ao mudar a quantidade |
| 3.38.0 | **fix: ribbon cobrado em duplicidade** |
| 3.39.0 | **tempo de máquina** (3D e recorte) · BOPP |
| 3.40.0 | preços reais do parque |
| 3.41.0 | **fix: quantidade ignorada em m²** · porta única de gravação |
| 3.42.0 | tabelas no PDV e na composição de produtos |
| 3.43.0 | medidas reais de DTF · mínimo em reais |
| 3.44.0 | peças por folha editáveis · preços 2,2× |
