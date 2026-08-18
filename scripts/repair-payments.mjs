// PrintFlow ERP · reparo do módulo Cobranças (InfinitePay)
//
// 1. normaliza valores inválidos
// 2. expira cobranças vencidas e não pagas
// 3. religa cobranças pagas ao lançamento financeiro
// 4. cria a receita de cobranças pagas que ficaram sem lançamento
// 5. quita pedidos cujo pagamento foi confirmado
// 6. sinaliza divergência entre valor cobrado e valor pago
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TZ = process.env.APP_TZ || "America/Sao_Paulo";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: exists } = await client.query(`SELECT to_regclass('public.payment_links') AS t`);
    if (!exists[0]?.t) {
      await client.query("COMMIT");
      console.log("ℹ️  Tabela payment_links ainda não existe — rode drizzle-kit push antes.");
      return;
    }

    /* ---------- 1. valores inválidos ---------- */
    const amounts = await client.query(`
      UPDATE payment_links
         SET amount = 0
       WHERE amount IS NULL OR amount::numeric < 0
    `);

    /* ---------- 2. expiração ---------- */
    const expired = await client.query(`
      UPDATE payment_links
         SET status = 'expirado', updated_at = now()
       WHERE status = 'pendente'
         AND paid_at IS NULL
         AND expires_at IS NOT NULL
         AND expires_at < now()
    `);

    /* ---------- 3. religar ao financeiro ---------- */
    const linked = await client.query(`
      UPDATE payment_links p
         SET transaction_id = t.id
        FROM transactions t
       WHERE p.transaction_id IS NULL
         AND p.status = 'pago'
         AND t.category IN ('venda','pedido')
         AND t.status = 'pago'
         AND ((p.order_id IS NOT NULL AND t.order_id = p.order_id)
           OR (p.sale_id  IS NOT NULL AND t.sale_id  = p.sale_id))
    `);

    /* ---------- 4. receita faltante ---------- */
    const revenues = await client.query(
      `
      INSERT INTO transactions
        (type, category, description, amount, due_date, paid_date, status, method,
         customer_id, order_id, sale_id, automatic, notes, created_at)
      SELECT 'receita',
             CASE WHEN p.order_id IS NOT NULL THEN 'pedido' ELSE 'venda' END,
             p.description || ' — InfinitePay',
             COALESCE(p.paid_amount, p.amount),
             ((p.created_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date,
             ((COALESCE(p.paid_at, p.created_at) AT TIME ZONE 'UTC') AT TIME ZONE $1)::date,
             'pago',
             CASE p.capture_method
               WHEN 'pix' THEN 'PIX'
               WHEN 'credit_card' THEN 'Crédito'
               WHEN 'debit_card' THEN 'Débito'
               ELSE 'InfinitePay'
             END,
             p.customer_id,
             p.order_id,
             p.sale_id,
             true,
             'Lançamento reconstruído por repair-payments.',
             p.created_at
        FROM payment_links p
       WHERE p.status = 'pago'
         AND COALESCE(p.paid_amount, p.amount)::numeric > 0
         AND p.transaction_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
            WHERE t.status = 'pago'
              AND ((p.order_id IS NOT NULL AND t.order_id = p.order_id AND t.category = 'pedido')
                OR (p.sale_id  IS NOT NULL AND t.sale_id  = p.sale_id  AND t.category = 'venda'))
         )
      RETURNING id
    `,
      [TZ]
    );

    /* ---------- 5. quitar pedidos pagos ---------- */
    const settled = await client.query(`
      UPDATE orders o
         SET financial_status = 'pago', updated_at = now()
        FROM payment_links p
       WHERE p.order_id = o.id
         AND p.status = 'pago'
         AND o.status <> 'cancelado'
         AND o.financial_status <> 'pago'
    `);

    /* ---------- 6. divergência de valor ---------- */
    const diverged = await client.query(`
      UPDATE payment_links
         SET last_error = 'Valor pago diferente do cobrado — conferir manualmente.'
       WHERE status = 'pago'
         AND paid_amount IS NOT NULL
         AND abs(paid_amount::numeric - amount::numeric) > 0.05
         AND (last_error IS NULL OR last_error = '')
    `);

    /* ---------- 7. tarifa do checkout não lançada ---------- */
    const fees = await client.query(`
      SELECT count(*)::int AS n
        FROM payment_links p
       WHERE p.status = 'pago'
         AND COALESCE(p.provider_fee, 0)::numeric = 0
         AND p.capture_method IS NOT NULL
         AND p.capture_method <> 'pix'
    `);

    await client.query("COMMIT");
    if (Number(fees.rows[0]?.n) > 0) {
      console.log(
        `⚠️  ${fees.rows[0].n} cobrança(s) paga(s) sem tarifa registrada — use "Verificar" na tela de Cobranças para recalcular.`
      );
    }
    console.log(
      [
        "✅ Cobranças reparado:",
        `${amounts.rowCount} valores normalizados`,
        `${expired.rowCount} expiradas`,
        `${linked.rowCount} religadas ao financeiro`,
        `${revenues.rowCount} receitas reconstruídas`,
        `${settled.rowCount} pedidos quitados`,
        `${diverged.rowCount} divergências sinalizadas`,
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
    console.error("❌ repair-payments falhou:", e.message);
    await pool.end();
    process.exit(1);
  });
