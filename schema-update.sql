-- ==================================================================
-- ATUALIZAÇÃO DE SCHEMA — VTDIGITAL
-- Gerado em 2026-08-24T00:49:18.223Z
--
-- Cria o que falta. Não apaga nada, não altera tipo de coluna.
-- Pode rodar mais de uma vez sem problema.
--
--   psql -U postgres -d app_db -f schema-update.sql
-- ==================================================================

begin;

-- ── tipos ──
do $$ begin
  create type public.campaign_status as enum ('rascunho', 'enviando', 'pausada', 'concluida', 'cancelada');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.campaign_target_status as enum ('fila', 'enviado', 'falhou', 'bloqueado', 'respondeu', 'pulado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.category_module as enum ('product', 'material', 'service', 'finishing', 'pricing_table');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.color_mode as enum ('mono', 'color');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.consumable_type as enum ('mono', 'color', 'both');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.customer_status as enum ('lead', 'ativo', 'inativo', 'bloqueado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.customer_type as enum ('pf', 'pj');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.integration_type as enum ('whatsapp', 'voip', 'portal', 'email');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.measure_mode as enum ('pagina', 'etiqueta', 'grama');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_status as enum ('pendente', 'pago', 'expirado', 'cancelado', 'erro');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.pricing_table_type as enum ('dtf_uv', 'dtf_textil', 'lona', 'adesivo');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.printer_status as enum ('ativa', 'manutencao', 'inativa');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.quote_status as enum ('rascunho', 'enviado', 'aprovado', 'recusado', 'expirado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.registration_link_status as enum ('pendente', 'aberto', 'concluido', 'expirado', 'cancelado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.sale_type as enum ('produto', 'servico', 'mixto');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.service_type as enum ('proprio', 'terceirizado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.shipment_status as enum ('cotado', 'no_carrinho', 'pago', 'postado', 'em_transito', 'entregue', 'cancelado', 'erro');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.stock_movement_kind as enum ('entrada', 'saida', 'ajuste');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.stock_target as enum ('material', 'product');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.tx_status as enum ('pendente', 'pago', 'atrasado');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.tx_type as enum ('receita', 'despesa');
exception when duplicate_object then null; end $$;

-- ── tabelas ──

create table if not exists public.api_integrations (
  "id" serial,
  "name" text not null,
  "type" public.integration_type not null,
  "api_key" text,
  "endpoint" text,
  "webhook" text,
  "active" boolean default true,
  "config" jsonb,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.api_integrations add column if not exists "name" text;
alter table public.api_integrations add column if not exists "type" public.integration_type;
alter table public.api_integrations add column if not exists "api_key" text;
alter table public.api_integrations add column if not exists "endpoint" text;
alter table public.api_integrations add column if not exists "webhook" text;
alter table public.api_integrations add column if not exists "active" boolean default true;
alter table public.api_integrations add column if not exists "config" jsonb;
alter table public.api_integrations add column if not exists "created_at" timestamp default now();

create table if not exists public.art_approvals (
  "id" serial,
  "order_id" integer not null,
  "file_name" text not null,
  "file_url" text,
  "version" integer default 1,
  "status" text default 'pendente'::text not null,
  "client_comment" text,
  "internal_note" text,
  "approved_at" timestamp,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.art_approvals add column if not exists "order_id" integer;
alter table public.art_approvals add column if not exists "file_name" text;
alter table public.art_approvals add column if not exists "file_url" text;
alter table public.art_approvals add column if not exists "version" integer default 1;
alter table public.art_approvals add column if not exists "status" text default 'pendente'::text;
alter table public.art_approvals add column if not exists "client_comment" text;
alter table public.art_approvals add column if not exists "internal_note" text;
alter table public.art_approvals add column if not exists "approved_at" timestamp;
alter table public.art_approvals add column if not exists "created_at" timestamp default now();

create table if not exists public.campaign_targets (
  "id" serial,
  "campaign_id" integer not null,
  "customer_id" integer not null,
  "phone_e164" text not null,
  "status" public.campaign_target_status default 'fila'::campaign_target_status not null,
  "skip_reason" text,
  "error" text,
  "sent_at" timestamp,
  "replied_at" timestamp,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.campaign_targets add column if not exists "campaign_id" integer;
alter table public.campaign_targets add column if not exists "customer_id" integer;
alter table public.campaign_targets add column if not exists "phone_e164" text;
alter table public.campaign_targets add column if not exists "status" public.campaign_target_status default 'fila'::campaign_target_status;
alter table public.campaign_targets add column if not exists "skip_reason" text;
alter table public.campaign_targets add column if not exists "error" text;
alter table public.campaign_targets add column if not exists "sent_at" timestamp;
alter table public.campaign_targets add column if not exists "replied_at" timestamp;
alter table public.campaign_targets add column if not exists "created_at" timestamp default now();

create table if not exists public.campaigns (
  "id" serial,
  "name" text not null,
  "status" public.campaign_status default 'rascunho'::campaign_status not null,
  "body" text not null,
  "image_data_uri" text,
  "cta_label" text,
  "cta_url" text,
  "audience_filter" jsonb,
  "daily_limit" integer default 50 not null,
  "min_delay_seconds" integer default 8 not null,
  "max_delay_seconds" integer default 25 not null,
  "total_targets" integer default 0 not null,
  "sent_count" integer default 0 not null,
  "failed_count" integer default 0 not null,
  "blocked_count" integer default 0 not null,
  "replied_count" integer default 0 not null,
  "paused_reason" text,
  "created_by" text,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.campaigns add column if not exists "name" text;
alter table public.campaigns add column if not exists "status" public.campaign_status default 'rascunho'::campaign_status;
alter table public.campaigns add column if not exists "body" text;
alter table public.campaigns add column if not exists "image_data_uri" text;
alter table public.campaigns add column if not exists "cta_label" text;
alter table public.campaigns add column if not exists "cta_url" text;
alter table public.campaigns add column if not exists "audience_filter" jsonb;
alter table public.campaigns add column if not exists "daily_limit" integer default 50;
alter table public.campaigns add column if not exists "min_delay_seconds" integer default 8;
alter table public.campaigns add column if not exists "max_delay_seconds" integer default 25;
alter table public.campaigns add column if not exists "total_targets" integer default 0;
alter table public.campaigns add column if not exists "sent_count" integer default 0;
alter table public.campaigns add column if not exists "failed_count" integer default 0;
alter table public.campaigns add column if not exists "blocked_count" integer default 0;
alter table public.campaigns add column if not exists "replied_count" integer default 0;
alter table public.campaigns add column if not exists "paused_reason" text;
alter table public.campaigns add column if not exists "created_by" text;
alter table public.campaigns add column if not exists "started_at" timestamp;
alter table public.campaigns add column if not exists "finished_at" timestamp;
alter table public.campaigns add column if not exists "created_at" timestamp default now();
alter table public.campaigns add column if not exists "updated_at" timestamp default now();

create table if not exists public.cash_movements (
  "id" serial,
  "session_id" integer not null,
  "kind" text not null,
  "amount" numeric(12, 2) default '0'::numeric not null,
  "reason" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.cash_movements add column if not exists "session_id" integer;
alter table public.cash_movements add column if not exists "kind" text;
alter table public.cash_movements add column if not exists "amount" numeric(12, 2) default '0'::numeric;
alter table public.cash_movements add column if not exists "reason" text;
alter table public.cash_movements add column if not exists "created_at" timestamp default now();

create table if not exists public.cash_sessions (
  "id" serial,
  "status" text default 'aberto'::text not null,
  "operator" text,
  "opening_amount" numeric(12, 2) default '0'::numeric,
  "counted_amount" numeric(12, 2),
  "expected_amount" numeric(12, 2),
  "difference_amount" numeric(12, 2),
  "notes" text,
  "opened_at" timestamp default now() not null,
  "closed_at" timestamp,
  primary key ("id")
);
alter table public.cash_sessions add column if not exists "status" text default 'aberto'::text;
alter table public.cash_sessions add column if not exists "operator" text;
alter table public.cash_sessions add column if not exists "opening_amount" numeric(12, 2) default '0'::numeric;
alter table public.cash_sessions add column if not exists "counted_amount" numeric(12, 2);
alter table public.cash_sessions add column if not exists "expected_amount" numeric(12, 2);
alter table public.cash_sessions add column if not exists "difference_amount" numeric(12, 2);
alter table public.cash_sessions add column if not exists "notes" text;
alter table public.cash_sessions add column if not exists "opened_at" timestamp default now();
alter table public.cash_sessions add column if not exists "closed_at" timestamp;

create table if not exists public.commemorative_date_audit (
  "id" serial,
  "date_id" integer,
  "action" text not null,
  "field" text,
  "old_value" text,
  "new_value" text,
  "performed_by" text,
  "details" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.commemorative_date_audit add column if not exists "date_id" integer;
alter table public.commemorative_date_audit add column if not exists "action" text;
alter table public.commemorative_date_audit add column if not exists "field" text;
alter table public.commemorative_date_audit add column if not exists "old_value" text;
alter table public.commemorative_date_audit add column if not exists "new_value" text;
alter table public.commemorative_date_audit add column if not exists "performed_by" text;
alter table public.commemorative_date_audit add column if not exists "details" text;
alter table public.commemorative_date_audit add column if not exists "created_at" timestamp default now();

create table if not exists public.commemorative_dates (
  "id" serial,
  "title" text not null,
  "date" date default '2000-01-01'::date not null,
  "month" integer default 1 not null,
  "day" integer default 1 not null,
  "month_day" text,
  "type" text default 'data_comemorativa'::text,
  "relevance" text default 'media'::text,
  "icon" text default '📅'::text,
  "action_hint" text,
  "category" text default 'comercial'::text,
  "description" text,
  "active" boolean default true,
  "recurring" boolean default true,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.commemorative_dates add column if not exists "title" text;
alter table public.commemorative_dates add column if not exists "date" date default '2000-01-01'::date;
alter table public.commemorative_dates add column if not exists "month" integer default 1;
alter table public.commemorative_dates add column if not exists "day" integer default 1;
alter table public.commemorative_dates add column if not exists "month_day" text;
alter table public.commemorative_dates add column if not exists "type" text default 'data_comemorativa'::text;
alter table public.commemorative_dates add column if not exists "relevance" text default 'media'::text;
alter table public.commemorative_dates add column if not exists "icon" text default '📅'::text;
alter table public.commemorative_dates add column if not exists "action_hint" text;
alter table public.commemorative_dates add column if not exists "category" text default 'comercial'::text;
alter table public.commemorative_dates add column if not exists "description" text;
alter table public.commemorative_dates add column if not exists "active" boolean default true;
alter table public.commemorative_dates add column if not exists "recurring" boolean default true;
alter table public.commemorative_dates add column if not exists "created_at" timestamp default now();
alter table public.commemorative_dates add column if not exists "updated_at" timestamp default now();

create table if not exists public.crm_activities (
  "id" serial,
  "customer_id" integer,
  "lead_id" integer,
  "type" text default 'nota'::text not null,
  "title" text not null,
  "description" text,
  "due_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.crm_activities add column if not exists "customer_id" integer;
alter table public.crm_activities add column if not exists "lead_id" integer;
alter table public.crm_activities add column if not exists "type" text default 'nota'::text;
alter table public.crm_activities add column if not exists "title" text;
alter table public.crm_activities add column if not exists "description" text;
alter table public.crm_activities add column if not exists "due_at" timestamp;
alter table public.crm_activities add column if not exists "completed_at" timestamp;
alter table public.crm_activities add column if not exists "created_at" timestamp default now();

create table if not exists public.crm_leads (
  "id" serial,
  "customer_id" integer,
  "title" text not null,
  "column" text default 'novo'::text not null,
  "source" text default 'manual'::text,
  "owner" text,
  "expected_value" numeric(12, 2) default '0'::numeric,
  "probability" integer default 10,
  "next_action_at" timestamp,
  "last_contact_at" timestamp,
  "notes" text,
  "lost_reason" text,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.crm_leads add column if not exists "customer_id" integer;
alter table public.crm_leads add column if not exists "title" text;
alter table public.crm_leads add column if not exists "column" text default 'novo'::text;
alter table public.crm_leads add column if not exists "source" text default 'manual'::text;
alter table public.crm_leads add column if not exists "owner" text;
alter table public.crm_leads add column if not exists "expected_value" numeric(12, 2) default '0'::numeric;
alter table public.crm_leads add column if not exists "probability" integer default 10;
alter table public.crm_leads add column if not exists "next_action_at" timestamp;
alter table public.crm_leads add column if not exists "last_contact_at" timestamp;
alter table public.crm_leads add column if not exists "notes" text;
alter table public.crm_leads add column if not exists "lost_reason" text;
alter table public.crm_leads add column if not exists "created_at" timestamp default now();
alter table public.crm_leads add column if not exists "updated_at" timestamp default now();

create table if not exists public.customers (
  "id" serial,
  "type" public.customer_type default 'pf'::customer_type not null,
  "name" text not null,
  "trade_name" text,
  "document" text,
  "email" text,
  "phone" text,
  "whatsapp" text,
  "secondary_phone" text,
  "website" text,
  "contact_name" text,
  "contact_role" text,
  "cep" text,
  "street" text,
  "number" text,
  "complement" text,
  "district" text,
  "city" text,
  "state" text,
  "rg" text,
  "rg_issuer" text,
  "birth_date" date,
  "gender" text,
  "marital_status" text,
  "state_registration" text,
  "municipal_registration" text,
  "legal_nature" text,
  "tax_regime" text,
  "company_size" text,
  "founded_at" date,
  "origin" text,
  "whatsapp_opt_out" boolean default false not null,
  "marketing_opt_in" boolean default false not null,
  "marketing_opt_in_at" timestamp,
  "marketing_opt_in_source" text,
  "phone_e164" text,
  "status" public.customer_status default 'lead'::customer_status not null,
  "credit_limit" numeric(12, 2) default '0'::numeric,
  "tags" text,
  "notes" text,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  "document_waiver_reason" text,
  "document_waiver_at" timestamp,
  primary key ("id")
);
alter table public.customers add column if not exists "type" public.customer_type default 'pf'::customer_type;
alter table public.customers add column if not exists "name" text;
alter table public.customers add column if not exists "trade_name" text;
alter table public.customers add column if not exists "document" text;
alter table public.customers add column if not exists "email" text;
alter table public.customers add column if not exists "phone" text;
alter table public.customers add column if not exists "whatsapp" text;
alter table public.customers add column if not exists "secondary_phone" text;
alter table public.customers add column if not exists "website" text;
alter table public.customers add column if not exists "contact_name" text;
alter table public.customers add column if not exists "contact_role" text;
alter table public.customers add column if not exists "cep" text;
alter table public.customers add column if not exists "street" text;
alter table public.customers add column if not exists "number" text;
alter table public.customers add column if not exists "complement" text;
alter table public.customers add column if not exists "district" text;
alter table public.customers add column if not exists "city" text;
alter table public.customers add column if not exists "state" text;
alter table public.customers add column if not exists "rg" text;
alter table public.customers add column if not exists "rg_issuer" text;
alter table public.customers add column if not exists "birth_date" date;
alter table public.customers add column if not exists "gender" text;
alter table public.customers add column if not exists "marital_status" text;
alter table public.customers add column if not exists "state_registration" text;
alter table public.customers add column if not exists "municipal_registration" text;
alter table public.customers add column if not exists "legal_nature" text;
alter table public.customers add column if not exists "tax_regime" text;
alter table public.customers add column if not exists "company_size" text;
alter table public.customers add column if not exists "founded_at" date;
alter table public.customers add column if not exists "origin" text;
alter table public.customers add column if not exists "whatsapp_opt_out" boolean default false;
alter table public.customers add column if not exists "marketing_opt_in" boolean default false;
alter table public.customers add column if not exists "marketing_opt_in_at" timestamp;
alter table public.customers add column if not exists "marketing_opt_in_source" text;
alter table public.customers add column if not exists "phone_e164" text;
alter table public.customers add column if not exists "status" public.customer_status default 'lead'::customer_status;
alter table public.customers add column if not exists "credit_limit" numeric(12, 2) default '0'::numeric;
alter table public.customers add column if not exists "tags" text;
alter table public.customers add column if not exists "notes" text;
alter table public.customers add column if not exists "created_at" timestamp default now();
alter table public.customers add column if not exists "updated_at" timestamp default now();
alter table public.customers add column if not exists "document_waiver_reason" text;
alter table public.customers add column if not exists "document_waiver_at" timestamp;

create table if not exists public.deliveries (
  "id" serial,
  "order_id" integer,
  "customer_id" integer,
  "method" text default 'retirada'::text not null,
  "status" text default 'aguardando'::text not null,
  "scheduled_at" timestamp,
  "delivered_at" timestamp,
  "tracking_code" text,
  "recipient_name" text,
  "delivery_fee" numeric(12, 2) default '0'::numeric,
  "address_snapshot" text,
  "notes" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.deliveries add column if not exists "order_id" integer;
alter table public.deliveries add column if not exists "customer_id" integer;
alter table public.deliveries add column if not exists "method" text default 'retirada'::text;
alter table public.deliveries add column if not exists "status" text default 'aguardando'::text;
alter table public.deliveries add column if not exists "scheduled_at" timestamp;
alter table public.deliveries add column if not exists "delivered_at" timestamp;
alter table public.deliveries add column if not exists "tracking_code" text;
alter table public.deliveries add column if not exists "recipient_name" text;
alter table public.deliveries add column if not exists "delivery_fee" numeric(12, 2) default '0'::numeric;
alter table public.deliveries add column if not exists "address_snapshot" text;
alter table public.deliveries add column if not exists "notes" text;
alter table public.deliveries add column if not exists "created_at" timestamp default now();

create table if not exists public.document_counters (
  "id" serial,
  "document_type" text not null,
  "year" integer not null,
  "current" integer default 0 not null,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.document_counters add column if not exists "document_type" text;
alter table public.document_counters add column if not exists "year" integer;
alter table public.document_counters add column if not exists "current" integer default 0;
alter table public.document_counters add column if not exists "updated_at" timestamp default now();

create table if not exists public.finishing_items (
  "id" serial,
  "name" text not null,
  "category_id" integer,
  "unit" text default 'unidade'::text,
  "unit_cost" numeric(12, 4) default '0'::numeric,
  "description" text,
  "archived_at" timestamp,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.finishing_items add column if not exists "name" text;
alter table public.finishing_items add column if not exists "category_id" integer;
alter table public.finishing_items add column if not exists "unit" text default 'unidade'::text;
alter table public.finishing_items add column if not exists "unit_cost" numeric(12, 4) default '0'::numeric;
alter table public.finishing_items add column if not exists "description" text;
alter table public.finishing_items add column if not exists "archived_at" timestamp;
alter table public.finishing_items add column if not exists "created_at" timestamp default now();

create table if not exists public.item_categories (
  "id" serial,
  "module" public.category_module not null,
  "name" text not null,
  "icon" text default '📁'::text,
  "color" text default '#06b6d4'::text,
  "order" integer default 0,
  "parent_id" integer,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.item_categories add column if not exists "module" public.category_module;
alter table public.item_categories add column if not exists "name" text;
alter table public.item_categories add column if not exists "icon" text default '📁'::text;
alter table public.item_categories add column if not exists "color" text default '#06b6d4'::text;
alter table public.item_categories add column if not exists "order" integer default 0;
alter table public.item_categories add column if not exists "parent_id" integer;
alter table public.item_categories add column if not exists "created_at" timestamp default now();

create table if not exists public.kanban_cards (
  "id" serial,
  "title" text not null,
  "description" text,
  "column" text default 'backlog'::text not null,
  "customer_name" text,
  "customer_id" integer,
  "order_id" integer,
  "quote_id" integer,
  "product_id" integer,
  "order" integer default 0,
  "priority" text default 'normal'::text,
  "due_date" date,
  "estimated_value" numeric(12, 2),
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.kanban_cards add column if not exists "title" text;
alter table public.kanban_cards add column if not exists "description" text;
alter table public.kanban_cards add column if not exists "column" text default 'backlog'::text;
alter table public.kanban_cards add column if not exists "customer_name" text;
alter table public.kanban_cards add column if not exists "customer_id" integer;
alter table public.kanban_cards add column if not exists "order_id" integer;
alter table public.kanban_cards add column if not exists "quote_id" integer;
alter table public.kanban_cards add column if not exists "product_id" integer;
alter table public.kanban_cards add column if not exists "order" integer default 0;
alter table public.kanban_cards add column if not exists "priority" text default 'normal'::text;
alter table public.kanban_cards add column if not exists "due_date" date;
alter table public.kanban_cards add column if not exists "estimated_value" numeric(12, 2);
alter table public.kanban_cards add column if not exists "created_at" timestamp default now();
alter table public.kanban_cards add column if not exists "updated_at" timestamp default now();

create table if not exists public.materials (
  "id" serial,
  "name" text not null,
  "sku" text,
  "barcode" text,
  "category_id" integer,
  "unit" text default 'unidade'::text,
  "unit_cost" numeric(12, 4) default '0'::numeric,
  "pack_name" text,
  "pack_quantity" numeric(12, 3) default '0'::numeric,
  "pack_cost" numeric(12, 4) default '0'::numeric,
  "supplier" text,
  "supplier_id" integer,
  "stock" numeric(12, 3) default '0'::numeric,
  "min_stock" numeric(12, 3) default '0'::numeric,
  "notes" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.materials add column if not exists "name" text;
alter table public.materials add column if not exists "sku" text;
alter table public.materials add column if not exists "barcode" text;
alter table public.materials add column if not exists "category_id" integer;
alter table public.materials add column if not exists "unit" text default 'unidade'::text;
alter table public.materials add column if not exists "unit_cost" numeric(12, 4) default '0'::numeric;
alter table public.materials add column if not exists "pack_name" text;
alter table public.materials add column if not exists "pack_quantity" numeric(12, 3) default '0'::numeric;
alter table public.materials add column if not exists "pack_cost" numeric(12, 4) default '0'::numeric;
alter table public.materials add column if not exists "supplier" text;
alter table public.materials add column if not exists "supplier_id" integer;
alter table public.materials add column if not exists "stock" numeric(12, 3) default '0'::numeric;
alter table public.materials add column if not exists "min_stock" numeric(12, 3) default '0'::numeric;
alter table public.materials add column if not exists "notes" text;
alter table public.materials add column if not exists "created_at" timestamp default now();

create table if not exists public.message_templates (
  "id" serial,
  "slug" text not null,
  "body" text,
  "active" boolean default true not null,
  "updated_by" text,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.message_templates add column if not exists "slug" text;
alter table public.message_templates add column if not exists "body" text;
alter table public.message_templates add column if not exists "active" boolean default true;
alter table public.message_templates add column if not exists "updated_by" text;
alter table public.message_templates add column if not exists "updated_at" timestamp default now();

create table if not exists public.notifications (
  "id" serial,
  "type" text default 'info'::text not null,
  "title" text not null,
  "body" text,
  "href" text,
  "read_at" timestamp,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.notifications add column if not exists "type" text default 'info'::text;
alter table public.notifications add column if not exists "title" text;
alter table public.notifications add column if not exists "body" text;
alter table public.notifications add column if not exists "href" text;
alter table public.notifications add column if not exists "read_at" timestamp;
alter table public.notifications add column if not exists "created_at" timestamp default now();

create table if not exists public.orders (
  "id" serial,
  "number" text not null,
  "quote_id" integer,
  "customer_id" integer,
  "status" text default 'aberto'::text not null,
  "production_status" text default 'aguardando'::text not null,
  "art_status" text default 'nao_enviada'::text not null,
  "delivery_status" text default 'a_definir'::text not null,
  "financial_status" text default 'pago'::text not null,
  "priority" text default 'normal'::text,
  "due_date" date,
  "items" jsonb not null,
  "subtotal" numeric(12, 4) default '0'::numeric,
  "discount" numeric(12, 4) default '0'::numeric,
  "taxes" numeric(12, 4) default '0'::numeric,
  "shipping_fee" numeric(12, 4) default '0'::numeric,
  "total" numeric(12, 4) default '0'::numeric,
  "payment_method" text,
  "deposit_amount" numeric(12, 2) default '0'::numeric not null,
  "deposit_paid_at" timestamp,
  "deposit_method" text,
  "balance_amount" numeric(12, 2) default '0'::numeric not null,
  "balance_paid_at" timestamp,
  "balance_method" text,
  "channel" text default 'Atendimento'::text,
  "seller_name" text,
  "notes" text,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  "seller_id" integer,
  primary key ("id")
);
alter table public.orders add column if not exists "number" text;
alter table public.orders add column if not exists "quote_id" integer;
alter table public.orders add column if not exists "customer_id" integer;
alter table public.orders add column if not exists "status" text default 'aberto'::text;
alter table public.orders add column if not exists "production_status" text default 'aguardando'::text;
alter table public.orders add column if not exists "art_status" text default 'nao_enviada'::text;
alter table public.orders add column if not exists "delivery_status" text default 'a_definir'::text;
alter table public.orders add column if not exists "financial_status" text default 'pago'::text;
alter table public.orders add column if not exists "priority" text default 'normal'::text;
alter table public.orders add column if not exists "due_date" date;
alter table public.orders add column if not exists "items" jsonb;
alter table public.orders add column if not exists "subtotal" numeric(12, 4) default '0'::numeric;
alter table public.orders add column if not exists "discount" numeric(12, 4) default '0'::numeric;
alter table public.orders add column if not exists "taxes" numeric(12, 4) default '0'::numeric;
alter table public.orders add column if not exists "shipping_fee" numeric(12, 4) default '0'::numeric;
alter table public.orders add column if not exists "total" numeric(12, 4) default '0'::numeric;
alter table public.orders add column if not exists "payment_method" text;
alter table public.orders add column if not exists "deposit_amount" numeric(12, 2) default '0'::numeric;
alter table public.orders add column if not exists "deposit_paid_at" timestamp;
alter table public.orders add column if not exists "deposit_method" text;
alter table public.orders add column if not exists "balance_amount" numeric(12, 2) default '0'::numeric;
alter table public.orders add column if not exists "balance_paid_at" timestamp;
alter table public.orders add column if not exists "balance_method" text;
alter table public.orders add column if not exists "channel" text default 'Atendimento'::text;
alter table public.orders add column if not exists "seller_name" text;
alter table public.orders add column if not exists "notes" text;
alter table public.orders add column if not exists "created_at" timestamp default now();
alter table public.orders add column if not exists "updated_at" timestamp default now();
alter table public.orders add column if not exists "seller_id" integer;

create table if not exists public.payment_links (
  "id" serial,
  "order_nsu" text not null,
  "order_id" integer,
  "sale_id" integer,
  "quote_id" integer,
  "customer_id" integer,
  "transaction_id" integer,
  "status" public.payment_status default 'pendente'::payment_status not null,
  "description" text not null,
  "amount" numeric(12, 2) default '0'::numeric not null,
  "paid_amount" numeric(12, 2),
  "checkout_url" text,
  "handle" text,
  "invoice_slug" text,
  "transaction_nsu" text,
  "capture_method" text,
  "installments" integer,
  "receipt_url" text,
  "items" jsonb,
  "paid_at" timestamp,
  "expires_at" timestamp,
  "passed_fee" numeric(12, 2) default '0'::numeric,
  "provider_fee" numeric(12, 2) default '0'::numeric,
  "confirmed_by" text,
  "webhook_received_at" timestamp,
  "check_attempts" integer default 0 not null,
  "payload" jsonb,
  "last_error" text,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.payment_links add column if not exists "order_nsu" text;
alter table public.payment_links add column if not exists "order_id" integer;
alter table public.payment_links add column if not exists "sale_id" integer;
alter table public.payment_links add column if not exists "quote_id" integer;
alter table public.payment_links add column if not exists "customer_id" integer;
alter table public.payment_links add column if not exists "transaction_id" integer;
alter table public.payment_links add column if not exists "status" public.payment_status default 'pendente'::payment_status;
alter table public.payment_links add column if not exists "description" text;
alter table public.payment_links add column if not exists "amount" numeric(12, 2) default '0'::numeric;
alter table public.payment_links add column if not exists "paid_amount" numeric(12, 2);
alter table public.payment_links add column if not exists "checkout_url" text;
alter table public.payment_links add column if not exists "handle" text;
alter table public.payment_links add column if not exists "invoice_slug" text;
alter table public.payment_links add column if not exists "transaction_nsu" text;
alter table public.payment_links add column if not exists "capture_method" text;
alter table public.payment_links add column if not exists "installments" integer;
alter table public.payment_links add column if not exists "receipt_url" text;
alter table public.payment_links add column if not exists "items" jsonb;
alter table public.payment_links add column if not exists "paid_at" timestamp;
alter table public.payment_links add column if not exists "expires_at" timestamp;
alter table public.payment_links add column if not exists "passed_fee" numeric(12, 2) default '0'::numeric;
alter table public.payment_links add column if not exists "provider_fee" numeric(12, 2) default '0'::numeric;
alter table public.payment_links add column if not exists "confirmed_by" text;
alter table public.payment_links add column if not exists "webhook_received_at" timestamp;
alter table public.payment_links add column if not exists "check_attempts" integer default 0;
alter table public.payment_links add column if not exists "payload" jsonb;
alter table public.payment_links add column if not exists "last_error" text;
alter table public.payment_links add column if not exists "created_at" timestamp default now();
alter table public.payment_links add column if not exists "updated_at" timestamp default now();

create table if not exists public.pricing_tables (
  "id" serial,
  "type" public.pricing_table_type not null,
  "category_id" integer,
  "label" text not null,
  "unit_cost" numeric(12, 4) default '0'::numeric,
  "sell_price" numeric(12, 4) default '0'::numeric,
  "unit" text default 'unidade'::text,
  "width_cm" numeric(8, 2),
  "height_cm" numeric(8, 2),
  "min_qty" numeric(10, 3) default '1'::numeric,
  "pieces_per_sheet" numeric(10, 3) default '1'::numeric,
  "min_charge" numeric(12, 4) default '0'::numeric,
  "min_charge_sell" numeric(12, 4) default '0'::numeric,
  "notes" text,
  "active" boolean default true,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.pricing_tables add column if not exists "type" public.pricing_table_type;
alter table public.pricing_tables add column if not exists "category_id" integer;
alter table public.pricing_tables add column if not exists "label" text;
alter table public.pricing_tables add column if not exists "unit_cost" numeric(12, 4) default '0'::numeric;
alter table public.pricing_tables add column if not exists "sell_price" numeric(12, 4) default '0'::numeric;
alter table public.pricing_tables add column if not exists "unit" text default 'unidade'::text;
alter table public.pricing_tables add column if not exists "width_cm" numeric(8, 2);
alter table public.pricing_tables add column if not exists "height_cm" numeric(8, 2);
alter table public.pricing_tables add column if not exists "min_qty" numeric(10, 3) default '1'::numeric;
alter table public.pricing_tables add column if not exists "pieces_per_sheet" numeric(10, 3) default '1'::numeric;
alter table public.pricing_tables add column if not exists "min_charge" numeric(12, 4) default '0'::numeric;
alter table public.pricing_tables add column if not exists "min_charge_sell" numeric(12, 4) default '0'::numeric;
alter table public.pricing_tables add column if not exists "notes" text;
alter table public.pricing_tables add column if not exists "active" boolean default true;
alter table public.pricing_tables add column if not exists "created_at" timestamp default now();

create table if not exists public.print_formats (
  "id" serial,
  "category_id" integer,
  "name" text not null,
  "width_mm" numeric(8, 2) default '210'::numeric,
  "height_mm" numeric(8, 2) default '297'::numeric,
  "area_factor" numeric(8, 4) default '1'::numeric,
  "ink_coverage" numeric(6, 4) default 0.05,
  "print_cost_override" numeric(12, 4) default '0'::numeric,
  "is_photo" boolean default false,
  "feed_mm" numeric(8, 2) default '0'::numeric,
  "columns" integer default 1,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.print_formats add column if not exists "category_id" integer;
alter table public.print_formats add column if not exists "name" text;
alter table public.print_formats add column if not exists "width_mm" numeric(8, 2) default '210'::numeric;
alter table public.print_formats add column if not exists "height_mm" numeric(8, 2) default '297'::numeric;
alter table public.print_formats add column if not exists "area_factor" numeric(8, 4) default '1'::numeric;
alter table public.print_formats add column if not exists "ink_coverage" numeric(6, 4) default 0.05;
alter table public.print_formats add column if not exists "print_cost_override" numeric(12, 4) default '0'::numeric;
alter table public.print_formats add column if not exists "is_photo" boolean default false;
alter table public.print_formats add column if not exists "feed_mm" numeric(8, 2) default '0'::numeric;
alter table public.print_formats add column if not exists "columns" integer default 1;
alter table public.print_formats add column if not exists "created_at" timestamp default now();

create table if not exists public.printer_categories (
  "id" serial,
  "name" text not null,
  "slug" text not null,
  "description" text,
  "icon" text default '🖨️'::text,
  "fixed_cost_per_page" numeric(12, 6) default '0'::numeric,
  "waste_factor" numeric(6, 4) default '0'::numeric,
  "default_margin" numeric(6, 4) default 0.4,
  "color" text default '#06b6d4'::text,
  "measure_mode" text default 'pagina'::text,
  "unit_label" text default 'folha'::text,
  "reference_coverage" numeric(6, 4) default 0.05,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.printer_categories add column if not exists "name" text;
alter table public.printer_categories add column if not exists "slug" text;
alter table public.printer_categories add column if not exists "description" text;
alter table public.printer_categories add column if not exists "icon" text default '🖨️'::text;
alter table public.printer_categories add column if not exists "fixed_cost_per_page" numeric(12, 6) default '0'::numeric;
alter table public.printer_categories add column if not exists "waste_factor" numeric(6, 4) default '0'::numeric;
alter table public.printer_categories add column if not exists "default_margin" numeric(6, 4) default 0.4;
alter table public.printer_categories add column if not exists "color" text default '#06b6d4'::text;
alter table public.printer_categories add column if not exists "measure_mode" text default 'pagina'::text;
alter table public.printer_categories add column if not exists "unit_label" text default 'folha'::text;
alter table public.printer_categories add column if not exists "reference_coverage" numeric(6, 4) default 0.05;
alter table public.printer_categories add column if not exists "created_at" timestamp default now();

create table if not exists public.printer_consumables (
  "id" serial,
  "category_id" integer not null,
  "name" text not null,
  "unit_cost" numeric(12, 4) default '0'::numeric,
  "yield_pages" integer default 0,
  "applies_to" public.consumable_type default 'both'::consumable_type,
  "cost_role" text default 'colorant'::text,
  "notes" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.printer_consumables add column if not exists "category_id" integer;
alter table public.printer_consumables add column if not exists "name" text;
alter table public.printer_consumables add column if not exists "unit_cost" numeric(12, 4) default '0'::numeric;
alter table public.printer_consumables add column if not exists "yield_pages" integer default 0;
alter table public.printer_consumables add column if not exists "applies_to" public.consumable_type default 'both'::consumable_type;
alter table public.printer_consumables add column if not exists "cost_role" text default 'colorant'::text;
alter table public.printer_consumables add column if not exists "notes" text;
alter table public.printer_consumables add column if not exists "created_at" timestamp default now();

create table if not exists public.printers (
  "id" serial,
  "category_id" integer not null,
  "name" text not null,
  "brand" text,
  "model" text,
  "status" public.printer_status default 'ativa'::printer_status not null,
  "cost_multiplier" numeric(6, 4) default '1'::numeric,
  "max_format" text default 'A4'::text,
  "build_volume" text,
  "hourly_rate" numeric(12, 4) default '0'::numeric,
  "notes" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.printers add column if not exists "category_id" integer;
alter table public.printers add column if not exists "name" text;
alter table public.printers add column if not exists "brand" text;
alter table public.printers add column if not exists "model" text;
alter table public.printers add column if not exists "status" public.printer_status default 'ativa'::printer_status;
alter table public.printers add column if not exists "cost_multiplier" numeric(6, 4) default '1'::numeric;
alter table public.printers add column if not exists "max_format" text default 'A4'::text;
alter table public.printers add column if not exists "build_volume" text;
alter table public.printers add column if not exists "hourly_rate" numeric(12, 4) default '0'::numeric;
alter table public.printers add column if not exists "notes" text;
alter table public.printers add column if not exists "created_at" timestamp default now();

create table if not exists public.product_finishings (
  "id" serial,
  "product_id" integer not null,
  "finishing_id" integer not null,
  "quantity" numeric(10, 3) default '1'::numeric,
  "charge_mode" text default 'per_piece'::text,
  "batch_size" numeric(10, 3) default '1'::numeric,
  primary key ("id")
);
alter table public.product_finishings add column if not exists "product_id" integer;
alter table public.product_finishings add column if not exists "finishing_id" integer;
alter table public.product_finishings add column if not exists "quantity" numeric(10, 3) default '1'::numeric;
alter table public.product_finishings add column if not exists "charge_mode" text default 'per_piece'::text;
alter table public.product_finishings add column if not exists "batch_size" numeric(10, 3) default '1'::numeric;

create table if not exists public.product_materials (
  "id" serial,
  "product_id" integer not null,
  "material_id" integer not null,
  "quantity" numeric(10, 3) default '1'::numeric,
  primary key ("id")
);
alter table public.product_materials add column if not exists "product_id" integer;
alter table public.product_materials add column if not exists "material_id" integer;
alter table public.product_materials add column if not exists "quantity" numeric(10, 3) default '1'::numeric;

create table if not exists public.product_price_tiers (
  "id" serial,
  "product_id" integer not null,
  "min_quantity" numeric(12, 3) not null,
  "unit_price" numeric(12, 4) not null,
  "label" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.product_price_tiers add column if not exists "product_id" integer;
alter table public.product_price_tiers add column if not exists "min_quantity" numeric(12, 3);
alter table public.product_price_tiers add column if not exists "unit_price" numeric(12, 4);
alter table public.product_price_tiers add column if not exists "label" text;
alter table public.product_price_tiers add column if not exists "created_at" timestamp default now();

create table if not exists public.production_schedules (
  "id" serial,
  "order_id" integer,
  "printer_id" integer,
  "title" text not null,
  "scheduled_date" date not null,
  "start_time" text default '08:00'::text,
  "estimated_minutes" integer default 30,
  "status" text default 'planejado'::text not null,
  "notes" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.production_schedules add column if not exists "order_id" integer;
alter table public.production_schedules add column if not exists "printer_id" integer;
alter table public.production_schedules add column if not exists "title" text;
alter table public.production_schedules add column if not exists "scheduled_date" date;
alter table public.production_schedules add column if not exists "start_time" text default '08:00'::text;
alter table public.production_schedules add column if not exists "estimated_minutes" integer default 30;
alter table public.production_schedules add column if not exists "status" text default 'planejado'::text;
alter table public.production_schedules add column if not exists "notes" text;
alter table public.production_schedules add column if not exists "created_at" timestamp default now();

create table if not exists public.products (
  "id" serial,
  "name" text not null,
  "sku" text,
  "barcode" text,
  "description" text,
  "product_category_id" integer,
  "printer_id" integer,
  "printer_category_id" integer,
  "print_format_id" integer,
  "color_mode" public.color_mode default 'mono'::color_mode,
  "pages_per_unit" numeric(10, 3) default '1'::numeric,
  "copies" numeric(10, 3) default '1'::numeric,
  "base_material_id" integer,
  "base_material_qty" numeric(10, 3) default '1'::numeric,
  "base_service_id" integer,
  "base_pricing_table_id" integer,
  "base_pricing_table_qty" numeric(10, 3) default '1'::numeric,
  "base_pricing_table_pieces" numeric(10, 3) default '0'::numeric,
  "calculation_mode" text default 'unit'::text not null,
  "default_quantity" numeric(12, 3) default '1'::numeric,
  "pieces_per_sheet" numeric(12, 3) default '1'::numeric,
  "print_sides" integer default 1,
  "machine_minutes" numeric(10, 2) default '0'::numeric,
  "lead_time_creation" integer default 0 not null,
  "lead_time_production" integer default 1 not null,
  "lead_time_finishing" integer default 0 not null,
  "lead_time_serial" boolean default false not null,
  "waste_percent" numeric(6, 4) default '0'::numeric,
  "setup_sheets" integer default 0,
  "min_order_qty" numeric(12, 3) default '1'::numeric,
  "sale_unit_label" text,
  "sale_unit_pieces" numeric(12, 3),
  "operational_rate" numeric(6, 4) default '0'::numeric,
  "rounding_step" numeric(10, 2) default 0.01,
  "margin" numeric(6, 4) default 0.4,
  "cost_snapshot" numeric(12, 4) default '0'::numeric,
  "sell_price" numeric(12, 4) default '0'::numeric,
  "final_price" numeric(12, 4) default '0'::numeric,
  "active" boolean default true,
  "breakdown" jsonb,
  "track_stock" boolean default false,
  "stock" numeric(12, 3) default '0'::numeric,
  "min_stock" numeric(12, 3) default '0'::numeric,
  "ship_weight" numeric(10, 3) default '0'::numeric,
  "ship_height" numeric(10, 2) default '0'::numeric,
  "ship_width" numeric(10, 2) default '0'::numeric,
  "ship_length" numeric(10, 2) default '0'::numeric,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.products add column if not exists "name" text;
alter table public.products add column if not exists "sku" text;
alter table public.products add column if not exists "barcode" text;
alter table public.products add column if not exists "description" text;
alter table public.products add column if not exists "product_category_id" integer;
alter table public.products add column if not exists "printer_id" integer;
alter table public.products add column if not exists "printer_category_id" integer;
alter table public.products add column if not exists "print_format_id" integer;
alter table public.products add column if not exists "color_mode" public.color_mode default 'mono'::color_mode;
alter table public.products add column if not exists "pages_per_unit" numeric(10, 3) default '1'::numeric;
alter table public.products add column if not exists "copies" numeric(10, 3) default '1'::numeric;
alter table public.products add column if not exists "base_material_id" integer;
alter table public.products add column if not exists "base_material_qty" numeric(10, 3) default '1'::numeric;
alter table public.products add column if not exists "base_service_id" integer;
alter table public.products add column if not exists "base_pricing_table_id" integer;
alter table public.products add column if not exists "base_pricing_table_qty" numeric(10, 3) default '1'::numeric;
alter table public.products add column if not exists "base_pricing_table_pieces" numeric(10, 3) default '0'::numeric;
alter table public.products add column if not exists "calculation_mode" text default 'unit'::text;
alter table public.products add column if not exists "default_quantity" numeric(12, 3) default '1'::numeric;
alter table public.products add column if not exists "pieces_per_sheet" numeric(12, 3) default '1'::numeric;
alter table public.products add column if not exists "print_sides" integer default 1;
alter table public.products add column if not exists "machine_minutes" numeric(10, 2) default '0'::numeric;
alter table public.products add column if not exists "lead_time_creation" integer default 0;
alter table public.products add column if not exists "lead_time_production" integer default 1;
alter table public.products add column if not exists "lead_time_finishing" integer default 0;
alter table public.products add column if not exists "lead_time_serial" boolean default false;
alter table public.products add column if not exists "waste_percent" numeric(6, 4) default '0'::numeric;
alter table public.products add column if not exists "setup_sheets" integer default 0;
alter table public.products add column if not exists "min_order_qty" numeric(12, 3) default '1'::numeric;
alter table public.products add column if not exists "sale_unit_label" text;
alter table public.products add column if not exists "sale_unit_pieces" numeric(12, 3);
alter table public.products add column if not exists "operational_rate" numeric(6, 4) default '0'::numeric;
alter table public.products add column if not exists "rounding_step" numeric(10, 2) default 0.01;
alter table public.products add column if not exists "margin" numeric(6, 4) default 0.4;
alter table public.products add column if not exists "cost_snapshot" numeric(12, 4) default '0'::numeric;
alter table public.products add column if not exists "sell_price" numeric(12, 4) default '0'::numeric;
alter table public.products add column if not exists "final_price" numeric(12, 4) default '0'::numeric;
alter table public.products add column if not exists "active" boolean default true;
alter table public.products add column if not exists "breakdown" jsonb;
alter table public.products add column if not exists "track_stock" boolean default false;
alter table public.products add column if not exists "stock" numeric(12, 3) default '0'::numeric;
alter table public.products add column if not exists "min_stock" numeric(12, 3) default '0'::numeric;
alter table public.products add column if not exists "ship_weight" numeric(10, 3) default '0'::numeric;
alter table public.products add column if not exists "ship_height" numeric(10, 2) default '0'::numeric;
alter table public.products add column if not exists "ship_width" numeric(10, 2) default '0'::numeric;
alter table public.products add column if not exists "ship_length" numeric(10, 2) default '0'::numeric;
alter table public.products add column if not exists "created_at" timestamp default now();

create table if not exists public.purchases (
  "id" serial,
  "number" text not null,
  "supplier_id" integer,
  "status" text default 'rascunho'::text not null,
  "items" jsonb not null,
  "subtotal" numeric(12, 4) default '0'::numeric,
  "freight" numeric(12, 4) default '0'::numeric,
  "discount" numeric(12, 4) default '0'::numeric,
  "total" numeric(12, 4) default '0'::numeric,
  "expected_date" date,
  "received_at" timestamp,
  "notes" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.purchases add column if not exists "number" text;
alter table public.purchases add column if not exists "supplier_id" integer;
alter table public.purchases add column if not exists "status" text default 'rascunho'::text;
alter table public.purchases add column if not exists "items" jsonb;
alter table public.purchases add column if not exists "subtotal" numeric(12, 4) default '0'::numeric;
alter table public.purchases add column if not exists "freight" numeric(12, 4) default '0'::numeric;
alter table public.purchases add column if not exists "discount" numeric(12, 4) default '0'::numeric;
alter table public.purchases add column if not exists "total" numeric(12, 4) default '0'::numeric;
alter table public.purchases add column if not exists "expected_date" date;
alter table public.purchases add column if not exists "received_at" timestamp;
alter table public.purchases add column if not exists "notes" text;
alter table public.purchases add column if not exists "created_at" timestamp default now();

create table if not exists public.quote_items (
  "id" serial,
  "quote_id" integer not null,
  "description" text not null,
  "product_id" integer,
  "service_id" integer,
  "quantity" numeric(10, 3) default '1'::numeric,
  "unit_price" numeric(12, 4) default '0'::numeric,
  "total" numeric(12, 4) default '0'::numeric,
  primary key ("id")
);
alter table public.quote_items add column if not exists "quote_id" integer;
alter table public.quote_items add column if not exists "description" text;
alter table public.quote_items add column if not exists "product_id" integer;
alter table public.quote_items add column if not exists "service_id" integer;
alter table public.quote_items add column if not exists "quantity" numeric(10, 3) default '1'::numeric;
alter table public.quote_items add column if not exists "unit_price" numeric(12, 4) default '0'::numeric;
alter table public.quote_items add column if not exists "total" numeric(12, 4) default '0'::numeric;

create table if not exists public.quotes (
  "id" serial,
  "number" text not null,
  "customer_id" integer,
  "status" public.quote_status default 'rascunho'::quote_status not null,
  "valid_until" date,
  "subtotal" numeric(12, 4) default '0'::numeric,
  "discount" numeric(12, 4) default '0'::numeric,
  "taxes" numeric(12, 4) default '0'::numeric,
  "shipping_fee" numeric(12, 4) default '0'::numeric,
  "total" numeric(12, 4) default '0'::numeric,
  "payment_method" text,
  "channel" text default 'Atendimento'::text,
  "seller_name" text,
  "notes" text,
  "created_at" timestamp default now() not null,
  "seller_id" integer,
  primary key ("id")
);
alter table public.quotes add column if not exists "number" text;
alter table public.quotes add column if not exists "customer_id" integer;
alter table public.quotes add column if not exists "status" public.quote_status default 'rascunho'::quote_status;
alter table public.quotes add column if not exists "valid_until" date;
alter table public.quotes add column if not exists "subtotal" numeric(12, 4) default '0'::numeric;
alter table public.quotes add column if not exists "discount" numeric(12, 4) default '0'::numeric;
alter table public.quotes add column if not exists "taxes" numeric(12, 4) default '0'::numeric;
alter table public.quotes add column if not exists "shipping_fee" numeric(12, 4) default '0'::numeric;
alter table public.quotes add column if not exists "total" numeric(12, 4) default '0'::numeric;
alter table public.quotes add column if not exists "payment_method" text;
alter table public.quotes add column if not exists "channel" text default 'Atendimento'::text;
alter table public.quotes add column if not exists "seller_name" text;
alter table public.quotes add column if not exists "notes" text;
alter table public.quotes add column if not exists "created_at" timestamp default now();
alter table public.quotes add column if not exists "seller_id" integer;

create table if not exists public.registration_links (
  "id" serial,
  "token" text not null,
  "customer_id" integer not null,
  "status" public.registration_link_status default 'pendente'::registration_link_status not null,
  "snapshot_name" text,
  "snapshot_phone" text,
  "created_by" text,
  "sent_via" text,
  "sent_at" timestamp,
  "expires_at" timestamp not null,
  "opened_at" timestamp,
  "completed_at" timestamp,
  "ip" text,
  "user_agent" text,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.registration_links add column if not exists "token" text;
alter table public.registration_links add column if not exists "customer_id" integer;
alter table public.registration_links add column if not exists "status" public.registration_link_status default 'pendente'::registration_link_status;
alter table public.registration_links add column if not exists "snapshot_name" text;
alter table public.registration_links add column if not exists "snapshot_phone" text;
alter table public.registration_links add column if not exists "created_by" text;
alter table public.registration_links add column if not exists "sent_via" text;
alter table public.registration_links add column if not exists "sent_at" timestamp;
alter table public.registration_links add column if not exists "expires_at" timestamp;
alter table public.registration_links add column if not exists "opened_at" timestamp;
alter table public.registration_links add column if not exists "completed_at" timestamp;
alter table public.registration_links add column if not exists "ip" text;
alter table public.registration_links add column if not exists "user_agent" text;
alter table public.registration_links add column if not exists "created_at" timestamp default now();
alter table public.registration_links add column if not exists "updated_at" timestamp default now();

create table if not exists public.sales (
  "id" serial,
  "number" text not null,
  "customer_id" integer,
  "type" public.sale_type default 'mixto'::sale_type not null,
  "items" jsonb not null,
  "subtotal" numeric(12, 4) default '0'::numeric,
  "discount" numeric(12, 4) default '0'::numeric,
  "taxes" numeric(12, 4) default '0'::numeric,
  "card_fee" numeric(12, 4) default '0'::numeric,
  "shipping_fee" numeric(12, 4) default '0'::numeric,
  "shipping_service" text,
  "shipping_service_id" integer,
  "total" numeric(12, 4) default '0'::numeric,
  "payment_method" text,
  "status" text default 'concluida'::text not null,
  "client_ref" text,
  "payments" jsonb,
  "received_amount" numeric(12, 2),
  "change_amount" numeric(12, 2),
  "seller_name" text,
  "delivery_mode" text,
  "delivery_date" text,
  "notes" text,
  "cash_session_id" integer,
  "canceled_at" timestamp,
  "cancel_reason" text,
  "created_at" timestamp default now() not null,
  "seller_id" integer,
  primary key ("id")
);
alter table public.sales add column if not exists "number" text;
alter table public.sales add column if not exists "customer_id" integer;
alter table public.sales add column if not exists "type" public.sale_type default 'mixto'::sale_type;
alter table public.sales add column if not exists "items" jsonb;
alter table public.sales add column if not exists "subtotal" numeric(12, 4) default '0'::numeric;
alter table public.sales add column if not exists "discount" numeric(12, 4) default '0'::numeric;
alter table public.sales add column if not exists "taxes" numeric(12, 4) default '0'::numeric;
alter table public.sales add column if not exists "card_fee" numeric(12, 4) default '0'::numeric;
alter table public.sales add column if not exists "shipping_fee" numeric(12, 4) default '0'::numeric;
alter table public.sales add column if not exists "shipping_service" text;
alter table public.sales add column if not exists "shipping_service_id" integer;
alter table public.sales add column if not exists "total" numeric(12, 4) default '0'::numeric;
alter table public.sales add column if not exists "payment_method" text;
alter table public.sales add column if not exists "status" text default 'concluida'::text;
alter table public.sales add column if not exists "client_ref" text;
alter table public.sales add column if not exists "payments" jsonb;
alter table public.sales add column if not exists "received_amount" numeric(12, 2);
alter table public.sales add column if not exists "change_amount" numeric(12, 2);
alter table public.sales add column if not exists "seller_name" text;
alter table public.sales add column if not exists "delivery_mode" text;
alter table public.sales add column if not exists "delivery_date" text;
alter table public.sales add column if not exists "notes" text;
alter table public.sales add column if not exists "cash_session_id" integer;
alter table public.sales add column if not exists "canceled_at" timestamp;
alter table public.sales add column if not exists "cancel_reason" text;
alter table public.sales add column if not exists "created_at" timestamp default now();
alter table public.sales add column if not exists "seller_id" integer;

create table if not exists public.sellers (
  "id" serial,
  "name" text not null,
  "nickname" text,
  "document" text,
  "phone" text,
  "email" text,
  "commission_rate" numeric(6, 3) default '0'::numeric,
  "active" boolean default true not null,
  "notes" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.sellers add column if not exists "name" text;
alter table public.sellers add column if not exists "nickname" text;
alter table public.sellers add column if not exists "document" text;
alter table public.sellers add column if not exists "phone" text;
alter table public.sellers add column if not exists "email" text;
alter table public.sellers add column if not exists "commission_rate" numeric(6, 3) default '0'::numeric;
alter table public.sellers add column if not exists "active" boolean default true;
alter table public.sellers add column if not exists "notes" text;
alter table public.sellers add column if not exists "created_at" timestamp default now();

create table if not exists public.services (
  "id" serial,
  "name" text not null,
  "category_id" integer,
  "type" public.service_type default 'proprio'::service_type not null,
  "base_cost" numeric(12, 4) default '0'::numeric,
  "estimated_hours" numeric(8, 2) default '0'::numeric,
  "becomes_product" boolean default false,
  "partner" text,
  "description" text,
  "archived_at" timestamp,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.services add column if not exists "name" text;
alter table public.services add column if not exists "category_id" integer;
alter table public.services add column if not exists "type" public.service_type default 'proprio'::service_type;
alter table public.services add column if not exists "base_cost" numeric(12, 4) default '0'::numeric;
alter table public.services add column if not exists "estimated_hours" numeric(8, 2) default '0'::numeric;
alter table public.services add column if not exists "becomes_product" boolean default false;
alter table public.services add column if not exists "partner" text;
alter table public.services add column if not exists "description" text;
alter table public.services add column if not exists "archived_at" timestamp;
alter table public.services add column if not exists "created_at" timestamp default now();

create table if not exists public.settings (
  "id" serial,
  "key" text not null,
  "value" text,
  "category" text default 'geral'::text,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.settings add column if not exists "key" text;
alter table public.settings add column if not exists "value" text;
alter table public.settings add column if not exists "category" text default 'geral'::text;
alter table public.settings add column if not exists "updated_at" timestamp default now();

create table if not exists public.shipments (
  "id" serial,
  "order_id" integer,
  "sale_id" integer,
  "delivery_id" integer,
  "customer_id" integer,
  "status" public.shipment_status default 'cotado'::shipment_status not null,
  "superfrete_order_id" text,
  "protocol" text,
  "service_id" integer,
  "service_name" text,
  "carrier" text,
  "price" numeric(12, 2) default '0'::numeric,
  "discount" numeric(12, 2) default '0'::numeric,
  "insurance_value" numeric(12, 2) default '0'::numeric,
  "delivery_min" integer,
  "delivery_max" integer,
  "weight" numeric(10, 3) default '0'::numeric,
  "height" numeric(10, 2) default '0'::numeric,
  "width" numeric(10, 2) default '0'::numeric,
  "length" numeric(10, 2) default '0'::numeric,
  "cep_origin" text,
  "cep_destination" text,
  "address_snapshot" text,
  "tracking_code" text,
  "label_url" text,
  "tracking_status" text,
  "paid_at" timestamp,
  "posted_at" timestamp,
  "delivered_at" timestamp,
  "environment" text default 'production'::text not null,
  "payload" jsonb,
  "last_error" text,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.shipments add column if not exists "order_id" integer;
alter table public.shipments add column if not exists "sale_id" integer;
alter table public.shipments add column if not exists "delivery_id" integer;
alter table public.shipments add column if not exists "customer_id" integer;
alter table public.shipments add column if not exists "status" public.shipment_status default 'cotado'::shipment_status;
alter table public.shipments add column if not exists "superfrete_order_id" text;
alter table public.shipments add column if not exists "protocol" text;
alter table public.shipments add column if not exists "service_id" integer;
alter table public.shipments add column if not exists "service_name" text;
alter table public.shipments add column if not exists "carrier" text;
alter table public.shipments add column if not exists "price" numeric(12, 2) default '0'::numeric;
alter table public.shipments add column if not exists "discount" numeric(12, 2) default '0'::numeric;
alter table public.shipments add column if not exists "insurance_value" numeric(12, 2) default '0'::numeric;
alter table public.shipments add column if not exists "delivery_min" integer;
alter table public.shipments add column if not exists "delivery_max" integer;
alter table public.shipments add column if not exists "weight" numeric(10, 3) default '0'::numeric;
alter table public.shipments add column if not exists "height" numeric(10, 2) default '0'::numeric;
alter table public.shipments add column if not exists "width" numeric(10, 2) default '0'::numeric;
alter table public.shipments add column if not exists "length" numeric(10, 2) default '0'::numeric;
alter table public.shipments add column if not exists "cep_origin" text;
alter table public.shipments add column if not exists "cep_destination" text;
alter table public.shipments add column if not exists "address_snapshot" text;
alter table public.shipments add column if not exists "tracking_code" text;
alter table public.shipments add column if not exists "label_url" text;
alter table public.shipments add column if not exists "tracking_status" text;
alter table public.shipments add column if not exists "paid_at" timestamp;
alter table public.shipments add column if not exists "posted_at" timestamp;
alter table public.shipments add column if not exists "delivered_at" timestamp;
alter table public.shipments add column if not exists "environment" text default 'production'::text;
alter table public.shipments add column if not exists "payload" jsonb;
alter table public.shipments add column if not exists "last_error" text;
alter table public.shipments add column if not exists "created_at" timestamp default now();
alter table public.shipments add column if not exists "updated_at" timestamp default now();

create table if not exists public.stock_movements (
  "id" serial,
  "kind" public.stock_movement_kind not null,
  "target_type" public.stock_target not null,
  "material_id" integer,
  "product_id" integer,
  "quantity" numeric(12, 3) not null,
  "unit_cost" numeric(12, 4) default '0'::numeric,
  "reason" text default 'ajuste'::text,
  "reference" text,
  "notes" text,
  "automatic" boolean default false,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.stock_movements add column if not exists "kind" public.stock_movement_kind;
alter table public.stock_movements add column if not exists "target_type" public.stock_target;
alter table public.stock_movements add column if not exists "material_id" integer;
alter table public.stock_movements add column if not exists "product_id" integer;
alter table public.stock_movements add column if not exists "quantity" numeric(12, 3);
alter table public.stock_movements add column if not exists "unit_cost" numeric(12, 4) default '0'::numeric;
alter table public.stock_movements add column if not exists "reason" text default 'ajuste'::text;
alter table public.stock_movements add column if not exists "reference" text;
alter table public.stock_movements add column if not exists "notes" text;
alter table public.stock_movements add column if not exists "automatic" boolean default false;
alter table public.stock_movements add column if not exists "created_at" timestamp default now();

create table if not exists public.suppliers (
  "id" serial,
  "name" text not null,
  "trade_name" text,
  "document" text,
  "contact_name" text,
  "email" text,
  "phone" text,
  "whatsapp" text,
  "website" text,
  "cep" text,
  "street" text,
  "number" text,
  "complement" text,
  "district" text,
  "city" text,
  "state" text,
  "payment_terms" text,
  "lead_time_days" integer default 0,
  "notes" text,
  "active" boolean default true,
  "created_at" timestamp default now() not null,
  "state_registration" text,
  primary key ("id")
);
alter table public.suppliers add column if not exists "name" text;
alter table public.suppliers add column if not exists "trade_name" text;
alter table public.suppliers add column if not exists "document" text;
alter table public.suppliers add column if not exists "contact_name" text;
alter table public.suppliers add column if not exists "email" text;
alter table public.suppliers add column if not exists "phone" text;
alter table public.suppliers add column if not exists "whatsapp" text;
alter table public.suppliers add column if not exists "website" text;
alter table public.suppliers add column if not exists "cep" text;
alter table public.suppliers add column if not exists "street" text;
alter table public.suppliers add column if not exists "number" text;
alter table public.suppliers add column if not exists "complement" text;
alter table public.suppliers add column if not exists "district" text;
alter table public.suppliers add column if not exists "city" text;
alter table public.suppliers add column if not exists "state" text;
alter table public.suppliers add column if not exists "payment_terms" text;
alter table public.suppliers add column if not exists "lead_time_days" integer default 0;
alter table public.suppliers add column if not exists "notes" text;
alter table public.suppliers add column if not exists "active" boolean default true;
alter table public.suppliers add column if not exists "created_at" timestamp default now();
alter table public.suppliers add column if not exists "state_registration" text;

create table if not exists public.transactions (
  "id" serial,
  "type" public.tx_type not null,
  "category" text,
  "description" text not null,
  "amount" numeric(12, 2) default '0'::numeric,
  "due_date" date,
  "paid_date" date,
  "status" public.tx_status default 'pendente'::tx_status not null,
  "method" text,
  "customer_id" integer,
  "sale_id" integer,
  "order_id" integer,
  "purchase_id" integer,
  "cash_session_id" integer,
  "automatic" boolean default false not null,
  "archived_at" timestamp,
  "archive_reason" text,
  "notes" text,
  "created_at" timestamp default now() not null,
  primary key ("id")
);
alter table public.transactions add column if not exists "type" public.tx_type;
alter table public.transactions add column if not exists "category" text;
alter table public.transactions add column if not exists "description" text;
alter table public.transactions add column if not exists "amount" numeric(12, 2) default '0'::numeric;
alter table public.transactions add column if not exists "due_date" date;
alter table public.transactions add column if not exists "paid_date" date;
alter table public.transactions add column if not exists "status" public.tx_status default 'pendente'::tx_status;
alter table public.transactions add column if not exists "method" text;
alter table public.transactions add column if not exists "customer_id" integer;
alter table public.transactions add column if not exists "sale_id" integer;
alter table public.transactions add column if not exists "order_id" integer;
alter table public.transactions add column if not exists "purchase_id" integer;
alter table public.transactions add column if not exists "cash_session_id" integer;
alter table public.transactions add column if not exists "automatic" boolean default false;
alter table public.transactions add column if not exists "archived_at" timestamp;
alter table public.transactions add column if not exists "archive_reason" text;
alter table public.transactions add column if not exists "notes" text;
alter table public.transactions add column if not exists "created_at" timestamp default now();

create table if not exists public.whatsapp_conversas (
  "phone_e164" text not null,
  "customer_id" integer,
  "etapa" text default 'pedir_nome'::text not null,
  "ultima_msg" timestamptz default now() not null,
  "primeira_msg" timestamptz default now() not null,
  "recebidas" integer default 0 not null,
  "saudou" boolean default false not null,
  "avisou_ausencia" boolean default false not null,
  "assumida_por" text,
  "assumida_em" timestamptz,
  primary key ("phone_e164")
);
alter table public.whatsapp_conversas add column if not exists "phone_e164" text;
alter table public.whatsapp_conversas add column if not exists "customer_id" integer;
alter table public.whatsapp_conversas add column if not exists "etapa" text default 'pedir_nome'::text;
alter table public.whatsapp_conversas add column if not exists "ultima_msg" timestamptz default now();
alter table public.whatsapp_conversas add column if not exists "primeira_msg" timestamptz default now();
alter table public.whatsapp_conversas add column if not exists "recebidas" integer default 0;
alter table public.whatsapp_conversas add column if not exists "saudou" boolean default false;
alter table public.whatsapp_conversas add column if not exists "avisou_ausencia" boolean default false;
alter table public.whatsapp_conversas add column if not exists "assumida_por" text;
alter table public.whatsapp_conversas add column if not exists "assumida_em" timestamptz;

create table if not exists public.whatsapp_mensagens (
  "id" bigserial,
  "phone_e164" text not null,
  "direcao" text not null,
  "texto" text,
  "wa_id" text,
  "criado_em" timestamptz default now() not null,
  primary key ("id")
);
alter table public.whatsapp_mensagens add column if not exists "phone_e164" text;
alter table public.whatsapp_mensagens add column if not exists "direcao" text;
alter table public.whatsapp_mensagens add column if not exists "texto" text;
alter table public.whatsapp_mensagens add column if not exists "wa_id" text;
alter table public.whatsapp_mensagens add column if not exists "criado_em" timestamptz default now();

-- ── índices únicos ──
create unique index if not exists api_integrations_pkey ON public.api_integrations USING btree (id);
create unique index if not exists art_approvals_pkey ON public.art_approvals USING btree (id);
create unique index if not exists campaign_targets_pkey ON public.campaign_targets USING btree (id);
create unique index if not exists campaign_targets_unique_idx ON public.campaign_targets USING btree (campaign_id, customer_id);
create unique index if not exists campaigns_pkey ON public.campaigns USING btree (id);
create unique index if not exists cash_movements_pkey ON public.cash_movements USING btree (id);
create unique index if not exists cash_sessions_one_open_idx ON public.cash_sessions USING btree (status) WHERE (status = 'aberto'::text);
create unique index if not exists cash_sessions_pkey ON public.cash_sessions USING btree (id);
create unique index if not exists commemorative_date_audit_pkey ON public.commemorative_date_audit USING btree (id);
create unique index if not exists commemorative_dates_pkey ON public.commemorative_dates USING btree (id);
create unique index if not exists crm_activities_pkey ON public.crm_activities USING btree (id);
create unique index if not exists crm_leads_pkey ON public.crm_leads USING btree (id);
create unique index if not exists customers_document_unique_idx ON public.customers USING btree (document) WHERE (COALESCE(document, ''::text) <> ''::text);
create unique index if not exists customers_phone_e164_unique_idx ON public.customers USING btree (phone_e164) WHERE (COALESCE(phone_e164, ''::text) <> ''::text);
create unique index if not exists customers_pkey ON public.customers USING btree (id);
create unique index if not exists deliveries_pkey ON public.deliveries USING btree (id);
create unique index if not exists document_counters_pkey ON public.document_counters USING btree (id);
create unique index if not exists document_counters_type_year_idx ON public.document_counters USING btree (document_type, year);
create unique index if not exists finishing_items_pkey ON public.finishing_items USING btree (id);
create unique index if not exists item_categories_pkey ON public.item_categories USING btree (id);
create unique index if not exists kanban_cards_pkey ON public.kanban_cards USING btree (id);
create unique index if not exists materials_pkey ON public.materials USING btree (id);
create unique index if not exists message_templates_pkey ON public.message_templates USING btree (id);
create unique index if not exists message_templates_slug_unique ON public.message_templates USING btree (slug);
create unique index if not exists notifications_pkey ON public.notifications USING btree (id);
create unique index if not exists orders_number_unique ON public.orders USING btree (number);
create unique index if not exists orders_one_per_quote_idx ON public.orders USING btree (quote_id) WHERE (quote_id IS NOT NULL);
create unique index if not exists orders_pkey ON public.orders USING btree (id);
create unique index if not exists payment_links_order_nsu_unique ON public.payment_links USING btree (order_nsu);
create unique index if not exists payment_links_pkey ON public.payment_links USING btree (id);
create unique index if not exists pricing_tables_pkey ON public.pricing_tables USING btree (id);
create unique index if not exists print_formats_pkey ON public.print_formats USING btree (id);
create unique index if not exists printer_categories_pkey ON public.printer_categories USING btree (id);
create unique index if not exists printer_categories_slug_unique ON public.printer_categories USING btree (slug);
create unique index if not exists printer_consumables_pkey ON public.printer_consumables USING btree (id);
create unique index if not exists printers_pkey ON public.printers USING btree (id);
create unique index if not exists product_finishings_pkey ON public.product_finishings USING btree (id);
create unique index if not exists product_materials_pkey ON public.product_materials USING btree (id);
create unique index if not exists product_price_tiers_pkey ON public.product_price_tiers USING btree (id);
create unique index if not exists product_price_tiers_qty_idx ON public.product_price_tiers USING btree (product_id, min_quantity);
create unique index if not exists production_schedules_pkey ON public.production_schedules USING btree (id);
create unique index if not exists products_barcode_unique_idx ON public.products USING btree (barcode) WHERE (COALESCE(barcode, ''::text) <> ''::text);
create unique index if not exists products_pkey ON public.products USING btree (id);
create unique index if not exists products_sku_unique_idx ON public.products USING btree (sku) WHERE (COALESCE(sku, ''::text) <> ''::text);
create unique index if not exists purchases_number_unique ON public.purchases USING btree (number);
create unique index if not exists purchases_pkey ON public.purchases USING btree (id);
create unique index if not exists quote_items_pkey ON public.quote_items USING btree (id);
create unique index if not exists quotes_number_unique ON public.quotes USING btree (number);
create unique index if not exists quotes_pkey ON public.quotes USING btree (id);
create unique index if not exists registration_links_one_active_idx ON public.registration_links USING btree (customer_id) WHERE (status = ANY (ARRAY['pendente'::registration_link_status, 'aberto'::registration_link_status]));
create unique index if not exists registration_links_pkey ON public.registration_links USING btree (id);
create unique index if not exists registration_links_token_unique ON public.registration_links USING btree (token);
create unique index if not exists sales_client_ref_unique ON public.sales USING btree (client_ref);
create unique index if not exists sales_number_unique ON public.sales USING btree (number);
create unique index if not exists sales_pkey ON public.sales USING btree (id);
create unique index if not exists sellers_pkey ON public.sellers USING btree (id);
create unique index if not exists services_pkey ON public.services USING btree (id);
create unique index if not exists settings_key_unique ON public.settings USING btree (key);
create unique index if not exists settings_pkey ON public.settings USING btree (id);
create unique index if not exists shipments_pkey ON public.shipments USING btree (id);
create unique index if not exists shipments_superfrete_order_id_unique ON public.shipments USING btree (superfrete_order_id);
create unique index if not exists stock_movements_pkey ON public.stock_movements USING btree (id);
create unique index if not exists suppliers_pkey ON public.suppliers USING btree (id);
create unique index if not exists transactions_pkey ON public.transactions USING btree (id);
create unique index if not exists whatsapp_conversas_pkey ON public.whatsapp_conversas USING btree (phone_e164);
create unique index if not exists whatsapp_mensagens_pkey ON public.whatsapp_mensagens USING btree (id);

commit;

-- 45 tabela(s) e 597 coluna(s) conferidas.