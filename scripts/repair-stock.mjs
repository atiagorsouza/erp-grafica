// PrintFlow ERP · reparo do módulo Estoque & Compras
// - Normaliza materiais/fornecedores/compras/movimentos
import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não definido"); process.exit(1); }

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mat = await client.query(`
      UPDATE materials
         SET unit = COALESCE(NULLIF(trim(unit), ''), 'unidade'),
             unit_cost = CASE WHEN unit_cost IS NULL OR unit_cost::numeric < 0 THEN 0 ELSE unit_cost END,
             stock = CASE WHEN stock IS NULL THEN 0 ELSE stock END,
             min_stock = CASE WHEN min_stock IS NULL OR min_stock::numeric < 0 THEN 0 ELSE min_stock END
       WHERE unit IS NULL OR trim(unit)='' OR unit_cost IS NULL OR unit_cost::numeric < 0 OR stock IS NULL OR min_stock IS NULL OR min_stock::numeric < 0
    `);
    const sup = await client.query(`UPDATE suppliers SET active = true WHERE active IS NULL`);
    const mov = await client.query(`
      UPDATE stock_movements
         SET quantity = CASE WHEN quantity IS NULL OR quantity::numeric <= 0 THEN 0.001 ELSE quantity END,
             unit_cost = CASE WHEN unit_cost IS NULL OR unit_cost::numeric < 0 THEN 0 ELSE unit_cost END,
             reason = COALESCE(NULLIF(trim(reason), ''), 'ajuste')
       WHERE quantity IS NULL OR quantity::numeric <= 0 OR unit_cost IS NULL OR unit_cost::numeric < 0 OR reason IS NULL OR trim(reason)=''
    `);
    const pur = await client.query(`
      UPDATE purchases
         SET status = COALESCE(NULLIF(trim(status), ''), 'rascunho'),
             subtotal = CASE WHEN subtotal IS NULL OR subtotal::numeric < 0 THEN 0 ELSE subtotal END,
             freight = CASE WHEN freight IS NULL OR freight::numeric < 0 THEN 0 ELSE freight END,
             discount = CASE WHEN discount IS NULL OR discount::numeric < 0 THEN 0 ELSE discount END,
             total = CASE WHEN total IS NULL OR total::numeric < 0 THEN 0 ELSE total END
       WHERE status IS NULL OR trim(status)='' OR subtotal IS NULL OR subtotal::numeric < 0 OR freight IS NULL OR freight::numeric < 0 OR discount IS NULL OR discount::numeric < 0 OR total IS NULL OR total::numeric < 0
    `);
    await client.query("COMMIT");
    console.log(`✅ Estoque & Compras reparado: ${mat.rowCount} materiais, ${sup.rowCount} fornecedores, ${mov.rowCount} movimentos, ${pur.rowCount} compras.`);
  } catch(e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); await pool.end(); }
}
main().catch((e)=>{ console.error("❌ repair-stock falhou:", e.message); process.exit(1); });
