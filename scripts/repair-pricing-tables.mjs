// PrintFlow ERP · reparo do módulo Tabelas de Preços
// - Normaliza unidades por tipo
// - Corrige preço/minQty negativos
// - Desativa duplicatas exatas preservando histórico
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

function unitFor(type, unit) {
  if (type === "lona" || type === "adesivo") return "m2";
  if (type === "dtf_textil" && (!unit || unit === "unidade")) return "metro";
  return unit || "unidade";
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM pricing_tables ORDER BY type, label, id`);
    let fixed = 0;
    let duplicates = 0;
    const seen = new Set();
    for (const r of rows) {
      const unit = unitFor(r.type, r.unit);
      const unitCost = Math.max(Number(r.unit_cost || 0), 0);
      const minQty = Math.max(Number(r.min_qty || 1), 0.001);
      const width = r.width_cm != null ? Math.max(Number(r.width_cm), 0) : null;
      const height = r.height_cm != null ? Math.max(Number(r.height_cm), 0) : null;
      const key = `${r.type}|${String(r.label).trim().toLowerCase()}`;
      const active = seen.has(key) ? false : (r.active !== false);
      if (seen.has(key)) duplicates++;
      seen.add(key);
      const res = await client.query(
        `UPDATE pricing_tables
            SET unit=$2, unit_cost=$3, min_qty=$4, width_cm=$5, height_cm=$6, active=$7
          WHERE id=$1
            AND (unit IS DISTINCT FROM $2 OR unit_cost IS DISTINCT FROM $3 OR min_qty IS DISTINCT FROM $4 OR width_cm IS DISTINCT FROM $5 OR height_cm IS DISTINCT FROM $6 OR active IS DISTINCT FROM $7)`,
        [r.id, unit, unitCost, minQty, width, height, active]
      );
      fixed += res.rowCount || 0;
    }
    await client.query("COMMIT");
    console.log(`✅ Tabelas de Preços reparadas: ${fixed} linhas normalizadas, ${duplicates} duplicatas desativadas.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-pricing-tables falhou:", e.message);
  process.exit(1);
});
