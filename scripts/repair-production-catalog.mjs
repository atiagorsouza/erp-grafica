// PrintFlow ERP · reparo geral do Motor de Produção
import pg from "pg";
import "dotenv/config";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não definido"); process.exit(1); }
const sku = (name, id) => `PRO-${String(name||'ITEM').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'').toUpperCase().slice(0,6)||'ITEM'}${String(id).padStart(3,'0')}`;
async function main(){
 const client=await pool.connect();
 try{ await client.query('BEGIN');
  const products = await client.query(`UPDATE products SET
    sku = COALESCE(NULLIF(sku,''), 'PRO-' || upper(substr(regexp_replace(coalesce(name,'ITEM'), '[^a-zA-Z0-9]+', '', 'g'),1,6)) || lpad(id::text,3,'0')),
    pages_per_unit = CASE WHEN pages_per_unit::numeric <= 0 THEN 1 ELSE pages_per_unit END,
    copies = CASE WHEN copies::numeric <= 0 THEN 1 ELSE copies END,
    pieces_per_sheet = CASE WHEN pieces_per_sheet::numeric <= 0 THEN 1 ELSE pieces_per_sheet END,
    min_order_qty = CASE WHEN min_order_qty::numeric < 0 THEN 0 ELSE min_order_qty END,
    margin = CASE WHEN margin::numeric < 0 THEN 0 WHEN margin::numeric >= .95 THEN .95 ELSE margin END,
    final_price = CASE WHEN final_price::numeric < 0 THEN 0 ELSE final_price END,
    stock = COALESCE(stock,0), min_stock = COALESCE(min_stock,0)
    WHERE true`);
  const pricing = await client.query(`UPDATE pricing_tables SET unit_cost=GREATEST(coalesce(unit_cost,0),0), min_qty=CASE WHEN min_qty::numeric <= 0 THEN 1 ELSE min_qty END, active=COALESCE(active,true)`);
  const services = await client.query(`UPDATE services SET base_cost=GREATEST(coalesce(base_cost,0),0), estimated_hours=GREATEST(coalesce(estimated_hours,0),0)`);
  const finishings = await client.query(`UPDATE finishing_items SET unit_cost=GREATEST(coalesce(unit_cost,0),0), unit=COALESCE(NULLIF(unit,''),'unidade')`);
  const materials = await client.query(`UPDATE materials SET unit_cost=GREATEST(coalesce(unit_cost,0),0), stock=COALESCE(stock,0), min_stock=GREATEST(coalesce(min_stock,0),0), unit=COALESCE(NULLIF(unit,''),'unidade')`);
  const purchases = await client.query(`UPDATE purchases SET subtotal=GREATEST(coalesce(subtotal,0),0), freight=GREATEST(coalesce(freight,0),0), discount=GREATEST(coalesce(discount,0),0), total=GREATEST(coalesce(total,0),0) WHERE true`);
  await client.query('COMMIT');
  console.log(`✅ Motor de Produção reparado: produtos ${products.rowCount}, tabelas ${pricing.rowCount}, serviços ${services.rowCount}, acabamentos ${finishings.rowCount}, materiais ${materials.rowCount}, compras ${purchases.rowCount}.`);
 }catch(e){ await client.query('ROLLBACK'); throw e; } finally { client.release(); await pool.end(); }
}
main().catch(e=>{ console.error('❌ repair-production-catalog falhou:', e.message); process.exit(1); });
