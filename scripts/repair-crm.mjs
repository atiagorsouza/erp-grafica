// PrintFlow ERP · reparo do módulo Clientes & CRM
// - Normaliza fontes/tipos legados após remoção de comunicação automática
// - Corrige status/categorias básicas sem apagar histórico
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const onlyDigits = (v) => String(v || "").replace(/\D/g, "");
const phone = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (!d) return null;
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, (_, a,b,c) => c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`);
  return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, (_, a,b,c) => c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`);
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    /* v3.18.0 — um documento, um cliente.
       Bases antigas podem ter duplicatas (a checagem era só no código).
       Mantemos o cadastro mais antigo com o documento e movemos o dos
       demais para as observações — nenhum cliente é apagado e nada de
       histórico se perde; depois o índice pode ser criado. */
    const dupes = await client.query(`
      UPDATE customers c SET
        notes = concat_ws(E'\\n', nullif(c.notes,''),
                'DOCUMENTO DUPLICADO NA MIGRACAO: ' || c.document ||
                ' (ja usado no cadastro #' || k.keep_id || ')'),
        document = NULL,
        updated_at = now()
      FROM (
        SELECT regexp_replace(document,'\\D','','g') AS d, MIN(id) AS keep_id
          FROM customers
         WHERE coalesce(document,'') <> ''
         GROUP BY 1 HAVING count(*) > 1
      ) k
      WHERE regexp_replace(c.document,'\\D','','g') = k.d
        AND c.id <> k.keep_id
    `);
    if (dupes.rowCount > 0) {
      console.log(`⚠️  ${dupes.rowCount} cadastro(s) com documento duplicado — documento movido para observações.`);
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS customers_document_unique_idx
        ON customers (document) WHERE coalesce(document,'') <> ''
    `);

    const sourceFix = await client.query(`
      UPDATE crm_leads
         SET source = 'balcao', updated_at = NOW()
       WHERE source IN ('whatsapp','email') OR source IS NULL OR source = ''
    `);

    const typeFix = await client.query(`
      UPDATE crm_activities
         SET type = 'nota'
       WHERE type IN ('whatsapp','email') OR type IS NULL OR type = ''
    `);

    const statusFix = await client.query(`
      UPDATE customers
         SET status = 'lead', updated_at = NOW()
       WHERE status IS NULL OR status NOT IN ('lead','ativo','inativo','bloqueado')
    `);

    const { rows } = await client.query(`SELECT id, phone, whatsapp, secondary_phone, cep, email, state FROM customers`);
    let normalized = 0;
    for (const r of rows) {
      const p = phone(r.phone);
      const w = phone(r.whatsapp);
      const s = phone(r.secondary_phone);
      const cepDigits = onlyDigits(r.cep).slice(0, 8);
      const cep = cepDigits.length === 8 ? `${cepDigits.slice(0,5)}-${cepDigits.slice(5)}` : (r.cep || null);
      const email = r.email ? String(r.email).trim().toLowerCase() : null;
      const state = r.state ? String(r.state).trim().toUpperCase().slice(0,2) : null;
      const res = await client.query(
        `UPDATE customers
            SET phone = $2,
                whatsapp = $3,
                secondary_phone = $4,
                cep = $5,
                email = $6,
                state = $7,
                updated_at = updated_at
          WHERE id = $1
            AND (phone IS DISTINCT FROM $2 OR whatsapp IS DISTINCT FROM $3 OR secondary_phone IS DISTINCT FROM $4 OR cep IS DISTINCT FROM $5 OR email IS DISTINCT FROM $6 OR state IS DISTINCT FROM $7)`,
        [r.id, p, w, s, cep, email, state]
      );
      normalized += res.rowCount || 0;
    }

    await client.query("COMMIT");
    console.log(`✅ Clientes & CRM reparado: ${sourceFix.rowCount} fontes, ${typeFix.rowCount} atividades, ${statusFix.rowCount} status, ${normalized} contatos normalizados.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-crm falhou:", e.message);
  process.exit(1);
});
