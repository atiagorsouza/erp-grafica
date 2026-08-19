#!/usr/bin/env node
/**
 * Repara o Painel de Controle: garante que TODA chave usada pela UI exista
 * no banco (settings), sem sobrescrever valores já preenchidos pelo usuário.
 *
 * Por que existe:
 *   Instalações antigas (pré-3.0.0) só gravavam 4 chaves de empresa e
 *   nenhuma chave de PDV/Orçamentos/Pedidos/Kanban/CRM/Calendário. Como a UI
 *   monta as abas a partir de uma lista estática, elas até apareciam, mas
 *   vinham vazias — dando a impressão de "abas faltando/quebradas".
 *
 *   Este script insere apenas o que falta (ON CONFLICT DO NOTHING) e ainda:
 *     · migra company_document → company_cnpj (nome usado pela UI)
 *     · migra company_address antigo para os campos estruturados, se vazios
 *
 * Uso:  node scripts/repair-settings.mjs
 *       node scripts/repair-settings.mjs --dry   (só relatório, não grava)
 */
import pg from "pg";
import "dotenv/config";

const DRY = process.argv.includes("--dry");
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params = []) => pool.query(sql, params);

/* Categoria (aba) de cada chave — espelha categoryOf() do backend. */
const categoryOf = (k) =>
  k.startsWith("company_") || k === "pix_key" ? "empresa"
  : k.startsWith("document_") ? "documentos"
  : k.startsWith("pdv_") ? "pdv"
  : k.startsWith("quote_") ? "orcamentos"
  : k.startsWith("order_") ? "pedidos"
  : k.startsWith("kanban_") ? "kanban"
  : k.startsWith("crm_") ? "crm"
  : k.startsWith("calendar_") ? "calendario"
  : k.startsWith("fiscal_") ? "fiscal"
  : k.startsWith("app_") ? "sistema"
  : (k.includes("rate") || k.includes("fee") || k.includes("rounding")) ? "tributacao"
  : "geral";

/* Chaves esperadas pela UI + valor padrão quando ausente. */
const EXPECTED = {
  // empresa
  company_name: "", company_legal_name: "", company_cnpj: "", company_email: "",
  company_phone: "", company_phone2: "", company_whatsapp: "", company_website: "",
  pix_key: "", company_street: "", company_number: "", company_district: "",
  company_city: "", company_state: "", company_cep: "",
  // tributação
  operational_rate: "15", tax_rate: "6", card_fee_debit: "1.99", card_fee_credit: "4.99",
  // documentos
  document_number_mode: "annual", document_number_width: "4",
  document_prefix_quote: "ORC", document_prefix_order: "PED",
  document_prefix_sale: "PDV", document_prefix_purchase: "CMP",
  // pdv
  pdv_seller_default: "", pdv_delivery_default: "Entrega direto para o cliente",
  pdv_receipt_footer: "Agradecemos pela preferência, esperamos seu retorno em breve!",
  pdv_require_customer: "false", pdv_allow_negative_stock: "false",
  // orçamentos
  quote_validity_days: "7", quote_default_payment: "PIX", quote_default_seller: "",
  quote_default_notes: "Orçamento válido por 7 dias.",
  // pedidos
  order_default_priority: "normal", order_default_channel: "Atendimento",
  order_auto_kanban: "true", order_auto_delivery: "true", order_auto_transaction: "true",
  // kanban
  kanban_auto_sync_orders: "true", kanban_columns: "backlog,producao,revisao,pronto,entregue",
  // crm
  crm_followup_interval_days: "7", crm_lead_expiry_days: "30",
  // calendário
  calendar_alert_days_before: "7", calendar_auto_campaign_alert: "true",
  // fiscal
  fiscal_environment: "homologacao", fiscal_tax_regime: "simples", fiscal_provider: "manual",
  fiscal_nfe_enabled: "false", fiscal_nfce_enabled: "false", fiscal_nfse_enabled: "false",
  fiscal_certificate_type: "nenhum",
};

/* Chaves que não existem mais no produto (módulos removidos / legado migrado).
 * As de empresa só saem DEPOIS que a migração para a chave nova acontece. */
const OBSOLETE_PREFIXES = ["communication_", "whatsapp_", "email_", "resend_"];
const OBSOLETE_KEYS = ["company_document", "company_address"];

async function main() {
  console.log(`\n🔧 Reparo do Painel de Controle${DRY ? " (dry-run)" : ""}\n`);

  const { rows } = await q("SELECT key, value, category FROM settings");
  const existing = new Map(rows.map((r) => [r.key, r]));

  /* 1) migrações de chave/legado (só quando o destino está vazio) */
  const migrations = [];
  const cnpjLegacy = existing.get("company_document");
  if (cnpjLegacy?.value && !existing.get("company_cnpj")?.value) {
    migrations.push(["company_cnpj", cnpjLegacy.value]);
  }
  /* endereço antigo em um único campo → estrutura, se os campos estão vazios */
  const addr = existing.get("company_address")?.value;
  if (addr && !existing.get("company_street")?.value) {
    migrations.push(["company_street", addr.split(",")[0]?.trim() || addr]);
  }

  for (const [key, value] of migrations) {
    console.log(`↻ migração  ${key} ← "${value}"`);
    if (!DRY) {
      await q(
        `INSERT INTO settings (key, value, category) VALUES ($1,$2,$3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, value, categoryOf(key)]
      );
    }
  }

  /* 2) insere o que falta (nunca sobrescreve valor do usuário) */
  let inserted = 0;
  let recategorized = 0;
  for (const [key, def] of Object.entries(EXPECTED)) {
    const row = existing.get(key);
    if (!row) {
      console.log(`+ faltando  ${key}  (categoria ${categoryOf(key)})`);
      inserted++;
      if (!DRY) {
        await q(
          `INSERT INTO settings (key, value, category) VALUES ($1,$2,$3)
           ON CONFLICT (key) DO NOTHING`,
          [key, def, categoryOf(key)]
        );
      }
    } else if (row.category !== categoryOf(key)) {
      /* corrige categoria errada de instalações antigas */
      console.log(`~ categoria ${key}: ${row.category} → ${categoryOf(key)}`);
      recategorized++;
      if (!DRY) {
        await q(`UPDATE settings SET category = $2, updated_at = now() WHERE key = $1`, [key, categoryOf(key)]);
      }
    }
  }

  /* 3) remove chaves obsoletas (módulos removidos / legado já migrado) */
  let removed = 0;
  for (const row of rows) {
    const obsoletePrefix = OBSOLETE_PREFIXES.some((p) => row.key.startsWith(p));
    const obsoleteExact = OBSOLETE_KEYS.includes(row.key);
    if (obsoletePrefix || obsoleteExact) {
      console.log(`- obsoleta  ${row.key}`);
      removed++;
      if (!DRY) await q("DELETE FROM settings WHERE key = $1", [row.key]);
    }
  }

  /* 4) desconto PIX: 6,12% era a TAXA DO CARTÃO usada por engano como
     desconto. A política da VTDIGITAL é 5%. Num pedido de R$ 500 a
     diferença é R$ 5,60 saindo sem intenção.

     Só corrige quem está exatamente em 6.12 (o valor errado herdado).
     Qualquer outro número foi escolha do usuário e fica. */
  let pixFix = 0;
  {
    const r = await q(`SELECT value FROM settings WHERE key = 'pricing_pix_discount'`);
    const atual = r.rows[0]?.value;
    if (atual && ["6.12", "6,12", "6.1200"].includes(String(atual).trim())) {
      console.log(`↓ desconto PIX  ${atual}% → 5%  (era a taxa do cartão, não a política)`);
      pixFix = 1;
      if (!DRY) {
        await q(
          `UPDATE settings SET value = '5', updated_at = now() WHERE key = 'pricing_pix_discount'`
        );
      }
    }
  }

  console.log(
    `\n✅ ${DRY ? "Simulação" : "Reparo"} concluído: ` +
    `${inserted} inserida(s), ${migrations.length} migração(ões), ` +
    `${recategorized} recategorização(ões), ${removed} removida(s)` +
    `${pixFix ? ", desconto PIX ajustado" : ""}.`
  );
  await pool.end();
}

main().catch((e) => {
  console.error("❌ Falha no reparo:", e.message);
  pool.end();
  process.exit(1);
});
