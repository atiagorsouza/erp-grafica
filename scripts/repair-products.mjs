// PrintFlow ERP · reparo do módulo Produtos & Custos
// - Garante SKU
// - Normaliza flags/estoque
// - Recalcula produtos usando a API server-side do módulo quando possível
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const genSku = (name, id) => {
  const slug = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 6);
  return `PRO-${slug || "ITEM"}${String(id).padStart(3, "0")}`;
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: missingSku } = await client.query(`SELECT id,name FROM products WHERE sku IS NULL OR trim(sku) = ''`);
    let skuCount = 0;
    for (const r of missingSku) {
      const upd = await client.query(`UPDATE products SET sku=$2 WHERE id=$1`, [r.id, genSku(r.name, r.id)]);
      skuCount += upd.rowCount || 0;
    }
    const skuFix = { rowCount: skuCount };

    const numericFix = await client.query(`
      UPDATE products
         SET pages_per_unit = CASE WHEN pages_per_unit IS NULL OR pages_per_unit::numeric < 0 THEN 1 ELSE pages_per_unit END,
             copies = CASE WHEN copies IS NULL OR copies::numeric < 0 THEN 1 ELSE copies END,
             default_quantity = CASE WHEN default_quantity IS NULL OR default_quantity::numeric < 0 THEN 1 ELSE default_quantity END,
             pieces_per_sheet = CASE WHEN pieces_per_sheet IS NULL OR pieces_per_sheet::numeric <= 0 THEN 1 ELSE pieces_per_sheet END,
             print_sides = CASE WHEN print_sides IS NULL OR print_sides < 1 THEN 1 ELSE print_sides END,
             margin = CASE WHEN margin IS NULL OR margin::numeric < 0 THEN 0.4 WHEN margin::numeric > 0.95 THEN 0.95 ELSE margin END,
             final_price = CASE WHEN final_price IS NULL OR final_price::numeric < 0 THEN 0 ELSE final_price END,
             cost_snapshot = CASE WHEN cost_snapshot IS NULL OR cost_snapshot::numeric < 0 THEN 0 ELSE cost_snapshot END,
             stock = CASE WHEN stock IS NULL THEN 0 ELSE stock END,
             min_stock = CASE WHEN min_stock IS NULL OR min_stock::numeric < 0 THEN 0 ELSE min_stock END
       WHERE pages_per_unit IS NULL OR pages_per_unit::numeric < 0
          OR copies IS NULL OR copies::numeric < 0
          OR default_quantity IS NULL OR default_quantity::numeric < 0
          OR pieces_per_sheet IS NULL OR pieces_per_sheet::numeric <= 0
          OR print_sides IS NULL OR print_sides < 1
          OR margin IS NULL OR margin::numeric < 0 OR margin::numeric > 0.95
          OR final_price IS NULL OR final_price::numeric < 0
          OR cost_snapshot IS NULL OR cost_snapshot::numeric < 0
          OR stock IS NULL OR min_stock IS NULL OR min_stock::numeric < 0
    `);

    const componentFix = await client.query(`
      UPDATE product_finishings SET quantity = 1 WHERE quantity IS NULL OR quantity::numeric < 0;
      UPDATE product_finishings SET batch_size = 1 WHERE batch_size IS NULL OR batch_size::numeric <= 0;
      UPDATE product_materials SET quantity = 1 WHERE quantity IS NULL OR quantity::numeric < 0;
    `);

    await client.query("COMMIT");
    console.log(`✅ Produtos & Custos reparado: ${skuFix.rowCount} SKUs, ${numericFix.rowCount} produtos normalizados.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-products falhou:", e.message);
  process.exit(1);
});
