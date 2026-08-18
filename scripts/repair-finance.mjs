// PrintFlow ERP · reparo do módulo Financeiro
//
// Normaliza dados legados criados antes da v3.11.0, quando a API de
// transactions era um CRUD cru sem validação:
//   1. valores nulos/negativos
//   2. categorias em formatos diferentes ("Vendas" vs "venda")
//   3. status "atrasado" que nunca era atribuído
//   4. coerência status × paid_date
//   5. religa lançamentos órfãos aos documentos (sale/order/purchase)
//   6. marca como automáticos os lançamentos gerados pelo sistema
//   7. cria a despesa das compras já recebidas que nunca lançaram
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

    /* ---------- 1. valores inválidos ---------- */
    const amounts = await client.query(`
      UPDATE transactions
         SET amount = 0
       WHERE amount IS NULL OR amount::numeric < 0
    `);

    /* ---------- 2. descrição vazia ---------- */
    const descriptions = await client.query(`
      UPDATE transactions
         SET description = 'Lançamento sem descrição #' || id
       WHERE description IS NULL OR trim(description) = ''
    `);

    /* ---------- 3. categorias canônicas ---------- */
    const categories = await client.query(`
      UPDATE transactions
         SET category = CASE
           WHEN category IS NULL OR trim(category) = '' THEN 'geral'
           WHEN lower(unaccent_fallback(category)) IN ('venda','vendas','pdv') THEN 'venda'
           WHEN lower(unaccent_fallback(category)) IN ('pedido','pedidos','os') THEN 'pedido'
           WHEN lower(unaccent_fallback(category)) IN ('servico','servicos') THEN 'servico'
           WHEN lower(unaccent_fallback(category)) IN ('insumo','insumos') THEN 'insumo'
           WHEN lower(unaccent_fallback(category)) IN ('compra','compras') THEN 'compra'
           WHEN lower(unaccent_fallback(category)) IN ('energia','luz') THEN 'energia'
           WHEN lower(unaccent_fallback(category)) IN ('salario','salarios') THEN 'salario'
           WHEN lower(unaccent_fallback(category)) IN ('imposto','impostos') THEN 'imposto'
           WHEN lower(unaccent_fallback(category)) IN ('taxa','cartao','taxa_cartao') THEN 'taxa_cartao'
           ELSE regexp_replace(lower(unaccent_fallback(category)), '[^a-z0-9]+', '_', 'g')
         END
       WHERE category IS DISTINCT FROM CASE
           WHEN category IS NULL OR trim(category) = '' THEN 'geral'
           WHEN lower(unaccent_fallback(category)) IN ('venda','vendas','pdv') THEN 'venda'
           WHEN lower(unaccent_fallback(category)) IN ('pedido','pedidos','os') THEN 'pedido'
           WHEN lower(unaccent_fallback(category)) IN ('servico','servicos') THEN 'servico'
           WHEN lower(unaccent_fallback(category)) IN ('insumo','insumos') THEN 'insumo'
           WHEN lower(unaccent_fallback(category)) IN ('compra','compras') THEN 'compra'
           WHEN lower(unaccent_fallback(category)) IN ('energia','luz') THEN 'energia'
           WHEN lower(unaccent_fallback(category)) IN ('salario','salarios') THEN 'salario'
           WHEN lower(unaccent_fallback(category)) IN ('imposto','impostos') THEN 'imposto'
           WHEN lower(unaccent_fallback(category)) IN ('taxa','cartao','taxa_cartao') THEN 'taxa_cartao'
           ELSE regexp_replace(lower(unaccent_fallback(category)), '[^a-z0-9]+', '_', 'g')
         END
    `);

    /* ---------- 4. vencimento ausente ---------- */
    const dueDates = await client.query(`
      UPDATE transactions
         SET due_date = ((created_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date
       WHERE due_date IS NULL
    `, [TZ]);

    /* ---------- 5. coerência status × datas ---------- */
    const paidWithoutDate = await client.query(`
      UPDATE transactions
         SET paid_date = COALESCE(due_date, ((created_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date)
       WHERE status = 'pago' AND paid_date IS NULL
    `, [TZ]);

    const openWithPaidDate = await client.query(`
      UPDATE transactions
         SET paid_date = NULL
       WHERE status <> 'pago' AND paid_date IS NOT NULL
    `);

    /* ---------- 6. religar lançamentos órfãos ---------- */
    const linkSales = await client.query(`
      UPDATE transactions t
         SET sale_id = s.id, automatic = true
        FROM sales s
       WHERE t.sale_id IS NULL
         AND t.category IN ('venda','taxa_cartao','estorno','estorno_taxa')
         AND t.description LIKE '%' || s.number || '%'
    `);

    const linkOrders = await client.query(`
      UPDATE transactions t
         SET order_id = o.id, automatic = true
        FROM orders o
       WHERE t.order_id IS NULL
         AND t.category IN ('pedido','estorno_pedido')
         AND t.description ~ ('(^|[^0-9A-Za-z-])' || o.number || '([^0-9]|$)')
    `);

    const linkPurchases = await client.query(`
      UPDATE transactions t
         SET purchase_id = p.id, automatic = true
        FROM purchases p
       WHERE t.purchase_id IS NULL
         AND t.category = 'compra'
         AND t.description ~ ('(^|[^0-9A-Za-z-])' || p.number || '([^0-9]|$)')
    `);

    /* ---------- 7. marcar automáticos ---------- */
    const autos = await client.query(`
      UPDATE transactions
         SET automatic = true
       WHERE automatic = false
         AND (sale_id IS NOT NULL OR order_id IS NOT NULL
              OR purchase_id IS NOT NULL OR cash_session_id IS NOT NULL)
    `);

    /* ---------- 8. despesa das compras já recebidas ---------- */
    const missingPurchases = await client.query(`
      INSERT INTO transactions
        (type, category, description, amount, due_date, status, method,
         purchase_id, automatic, notes, created_at)
      SELECT 'despesa',
             'compra',
             'Compra ' || p.number || COALESCE(' — ' || s.name, ''),
             p.total,
             COALESCE(p.expected_date, ((p.received_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date,
                      ((p.created_at AT TIME ZONE 'UTC') AT TIME ZONE $1)::date),
             'pendente',
             NULL,
             p.id,
             true,
             'Lançamento reconstruído por repair-finance.',
             p.created_at
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.status = 'recebido'
         AND p.total::numeric > 0
         AND NOT EXISTS (
           SELECT 1 FROM transactions t WHERE t.purchase_id = p.id AND t.category = 'compra'
         )
      RETURNING id
    `, [TZ]);

    /* ---------- 9. status atrasado ---------- */
    const overdue = await client.query(`
      UPDATE transactions
         SET status = 'atrasado'
       WHERE archived_at IS NULL
         AND status = 'pendente'
         AND due_date IS NOT NULL
         AND due_date < (now() AT TIME ZONE $1)::date
    `, [TZ]);

    /* ---------- 10. vencidos que foram pagos voltam a pendente correto ---------- */
    const backToPending = await client.query(`
      UPDATE transactions
         SET status = 'pendente'
       WHERE archived_at IS NULL
         AND status = 'atrasado'
         AND (due_date IS NULL OR due_date >= (now() AT TIME ZONE $1)::date)
    `, [TZ]);

    await client.query("COMMIT");

    console.log(
      [
        "✅ Financeiro reparado:",
        `${amounts.rowCount} valores inválidos`,
        `${descriptions.rowCount} descrições`,
        `${categories.rowCount} categorias normalizadas`,
        `${dueDates.rowCount} vencimentos`,
        `${paidWithoutDate.rowCount + openWithPaidDate.rowCount} datas de pagamento`,
        `${linkSales.rowCount} vínculos de venda`,
        `${linkOrders.rowCount} vínculos de pedido`,
        `${linkPurchases.rowCount} vínculos de compra`,
        `${autos.rowCount} marcados como automáticos`,
        `${missingPurchases.rowCount} despesas de compra reconstruídas`,
        `${overdue.rowCount} marcados como atrasados`,
        `${backToPending.rowCount} devolvidos a pendente`,
      ].join(" · ")
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/* `unaccent` é extensão opcional; usamos uma função equivalente e portátil. */
async function ensureHelpers() {
  await pool.query(`
    CREATE OR REPLACE FUNCTION unaccent_fallback(txt text) RETURNS text AS $$
      SELECT translate(
        COALESCE($1, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
      );
    $$ LANGUAGE sql IMMUTABLE;
  `);
}

ensureHelpers()
  .then(main)
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("❌ repair-finance falhou:", e.message);
    await pool.end();
    process.exit(1);
  });
