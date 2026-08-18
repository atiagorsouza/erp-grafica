import { db } from "@/db";
import {
  sales,
  orders,
  crmLeads,
  productionSchedules,
  quotes,
  customers,
  materials,
  printers,
  printerCategories,
  transactions,
  products,
} from "@/db/schema";
import { desc, asc, isNull } from "drizzle-orm";
import { toLocalISODate, lastDays } from "@/lib/period";
import { DashboardClient } from "@/components/modules/DashboardClient";
import { upcomingBirthdays } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [salesRows, orderRows, leadRows, scheduleRows, quoteRows, customerRows, materialRows, printerRows, catRows, txRows, productRows] =
    await Promise.all([
      db.select().from(sales).orderBy(desc(sales.createdAt)),
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt)),
      db.select().from(productionSchedules).orderBy(asc(productionSchedules.scheduledDate)),
      db.select().from(quotes).orderBy(desc(quotes.createdAt)),
      db.select().from(customers),
      db.select().from(materials),
      db.select().from(printers).orderBy(asc(printers.name)),
      db.select().from(printerCategories),
      db.select().from(transactions).where(isNull(transactions.archivedAt)),
      db.select().from(products),
    ]);

  /* ── série de faturamento (14 dias) ──
     Datas no fuso da loja e SEM vendas canceladas (v3.11.0): antes o
     corte era em UTC e venda após 21h caía no dia seguinte. */
  const validSales = salesRows.filter((s) => s.status !== "cancelada");
  const dayKey = (d: Date | string) => toLocalISODate(d);
  const perDay = new Map<string, number>();
  for (const day of lastDays(14)) perDay.set(day.key, 0);
  for (const s of validSales) {
    const k = dayKey(s.createdAt);
    if (perDay.has(k)) perDay.set(k, (perDay.get(k) || 0) + Number(s.total || 0));
  }
  const todayK = toLocalISODate(new Date());
  const series14 = Array.from(perDay.entries()).map(([k, v]) => {
    const d = new Date(`${k}T12:00:00Z`);
    return {
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "UTC" }),
      value: Math.round(v * 100) / 100,
      hint: `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })} · R$ ${v.toFixed(2)}`,
    };
  });
  const revenue14 = series14.reduce((s, d) => s + d.value, 0);
  const todayRevenue = perDay.get(todayK) || 0;

  /* ── KPIs ── */
  const totalRevenue = validSales.reduce((s, r) => s + Number(r.total || 0), 0);
  const avgTicket = validSales.length ? totalRevenue / validSales.length : 0;
  const pendingReceivable = txRows
    .filter((t) => t.type === "receita" && t.status !== "pago")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const openQuotes = quoteRows.filter((q) => q.status === "rascunho" || q.status === "enviado").length;
  const approvedQuotes = quoteRows.filter((q) => q.status === "aprovado").length;
  const conversion = quoteRows.length ? Math.round((approvedQuotes / quoteRows.length) * 100) : 0;
  const inProduction = orderRows.filter(
    (o) => o.status !== "cancelado" && o.status !== "concluido"
  ).length;
  const lowStock = materialRows.filter((m) => Number(m.stock) <= Number(m.minStock || 0));
  const activeCustomers = customerRows.filter((c) => c.status === "ativo").length;

  /* ── produção por status ── */
  const prodStatus: Record<string, number> = {};
  for (const o of orderRows) prodStatus[o.productionStatus] = (prodStatus[o.productionStatus] || 0) + 1;

  /* ── pipeline ── */
  const pipeline: Record<string, number> = {};
  let pipelineValue = 0;
  for (const l of leadRows) {
    pipeline[l.column] = (pipeline[l.column] || 0) + 1;
    if (l.column !== "ganho" && l.column !== "perdido") pipelineValue += Number(l.expectedValue || 0);
  }

  /* ── agenda de hoje ── */
  const agendaToday = scheduleRows.filter((s) => s.scheduledDate === todayK);

  const catsById = new Map(catRows.map((c) => [c.id, c]));

  return (
    <DashboardClient
      kpis={{
        revenue14,
        todayRevenue,
        avgTicket,
        totalSales: salesRows.length,
        pendingReceivable,
        customers: customerRows.length,
        activeCustomers,
        products: productRows.length,
        openQuotes,
        conversion,
        inProduction,
        lowStockCount: lowStock.length,
        pipelineValue,
        totalRevenue,
      }}
      series14={series14}
      production={Object.entries(prodStatus).map(([k, v]) => ({ label: k, value: v }))}
      pipeline={Object.entries(pipeline).map(([k, v]) => ({ label: k, value: v }))}
      fleet={printerRows.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        status: p.status,
        category: catsById.get(p.categoryId)?.name ?? "—",
        color: catsById.get(p.categoryId)?.color ?? "#0891b2",
        icon: catsById.get(p.categoryId)?.icon ?? "🖨️",
      }))}
      lowStock={lowStock.slice(0, 6).map((m) => ({
        id: m.id,
        name: m.name,
        stock: Number(m.stock),
        min: Number(m.minStock || 0),
        unit: m.unit || "un",
      }))}
      birthdays={upcomingBirthdays(customerRows)}
      recentQuotes={quoteRows.slice(0, 6).map((q) => ({
        id: q.id,
        number: q.number,
        status: q.status,
        total: Number(q.total || 0),
        createdAt: q.createdAt.toISOString(),
      }))}
      recentOrders={orderRows.slice(0, 6).map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        productionStatus: o.productionStatus,
        total: Number(o.total || 0),
        dueDate: o.dueDate,
        priority: o.priority || "normal",
      }))}
      agendaToday={agendaToday.map((s) => ({
        id: s.id,
        title: s.title,
        startTime: s.startTime || "—",
        estimatedMinutes: s.estimatedMinutes || 0,
        status: s.status,
        printer: printerRows.find((p) => p.id === s.printerId)?.name,
      }))}
    />
  );
}
