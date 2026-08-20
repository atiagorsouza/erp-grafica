-- ──────────────────────────────────────────────────────────────────
--  Tabelas de campanha (v3.54.0) — aplicação manual
--
--    psql "$DATABASE_URL" -f scripts/migrar-campanhas.sql
--
--  Por que este arquivo existe: no deploy de 19/08 o `drizzle-kit
--  push` não criou estas tabelas (ele é interativo e, sem TTY, não
--  conclui). Resultado: /api/campanhas devolvia 500 em produção.
--
--  Tudo aqui é IF NOT EXISTS — rodar duas vezes não causa dano.
-- ──────────────────────────────────────────────────────────────────

BEGIN;

-- ── Enums ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM
    ('rascunho','enviando','pausada','concluida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE campaign_target_status AS ENUM
    ('fila','enviado','falhou','bloqueado','respondeu','pulado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Campanhas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id                serial PRIMARY KEY,
  name              text NOT NULL,
  status            campaign_status NOT NULL DEFAULT 'rascunho',
  body              text NOT NULL,
  image_data_uri    text,
  cta_label         text,
  cta_url           text,
  audience_filter   jsonb,
  daily_limit       integer NOT NULL DEFAULT 50,
  min_delay_seconds integer NOT NULL DEFAULT 8,
  max_delay_seconds integer NOT NULL DEFAULT 25,
  total_targets     integer NOT NULL DEFAULT 0,
  sent_count        integer NOT NULL DEFAULT 0,
  failed_count      integer NOT NULL DEFAULT 0,
  blocked_count     integer NOT NULL DEFAULT 0,
  replied_count     integer NOT NULL DEFAULT 0,
  paused_reason     text,
  created_by        text,
  started_at        timestamp,
  finished_at       timestamp,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);

-- ── Destinatários ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_targets (
  id          serial PRIMARY KEY,
  campaign_id integer NOT NULL REFERENCES campaigns(id)  ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_e164  text NOT NULL,
  status      campaign_target_status NOT NULL DEFAULT 'fila',
  skip_reason text,
  error       text,
  sent_at     timestamp,
  replied_at  timestamp,
  created_at  timestamp NOT NULL DEFAULT now()
);

-- Uma pessoa não recebe a mesma campanha duas vezes, nem que alguém
-- clique em "montar fila" de novo.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_targets_unique_idx
  ON campaign_targets (campaign_id, customer_id);

-- ── Consentimento de marketing no cliente ─────────────────────────
-- Separado do opt-out geral: quem aceita "seu pedido está pronto"
-- não aceitou receber promoção.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS marketing_opt_in        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at     timestamp,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_source text;

-- ── Tabelas que o serviço do WhatsApp usa ─────────────────────────
-- Normalmente criadas pelo próprio serviço, mas o chat e a audiência
-- de campanha leem delas. Sem elas, a tela fica vazia em vez de dar
-- erro — melhor garantir que existam.
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id         bigserial PRIMARY KEY,
  phone_e164 text NOT NULL,
  direcao    text NOT NULL,
  texto      text,
  wa_id      text,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_mensagens_fone_idx
  ON whatsapp_mensagens (phone_e164, criado_em DESC);

CREATE TABLE IF NOT EXISTS whatsapp_conversas (
  phone_e164      text PRIMARY KEY,
  customer_id     integer,
  etapa           text NOT NULL DEFAULT 'pedir_nome',
  ultima_msg      timestamptz NOT NULL DEFAULT now(),
  primeira_msg    timestamptz NOT NULL DEFAULT now(),
  recebidas       integer NOT NULL DEFAULT 0,
  saudou          boolean NOT NULL DEFAULT false,
  avisou_ausencia boolean NOT NULL DEFAULT false,
  assumida_por    text,
  assumida_em     timestamptz
);

-- ── Prazos por produto (v3.51.0) ──────────────────────────────────
-- Três parcelas porque o que estoura prazo quase nunca é a máquina:
-- é a arte (depende do cliente) e o acabamento (cola seca, verniz cura).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS lead_time_creation   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_production integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lead_time_finishing  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_time_serial     boolean NOT NULL DEFAULT false;

COMMIT;

-- Conferência
SELECT 'campaigns'         AS tabela, count(*) FROM campaigns
UNION ALL SELECT 'campaign_targets', count(*) FROM campaign_targets
UNION ALL SELECT 'clientes com opt-in',
       count(*) FROM customers WHERE marketing_opt_in;
