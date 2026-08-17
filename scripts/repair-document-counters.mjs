// PrintFlow ERP · reparo de contadores de documentos
// Ajusta document_counters para o maior sequencial já existente nas tabelas.
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const SPECS = [
  ["quote", "quotes", "ORC"],
  ["order", "orders", "PED"],
  ["sale", "sales", "PDV"],
  ["purchase", "purchases", "CMP"],
];

function seqFrom(number, prefix, year) {
  const text = String(number || "");
  const patterns = [
    new RegExp(`^${prefix}-${year}-(\\d+)$`, "i"),
    new RegExp(`^${prefix}-(\\d+)$`, "i"),
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return Number(m[1] || 0);
  }
  const any = text.match(/(\d+)$/);
  return any ? Number(any[1]) : 0;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const year = new Date().getFullYear();
    let repaired = 0;

    for (const [type, table, prefix] of SPECS) {
      const { rows } = await client.query(`SELECT number FROM ${table}`);
      const max = rows.reduce((m, r) => Math.max(m, seqFrom(r.number, prefix, year)), 0);
      if (max <= 0) continue;
      await client.query(
        `INSERT INTO document_counters (document_type, year, current, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (document_type, year)
         DO UPDATE SET current = GREATEST(document_counters.current, EXCLUDED.current), updated_at = NOW()`,
        [type, year, max]
      );
      repaired++;
    }

    await client.query("COMMIT");
    console.log(`✅ Contadores de documentos reparados: ${repaired} tipos verificados.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-document-counters falhou:", e.message);
  process.exit(1);
});
