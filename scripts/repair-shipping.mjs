// PrintFlow ERP · reparo do módulo Envios & Frete (SuperFrete)
//
// 1. normaliza medidas negativas/nulas de produtos
// 2. corrige nome do serviço quando a API do carrinho não devolveu
// 3. religa envios às entregas correspondentes
// 4. sincroniza delivery_status do pedido com o status do envio
// 5. cria a despesa de etiquetas pagas que ficaram sem lançamento
// 6. marca como "erro" envios travados no carrinho há mais de 7 dias
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TZ = process.env.APP_TZ || "America/Sao_Paulo";

const SERVICE_NAMES = { 1: "PAC", 2: "SEDEX", 3: "LOGGI", 17: "Mini Envios" };

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    /* tabela pode não existir em base anterior à v3.12.0 */
    const { rows: exists } = await client.query(`SELECT to_regclass('public.shipments') AS t`);
    if (!exists[0]?.t) {
      await client.query("COMMIT");
      console.log("ℹ️  Tabela shipments ainda não existe — rode drizzle-kit push antes.");
      return;
    }

    /* ---------- 1. medidas de produto ---------- */
    const dims = await client.query(`
      UPDATE products
         SET ship_weight = CASE WHEN ship_weight IS NULL OR ship_weight::numeric < 0 THEN 0 ELSE ship_weight END,
             ship_height = CASE WHEN ship_height IS NULL OR ship_height::numeric < 0 THEN 0 ELSE ship_height END,
             ship_width  = CASE WHEN ship_width  IS NULL OR ship_width::numeric  < 0 THEN 0 ELSE ship_width  END,
             ship_length = CASE WHEN ship_length IS NULL OR ship_length::numeric < 0 THEN 0 ELSE ship_length END
       WHERE ship_weight IS NULL OR ship_weight::numeric < 0
          OR ship_height IS NULL OR ship_height::numeric < 0
          OR ship_width  IS NULL OR ship_width::numeric  < 0
          OR ship_length IS NULL OR ship_length::numeric < 0
    `);

    /* ---------- 2. nome do serviço ---------- */
    let named = 0;
    for (const [id, name] of Object.entries(SERVICE_NAMES)) {
      const r = await client.query(
        `UPDATE shipments SET service_name = $2,
                carrier = COALESCE(NULLIF(trim(carrier), ''), $3)
          WHERE service_id = $1 AND (service_name IS NULL OR trim(service_name) = '')`,
        [Number(id), name, name === "LOGGI" ? "Loggi" : "Correios"]
      );
      named += r.rowCount;
    }

    /* ---------- 3. religar envio ↔ entrega ---------- */
    const linked = await client.query(`
      UPDATE shipments s
         SET delivery_id = d.id
        FROM deliveries d
       WHERE s.delivery_id IS NULL
         AND s.order_id IS NOT NULL
         AND d.order_id = s.order_id
    `);

    /* ---------- 4. status de entrega do pedido ---------- */
    const synced = await client.query(`
      UPDATE orders o
         SET delivery_status = CASE s.status
               WHEN 'pago'        THEN 'separado'
               WHEN 'postado'     THEN 'em_rota'
               WHEN 'em_transito' THEN 'em_rota'
               WHEN 'entregue'    THEN 'entregue'
               WHEN 'cancelado'   THEN 'cancelado'
               ELSE o.delivery_status
             END,
             updated_at = now()
        FROM shipments s
       WHERE s.order_id = o.id
         AND o.status <> 'cancelado'
         AND s.status IN ('pago','postado','em_transito','entregue','cancelado')
    `);

    /* ---------- 5. despesa de etiquetas pagas ---------- */
    const expenses = await client.query(
      `
      INSERT INTO transactions
        (type, category, description, amount, due_date, paid_date, status, method,
         customer_id, order_id, sale_id, automatic, notes, created_at)
      SELECT 'despesa',
             'frete',
             'Etiqueta ' || COALESCE(NULLIF(s.service_name,''),'SuperFrete') ||
               ' · envio #' || s.id ||
               COALESCE(' · ' || s.tracking_code, ''),
             s.price,
             ((s.created_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date,
             CASE WHEN s.paid_at IS NOT NULL
                  THEN ((s.paid_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date END,
             CASE WHEN s.paid_at IS NOT NULL THEN 'pago'::tx_status ELSE 'pendente'::tx_status END,
             'SuperFrete',
             s.customer_id,
             s.order_id,
             s.sale_id,
             true,
             'Lançamento reconstruído por repair-shipping.',
             s.created_at
        FROM shipments s
       WHERE s.status IN ('pago','postado','em_transito','entregue')
         AND s.price::numeric > 0
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
            WHERE t.category = 'frete'
              AND t.description LIKE '%envio #' || s.id || '%'
         )
      RETURNING id
    `,
      [TZ]
    );

    /* ---------- 6. carrinhos abandonados ---------- */
    const stale = await client.query(`
      UPDATE shipments
         SET status = 'erro',
             last_error = COALESCE(last_error, 'Carrinho abandonado há mais de 7 dias sem pagamento.'),
             updated_at = now()
       WHERE status = 'no_carrinho'
         AND created_at < now() - interval '7 days'
    `);

    await client.query("COMMIT");
    console.log(
      [
        "✅ Envios reparado:",
        `${dims.rowCount} produtos com medidas normalizadas`,
        `${named} serviços renomeados`,
        `${linked.rowCount} envios religados à entrega`,
        `${synced.rowCount} pedidos sincronizados`,
        `${expenses.rowCount} despesas de frete reconstruídas`,
        `${stale.rowCount} carrinhos abandonados`,
      ].join(" · ")
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("❌ repair-shipping falhou:", e.message);
    await pool.end();
    process.exit(1);
  });
