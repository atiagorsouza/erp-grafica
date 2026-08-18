import "server-only";

/* ====================================================================
 *  REPORTS — agregação do módulo Relatórios
 * ====================================================================
 *
 *  Antes da v3.11.0 tudo era calculado dentro de `relatorios/page.tsx`:
 *  carregava sales, orders, quotes, customers e products INTEIROS e
 *  somava em JavaScript. Problemas confirmados em auditoria:
 *
 *   • vendas e pedidos CANCELADOS entravam no faturamento
 *   • agrupamento por mês em UTC jogava venda das 21h para o mês seguinte
 *   • mix de pagamento agrupava a string "PIX + Dinheiro" como se fosse
 *     uma forma de pagamento, ignorando o JSONB `payments`
 *   • margem sem clamp gerava width negativo no CSS
 *   • Relatórios não olhava `transactions` — não havia DRE nem resultado
 *
 *  Aqui a agregação é feita em SQL, com filtro de período e de status.
 * ==================================================================== */

import { db } from "@/db";
import { customers, orders, products, quotes, sales } from "@/db/schema";
import { and, eq, gte, lte, ne, sql, type SQL } from "drizzle-orm";
import { round2, toNumber } from "@/lib/money";
import { APP_TZ, lastMonths } from "@/lib/period";
import { getCategoryBreakdown, getFinanceSummary } from "@/lib/finance";

export type Range = { from: string; to: string };

/* ------------------------------------------------------------------
 *  Datas: `created_at` é `timestamp without time zone` gravado em UTC.
 *  Converter para o fuso da loja ANTES de cortar o dia/mês é o que
 *  corrige o deslocamento de fechamento.
 *
 *  O fuso entra como LITERAL, não como bind param: com `$1` o
 *  PostgreSQL não reconhece a expressão do GROUP BY como idêntica à
 *  do SELECT e recusa a query (42803). APP_TZ vem do ambiente e é
 *  sanitizado abaixo.
 * ------------------------------------------------------------------ */
const TZ_LITERAL = `'${APP_TZ.replace(/[^A-Za-z0-9_/+-]/g, "")}'`;

const localDate = (column: unknown) =>
  sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${sql.raw(TZ_LITERAL)})::date`;

const saleLocalDate = localDate(sales.createdAt);
const orderLocalDate = localDate(orders.createdAt);
const quoteLocalDate = localDate(quotes.createdAt);
const saleMonthKey = sql`to_char(${saleLocalDate}, 'YYYY-MM')`;
const orderMonthKey = sql`to_char(${orderLocalDate}, 'YYYY-MM')`;

/** Venda válida = concluída (cancelada não é faturamento). */
const validSale = eq(sales.status, "concluida");
/** Pedido válido = qualquer um que não tenha sido cancelado. */
const validOrder = ne(orders.status, "cancelado");

function saleRange(range: Range): SQL {
  return and(validSale, gte(saleLocalDate, range.from), lte(saleLocalDate, range.to)) as SQL;
}
function orderRange(range: Range): SQL {
  return and(validOrder, gte(orderLocalDate, range.from), lte(orderLocalDate, range.to)) as SQL;
}

/* ==================================================================
 *  TOTAIS DO PERÍODO
 * ================================================================== */

export async function getTotals(range: Range) {
  const [saleAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${sales.total}),0)`,
      canceled: sql<number>`0::int`,
    })
    .from(sales)
    .where(saleRange(range));

  const [canceledAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${sales.total}),0)`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.status, "cancelada"),
        gte(saleLocalDate, range.from),
        lte(saleLocalDate, range.to)
      )
    );

  const [orderAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${orders.total}),0)`,
    })
    .from(orders)
    .where(orderRange(range));

  const [quoteAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      approved: sql<number>`count(*) filter (where ${quotes.status}='aprovado')::int`,
    })
    .from(quotes)
    .where(
      and(
        gte(quoteLocalDate, range.from),
        lte(quoteLocalDate, range.to)
      )
    );

  const salesCount = Number(saleAgg?.count || 0);
  const salesTotal = round2(toNumber(saleAgg?.total, 0));
  const ordersTotal = round2(toNumber(orderAgg?.total, 0));
  const quotesCount = Number(quoteAgg?.count || 0);
  const approved = Number(quoteAgg?.approved || 0);

  return {
    salesCount,
    salesTotal,
    ordersCount: Number(orderAgg?.count || 0),
    ordersTotal,
    quotesCount,
    approvedQuotes: approved,
    /* ticket médio só sobre venda válida — cancelada não entra nem no divisor */
    avgTicket: salesCount > 0 ? round2(salesTotal / salesCount) : 0,
    revenue: round2(salesTotal + ordersTotal),
    conversion: quotesCount > 0 ? Math.round((approved / quotesCount) * 100) : 0,
    canceledCount: Number(canceledAgg?.count || 0),
    canceledTotal: round2(toNumber(canceledAgg?.total, 0)),
  };
}

/* ==================================================================
 *  FATURAMENTO POR MÊS (fuso da loja)
 * ================================================================== */

export async function getMonthlyRevenue(count = 6) {
  const months = lastMonths(count);
  const first = `${months[0].key}-01`;

  const saleRows = await db
    .select({
      key: sql<string>`${saleMonthKey}`,
      total: sql<string>`coalesce(sum(${sales.total}),0)`,
    })
    .from(sales)
    .where(and(validSale, gte(saleLocalDate, first)))
    .groupBy(saleMonthKey);

  const orderRows = await db
    .select({
      key: sql<string>`${orderMonthKey}`,
      total: sql<string>`coalesce(sum(${orders.total}),0)`,
    })
    .from(orders)
    .where(and(validOrder, gte(orderLocalDate, first)))
    .groupBy(orderMonthKey);

  const map = new Map(months.map((m) => [m.key, { pdv: 0, orders: 0 }]));
  for (const r of saleRows) {
    const slot = map.get(r.key);
    if (slot) slot.pdv = round2(toNumber(r.total, 0));
  }
  for (const r of orderRows) {
    const slot = map.get(r.key);
    if (slot) slot.orders = round2(toNumber(r.total, 0));
  }

  return months.map((m) => {
    const slot = map.get(m.key)!;
    return {
      key: m.key,
      label: m.label,
      pdv: slot.pdv,
      orders: slot.orders,
      value: round2(slot.pdv + slot.orders),
    };
  });
}

/* ==================================================================
 *  MIX DE PAGAMENTO
 *
 *  Lê o JSONB `payments` (uma linha por forma) em vez de agrupar a
 *  string concatenada "PIX + Dinheiro", que criava fatia fantasma.
 * ================================================================== */

export async function getPaymentMix(range: Range) {
  const rows = await db
    .select({
      method: sql<string>`coalesce(nullif(trim(payment->>'method'), ''), 'Outro')`,
      total: sql<string>`coalesce(sum((payment->>'amount')::numeric), 0)`,
    })
    .from(sql`${sales}, jsonb_array_elements(
      case
        when jsonb_typeof(${sales.payments}) = 'array' and jsonb_array_length(${sales.payments}) > 0
          then ${sales.payments}
        else jsonb_build_array(jsonb_build_object(
          'method', coalesce(${sales.paymentMethod}, 'Outro'),
          'amount', ${sales.total}
        ))
      end
    ) as payment`)
    .where(saleRange(range))
    .groupBy(sql`coalesce(nullif(trim(payment->>'method'), ''), 'Outro')`)
    .orderBy(sql`sum((payment->>'amount')::numeric) desc`);

  return rows
    .map((r) => ({ label: String(r.method || "Outro"), value: round2(toNumber(r.total, 0)) }))
    .filter((r) => r.value > 0);
}

/* ==================================================================
 *  TOP CLIENTES
 * ================================================================== */

export async function getTopCustomers(range: Range, limit = 6) {
  const rows = await db
    .select({
      id: customers.id,
      name: sql<string>`coalesce(nullif(${customers.tradeName}, ''), ${customers.name})`,
      total: sql<string>`
        coalesce((
          select sum(s.total) from sales s
          where s.customer_id = ${customers.id}
            and s.status = 'concluida'
            and ((s.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${sql.raw(TZ_LITERAL)})::date between ${range.from} and ${range.to}
        ), 0)
        +
        coalesce((
          select sum(o.total) from orders o
          where o.customer_id = ${customers.id}
            and o.status <> 'cancelado'
            and ((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${sql.raw(TZ_LITERAL)})::date between ${range.from} and ${range.to}
        ), 0)
      `,
    })
    .from(customers)
    .orderBy(sql`3 desc`)
    .limit(limit);

  return rows
    .map((r) => ({ label: String(r.name || `#${r.id}`), value: round2(toNumber(r.total, 0)) }))
    .filter((r) => r.value > 0);
}

/* ==================================================================
 *  MARGEM POR PRODUTO
 *
 *  Clamp em [-100, 100]: custo acima do preço gerava valor negativo,
 *  o HBars recebia width negativo, o CSS era descartado e a barra
 *  renderizava CHEIA — mostrando a pior margem como a melhor.
 * ================================================================== */

export async function getMargins(limit = 8) {
  const rows = await db
    .select({
      name: products.name,
      finalPrice: products.finalPrice,
      costSnapshot: products.costSnapshot,
    })
    .from(products)
    .where(and(eq(products.active, true), sql`${products.finalPrice}::numeric > 0`));

  return rows
    .map((p) => {
      const price = toNumber(p.finalPrice, 0);
      const cost = toNumber(p.costSnapshot, 0);
      const raw = price > 0 ? ((price - cost) / price) * 100 : 0;
      return {
        label: String(p.name),
        value: round2(Math.max(-100, Math.min(100, raw))),
        negative: raw < 0,
        sub: `custo ${cost.toFixed(2)} → venda ${price.toFixed(2)}`,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/* ==================================================================
 *  FUNIL DE ORÇAMENTOS
 * ================================================================== */

export async function getQuoteFunnel(range: Range) {
  const rows = await db
    .select({ status: quotes.status, count: sql<number>`count(*)::int` })
    .from(quotes)
    .where(
      and(
        gte(quoteLocalDate, range.from),
        lte(quoteLocalDate, range.to)
      )
    )
    .groupBy(quotes.status);

  const map = new Map(rows.map((r) => [String(r.status), Number(r.count || 0)]));
  return ["rascunho", "enviado", "aprovado", "recusado", "expirado"].map((s) => ({
    label: s,
    value: map.get(s) || 0,
  }));
}

/* ==================================================================
 *  DRE SIMPLIFICADO — a ponte que faltava com o Financeiro
 * ================================================================== */

export async function getIncomeStatement(range: Range) {
  const [summary, breakdown] = await Promise.all([
    getFinanceSummary(range),
    getCategoryBreakdown(range),
  ]);

  const revenues = breakdown.filter((b) => b.type === "receita").sort((a, b) => b.total - a.total);
  const expenses = breakdown.filter((b) => b.type === "despesa").sort((a, b) => b.total - a.total);

  const grossRevenue = round2(summary.received + summary.toReceive);
  const totalExpenses = round2(summary.expensesPaid + summary.expensesOpen);

  return {
    summary,
    revenues,
    expenses,
    grossRevenue,
    totalExpenses,
    /* competência: tudo do período, pago ou não */
    result: round2(grossRevenue - totalExpenses),
    /* caixa: só o que efetivamente entrou e saiu */
    cashResult: summary.balance,
    margin: grossRevenue > 0 ? round2(((grossRevenue - totalExpenses) / grossRevenue) * 100) : 0,
  };
}

/* ==================================================================
 *  AGREGADOR
 * ================================================================== */

export async function getReportData(range: Range) {
  const [totals, months, payments, topCustomers, margins, funnel, dre] = await Promise.all([
    getTotals(range),
    getMonthlyRevenue(6),
    getPaymentMix(range),
    getTopCustomers(range),
    getMargins(),
    getQuoteFunnel(range),
    getIncomeStatement(range),
  ]);
  return { totals, months, payments, topCustomers, margins, funnel, dre };
}
