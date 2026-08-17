// PrintFlow ERP · reparo do módulo Kanban de Produção
// - Normaliza colunas inválidas
// - Vincula cards a pedidos quando possível
// - Reordena cards por coluna sem apagar histórico
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const VALID = new Set(["backlog", "producao", "revisao", "pronto", "entregue", "cancelado"]);
const prodToCol = (s) => ({ aguardando: "backlog", em_producao: "producao", concluido: "pronto" }[s] || "backlog");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS order_id integer`);

    const invalid = await client.query(`UPDATE kanban_cards SET "column" = 'backlog', updated_at = NOW() WHERE "column" IS NULL OR "column" = '' OR "column" NOT IN ('backlog','producao','revisao','pronto','entregue','cancelado')`);

    const { rows: cards } = await client.query(`SELECT id, title, quote_id, order_id FROM kanban_cards ORDER BY id`);
    let linked = 0;
    for (const c of cards) {
      if (c.order_id) continue;
      let orderId = null;
      if (c.quote_id) {
        const byQuote = await client.query(`SELECT id FROM orders WHERE quote_id = $1 ORDER BY id LIMIT 1`, [c.quote_id]);
        orderId = byQuote.rows[0]?.id || null;
      }
      if (!orderId) {
        const m = String(c.title || "").match(/Pedido\s+([A-Z]+-\d{4}-\d+)/i);
        if (m) {
          const byNumber = await client.query(`SELECT id FROM orders WHERE number = $1 LIMIT 1`, [m[1]]);
          orderId = byNumber.rows[0]?.id || null;
        }
      }
      if (orderId) {
        await client.query(`UPDATE kanban_cards SET order_id = $1, updated_at = NOW() WHERE id = $2`, [orderId, c.id]);
        linked++;
      }
    }

    // Atualiza coluna de cards vinculados a pedidos não cancelados conforme status atual do pedido.
    const synced = await client.query(`
      UPDATE kanban_cards k
         SET "column" = CASE
              WHEN o.status = 'cancelado' THEN 'cancelado'
              WHEN o.delivery_status = 'entregue' THEN 'entregue'
              WHEN o.production_status = 'concluido' THEN 'pronto'
              WHEN o.production_status = 'em_producao' THEN 'producao'
              ELSE 'backlog'
            END,
            priority = COALESCE(o.priority, k.priority),
            due_date = COALESCE(o.due_date, k.due_date),
            estimated_value = COALESCE(o.total, k.estimated_value),
            updated_at = NOW()
        FROM orders o
       WHERE k.order_id = o.id
    `);

    let reordered = 0;
    for (const col of VALID) {
      const { rows } = await client.query(`SELECT id FROM kanban_cards WHERE "column" = $1 ORDER BY "order", priority DESC, due_date NULLS LAST, id`, [col]);
      for (let i = 0; i < rows.length; i++) {
        const r = await client.query(`UPDATE kanban_cards SET "order" = $1 WHERE id = $2 AND "order" IS DISTINCT FROM $1`, [i, rows[i].id]);
        reordered += r.rowCount || 0;
      }
    }

    await client.query("COMMIT");
    console.log(`✅ Kanban reparado: ${invalid.rowCount} colunas inválidas, ${linked} vínculos criados, ${synced.rowCount} cards sincronizados, ${reordered} posições ajustadas.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-kanban falhou:", e.message);
  process.exit(1);
});
