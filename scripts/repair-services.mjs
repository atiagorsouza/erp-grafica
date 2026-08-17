// PrintFlow ERP · reparo do módulo Serviços & Acabamentos
// - Normaliza custos/horas/unidades
// - Corrige tipos inválidos
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const serviceFix = await client.query(`
      UPDATE services
         SET type = CASE WHEN type NOT IN ('proprio','terceirizado') OR type IS NULL THEN 'proprio' ELSE type END,
             base_cost = CASE WHEN base_cost IS NULL OR base_cost::numeric < 0 THEN 0 ELSE base_cost END,
             estimated_hours = CASE WHEN estimated_hours IS NULL OR estimated_hours::numeric < 0 THEN 0 ELSE estimated_hours END,
             partner = CASE WHEN type = 'terceirizado' THEN partner ELSE NULL END
       WHERE type NOT IN ('proprio','terceirizado') OR type IS NULL
          OR base_cost IS NULL OR base_cost::numeric < 0
          OR estimated_hours IS NULL OR estimated_hours::numeric < 0
          OR (type <> 'terceirizado' AND partner IS NOT NULL)
    `);
    const finishingFix = await client.query(`
      UPDATE finishing_items
         SET unit = COALESCE(NULLIF(trim(unit), ''), 'unidade'),
             unit_cost = CASE WHEN unit_cost IS NULL OR unit_cost::numeric < 0 THEN 0 ELSE unit_cost END
       WHERE unit IS NULL OR trim(unit) = '' OR unit_cost IS NULL OR unit_cost::numeric < 0
    `);
    const pfFix = await client.query(`
      UPDATE product_finishings
         SET quantity = CASE WHEN quantity IS NULL OR quantity::numeric < 0 THEN 1 ELSE quantity END,
             batch_size = CASE WHEN batch_size IS NULL OR batch_size::numeric <= 0 THEN 1 ELSE batch_size END,
             charge_mode = CASE WHEN charge_mode IS NULL OR charge_mode = '' THEN 'per_piece' ELSE charge_mode END
       WHERE quantity IS NULL OR quantity::numeric < 0 OR batch_size IS NULL OR batch_size::numeric <= 0 OR charge_mode IS NULL OR charge_mode = ''
    `);
    await client.query("COMMIT");
    console.log(`✅ Serviços & Acabamentos reparado: ${serviceFix.rowCount} serviços, ${finishingFix.rowCount} acabamentos, ${pfFix.rowCount} vínculos.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-services falhou:", e.message);
  process.exit(1);
});
