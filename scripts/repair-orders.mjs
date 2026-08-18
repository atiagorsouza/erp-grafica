// PrintFlow ERP · reparo de integrações do módulo Pedidos & OS
// - Vincula Kanban a order_id
// - Cria entrega/kanban/financeiro ausentes sem sobrescrever registros existentes
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const prodToKanban = (status) => ({
  aguardando: "backlog",
  em_producao: "producao",
  concluido: "pronto",
}[status] || "backlog");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Se a coluna ainda não existir por algum motivo, cria antes do reparo.
    await client.query(`ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS order_id integer`);
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'kanban_cards_order_id_orders_id_fk'
      ) THEN
        ALTER TABLE kanban_cards
        ADD CONSTRAINT kanban_cards_order_id_orders_id_fk
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
      END IF;
    END $$;`);

    const { rows: orderRows } = await client.query(`
      SELECT o.*, c.name AS customer_name, c.trade_name,
             COALESCE((o.items->0->>'productId')::int, NULL) AS first_product_id
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
       ORDER BY o.id
    `);

    let linked = 0;
    let cardsCreated = 0;
    let deliveriesCreated = 0;
    let txCreated = 0;

    for (const o of orderRows) {
      const customerName = o.trade_name || o.customer_name || "Consumidor final";
      const items = Array.isArray(o.items) ? o.items : [];
      const description = items.slice(0, 3).map((i) => `${i.quantity || 1}× ${i.description || 'Item'}`).join(" · ") || "Ordem de produção";
      const column = o.status === "cancelado" ? "cancelado" : prodToKanban(o.production_status);

      // Vincula card existente por quote_id ou título.
      const existingCard = await client.query(
        `SELECT id FROM kanban_cards
          WHERE order_id = $1
             OR ($2::int IS NOT NULL AND quote_id = $2)
             OR title = $3
          ORDER BY id LIMIT 1`,
        [o.id, o.quote_id, `Pedido ${o.number}`]
      );

      if (existingCard.rows[0]) {
        await client.query(
          `UPDATE kanban_cards
              SET order_id = $1,
                  quote_id = COALESCE(quote_id, $2),
                  customer_id = COALESCE(customer_id, $3),
                  customer_name = COALESCE(customer_name, $4),
                  updated_at = NOW()
            WHERE id = $5`,
          [o.id, o.quote_id, o.customer_id, customerName, existingCard.rows[0].id]
        );
        linked++;
      } else {
        await client.query(
          `INSERT INTO kanban_cards
            (title, description, "column", customer_id, customer_name, quote_id, order_id, product_id, priority, due_date, estimated_value)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [`Pedido ${o.number}`, description, column, o.customer_id, customerName, o.quote_id, o.id, o.first_product_id, o.priority || "normal", o.due_date, String(o.total || 0)]
        );
        cardsCreated++;
      }

      const existingDelivery = await client.query(`SELECT id FROM deliveries WHERE order_id = $1 LIMIT 1`, [o.id]);
      if (!existingDelivery.rows[0]) {
        await client.query(
          `INSERT INTO deliveries (order_id, customer_id, method, status, notes)
           VALUES ($1,$2,'retirada',$3,'Gerada pelo reparo do módulo Pedidos & OS.')`,
          [o.id, o.customer_id, o.delivery_status === "a_definir" ? "aguardando" : o.delivery_status || "aguardando"]
        );
        deliveriesCreated++;
      }

      const existingTx = await client.query(
        `SELECT id FROM transactions WHERE category = 'pedido' AND description ILIKE $1 LIMIT 1`,
        [`Pedido ${o.number}%`]
      );
      if (!existingTx.rows[0] && Number(o.total || 0) > 0 && o.status !== "cancelado") {
        const status = o.financial_status === "pago" ? "pago" : "pendente";
        const today = new Date().toISOString().slice(0, 10);
        await client.query(
          `INSERT INTO transactions (type, category, description, amount, due_date, paid_date, status, method, customer_id)
           VALUES ('receita','pedido',$1,$2,$3,$4,$5,$6,$7)`,
          [`Pedido ${o.number} — ${customerName}`, o.total, o.due_date || today, status === "pago" ? today : null, status, o.payment_method, o.customer_id]
        );
        txCreated++;
      }
    }

    await client.query("COMMIT");
    console.log(`✅ Pedidos & OS reparado: ${linked} cards vinculados, ${cardsCreated} cards criados, ${deliveriesCreated} entregas criadas, ${txCreated} financeiros criados.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ repair-orders falhou:", e.message);
  process.exit(1);
});
