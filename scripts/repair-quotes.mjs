// PrintFlow ERP · reparo do módulo Orçamentos
// - Marca enviados vencidos como expirados
// - Garante cards Kanban para orçamentos aprovados ainda não convertidos
// - Move cards de recusados/expirados para cancelado
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

    /* v3.16.0 — um orçamento gera no máximo um pedido.
       Antes do índice, duplo-clique em "Converter em Pedido" criava OS
       duplicada. Bases antigas podem já ter duplicatas: mantemos a mais
       antiga (a que gerou produção) e soltamos o vínculo das demais,
       sem apagar nada, para o índice poder ser criado. */
    const dups = await client.query(`
      UPDATE orders SET quote_id = NULL
       WHERE id IN (
         SELECT id FROM (
           SELECT id, row_number() OVER (PARTITION BY quote_id ORDER BY id) AS rn
             FROM orders WHERE quote_id IS NOT NULL
         ) t WHERE t.rn > 1
       )
    `);
    if (dups.rowCount > 0) {
      console.log(`⚠️  ${dups.rowCount} pedido(s) duplicado(s) desvinculado(s) do orçamento de origem.`);
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS orders_one_per_quote_idx
        ON orders (quote_id) WHERE quote_id IS NOT NULL
    `);

    const expired = await client.query(`
      UPDATE quotes
         SET status = 'expirado'
       WHERE status = 'enviado'
         AND valid_until IS NOT NULL
         AND valid_until < CURRENT_DATE
    `);

    const { rows } = await client.query(`
      SELECT q.*, c.name AS customer_name, c.trade_name,
             EXISTS(SELECT 1 FROM orders o WHERE o.quote_id = q.id) AS has_order
        FROM quotes q
        LEFT JOIN customers c ON c.id = q.customer_id
       ORDER BY q.id
    `);

    let cardsCreated = 0;
    let cardsUpdated = 0;
    for (const q of rows) {
      const existing = await client.query(`SELECT id FROM kanban_cards WHERE quote_id = $1 LIMIT 1`, [q.id]);
      const items = await client.query(`SELECT description, quantity, product_id FROM quote_items WHERE quote_id=$1 ORDER BY id LIMIT 3`, [q.id]);
      const summary = items.rows.map(i => `${Number(i.quantity || 1)}× ${i.description}`).join(' · ') || 'Orçamento';
      const customerName = q.trade_name || q.customer_name || 'Consumidor final';
      const firstProduct = items.rows.find(i => i.product_id)?.product_id || null;

      if (q.status === 'aprovado' && !q.has_order) {
        if (existing.rows[0]) {
          await client.query(`
            UPDATE kanban_cards
               SET title=$2, description=$3, "column"='backlog', customer_id=$4, customer_name=$5,
                   product_id=$6, estimated_value=$7, due_date=$8, updated_at=NOW()
             WHERE id=$1
          `, [existing.rows[0].id, `Orçamento ${q.number}`, summary, q.customer_id, customerName, firstProduct, q.total, q.valid_until]);
          cardsUpdated++;
        } else {
          await client.query(`
            INSERT INTO kanban_cards (title, description, "column", customer_id, customer_name, product_id, priority, quote_id, estimated_value, due_date)
            VALUES ($1,$2,'backlog',$3,$4,$5,'normal',$6,$7,$8)
          `, [`Orçamento ${q.number}`, summary, q.customer_id, customerName, firstProduct, q.id, q.total, q.valid_until]);
          cardsCreated++;
        }
      }

      if ((q.status === 'recusado' || q.status === 'expirado') && existing.rows[0]) {
        await client.query(`UPDATE kanban_cards SET "column"='cancelado', updated_at=NOW() WHERE id=$1`, [existing.rows[0].id]);
        cardsUpdated++;
      }
    }

    await client.query("COMMIT");
    console.log(`✅ Orçamentos reparados: ${expired.rowCount} expirados, ${cardsCreated} cards criados, ${cardsUpdated} cards atualizados.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-quotes falhou:", e.message);
  process.exit(1);
});
