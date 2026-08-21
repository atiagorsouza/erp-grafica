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
import { desc, asc, isNull, sql, eq } from "drizzle-orm";
import { toLocalISODate, lastDays } from "@/lib/period";
import { DashboardClient } from "@/components/modules/DashboardClient";
import { upcomingBirthdays } from "@/lib/queries";

export const dynamic = "force-dynamic";

/* v3.62.0 — a Visão Geral baixava ONZE tabelas inteiras (mais nove
   dentro de getDashboardStats) só para contar linhas, somar valores e
   mostrar os 6 mais recentes. Nada disso precisa das tabelas: o banco
   conta e soma sozinho, e é para isso que ele serve.

   O gráfico de faturamento, por exemplo, cobre 14 dias — mas eram
   carregadas todas as vendas de todos os tempos para montá-lo. */
export default async function DashboardPage() {
  const hojeLoja = toLocalISODate(new Date());
  const dias14 = lastDays(14);
  const inicio14 = dias14[0].key;

  const [
    agregVendas,
    serieVendas,
    agregPedidos,
    prodPorStatus,
    agregOrcamentos,
    orcamentosRecentes,
    pedidosRecentes,
    agregClientes,
    aniversariantesBase,
    materiaisBaixos,
    qtdMateriaisBaixos,
    printerRows,
    catRows,
    agregTx,
    pipelineRows,
    agendaRows,
    contagens,
  ] = await Promise.all([
    // Faturamento total e ticket médio (cancelada não é faturamento).
    db
      .select({
        total: sql<number>`COALESCE(SUM(${sales.total}), 0)::float8`,
        n: sql<number>`count(*)::int`,
        nTodas: sql<number>`count(*)::int`,
      })
      .from(sales)
      .where(sql`${sales.status} IS DISTINCT FROM 'cancelada'`),

    /* Série de 14 dias, agrupada no banco e no fuso da loja.
       `created_at` é `timestamp without time zone` guardando UTC, então
       é preciso declarar UTC ANTES de converter — sem isso a venda da
       noite pula para o dia seguinte, que é justamente o bug corrigido
       na v3.11.0. */
    db
      .select({
        dia: sql<string>`(${sales.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date::text`,
        total: sql<number>`COALESCE(SUM(${sales.total}), 0)::float8`,
      })
      .from(sales)
      .where(
        sql`${sales.status} IS DISTINCT FROM 'cancelada'
            AND (${sales.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${inicio14}::date`
      )
      .groupBy(sql`(${sales.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`),

    db
      .select({
        emProducao: sql<number>`count(*) FILTER (WHERE ${orders.status} <> 'cancelado' AND ${orders.status} <> 'concluido')::int`,
      })
      .from(orders),

    db
      .select({ status: orders.productionStatus, n: sql<number>`count(*)::int` })
      .from(orders)
      .groupBy(orders.productionStatus),

    db
      .select({
        abertos: sql<number>`count(*) FILTER (WHERE ${quotes.status}::text IN ('rascunho','enviado'))::int`,
        aprovados: sql<number>`count(*) FILTER (WHERE ${quotes.status}::text = 'aprovado')::int`,
        todos: sql<number>`count(*)::int`,
      })
      .from(quotes),

    db.select().from(quotes).orderBy(desc(quotes.createdAt)).limit(6),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(6),

    db
      .select({
        todos: sql<number>`count(*)::int`,
        ativos: sql<number>`count(*) FILTER (WHERE ${customers.status} = 'ativo')::int`,
      })
      .from(customers),

    /* Aniversariantes: só quem tem data cadastrada e não está fora da
       base. A janela de 7 dias continua sendo decidida em código. */
    db
      .select({
        id: customers.id,
        name: customers.name,
        tradeName: customers.tradeName,
        birthDate: customers.birthDate,
        phone: customers.phone,
        whatsapp: customers.whatsapp,
        whatsappOptOut: customers.whatsappOptOut,
        status: customers.status,
      })
      .from(customers)
      .where(
        sql`${customers.birthDate} IS NOT NULL
            AND ${customers.status} NOT IN ('inativo','bloqueado')`
      ),

    db
      .select()
      .from(materials)
      .where(sql`${materials.stock} <= COALESCE(${materials.minStock}, 0)`)
      .limit(6),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(materials)
      .where(sql`${materials.stock} <= COALESCE(${materials.minStock}, 0)`),

    db.select().from(printers).orderBy(asc(printers.name)),
    db.select().from(printerCategories),

    db
      .select({
        aReceber: sql<number>`COALESCE(SUM(${transactions.amount}) FILTER (WHERE ${transactions.type} = 'receita' AND ${transactions.status} <> 'pago'), 0)::float8`,
      })
      .from(transactions)
      .where(isNull(transactions.archivedAt)),

    db
      .select({
        coluna: crmLeads.column,
        n: sql<number>`count(*)::int`,
        valor: sql<number>`COALESCE(SUM(${crmLeads.expectedValue}), 0)::float8`,
      })
      .from(crmLeads)
      .groupBy(crmLeads.column),

    db
      .select()
      .from(productionSchedules)
      .where(eq(productionSchedules.scheduledDate, hojeLoja))
      .orderBy(asc(productionSchedules.startTime)),

    db.select({ n: sql<number>`count(*)::int` }).from(products),
  ]);

  /* ── série de faturamento (14 dias) ──
     Datas no fuso da loja e SEM vendas canceladas (v3.11.0): antes o
     corte era em UTC e venda após 21h caía no dia seguinte. */
  const porDia = new Map<string, number>();
  for (const d of dias14) porDia.set(d.key, 0);
  for (const r of serieVendas) {
    if (porDia.has(r.dia)) porDia.set(r.dia, Number(r.total) || 0);
  }
  const series14 = Array.from(porDia.entries()).map(([k, v]) => {
    const d = new Date(`${k}T12:00:00Z`);
    return {
      label: d.toLocaleDateString("pt-BR", { day: "2-digit", timeZone: "UTC" }),
      value: Math.round(v * 100) / 100,
      hint: `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })} · R$ ${v.toFixed(2)}`,
    };
  });
  const revenue14 = series14.reduce((s, d) => s + d.value, 0);
  const todayRevenue = porDia.get(hojeLoja) || 0;

  /* ── KPIs ── */
  const totalRevenue = Number(agregVendas[0]?.total ?? 0);
  const totalVendasValidas = Number(agregVendas[0]?.n ?? 0);
  const avgTicket = totalVendasValidas ? totalRevenue / totalVendasValidas : 0;
  const pendingReceivable = Number(agregTx[0]?.aReceber ?? 0);
  const openQuotes = Number(agregOrcamentos[0]?.abertos ?? 0);
  const approvedQuotes = Number(agregOrcamentos[0]?.aprovados ?? 0);
  const totalQuotes = Number(agregOrcamentos[0]?.todos ?? 0);
  const conversion = totalQuotes ? Math.round((approvedQuotes / totalQuotes) * 100) : 0;
  const inProduction = Number(agregPedidos[0]?.emProducao ?? 0);
  const lowStockCount = Number(qtdMateriaisBaixos[0]?.n ?? 0);
  const activeCustomers = Number(agregClientes[0]?.ativos ?? 0);
  const totalCustomers = Number(agregClientes[0]?.todos ?? 0);

  /* ── produção por status ── */
  const prodStatus: Record<string, number> = {};
  for (const r of prodPorStatus) prodStatus[String(r.status)] = Number(r.n);

  /* ── pipeline ── */
  const pipeline: Record<string, number> = {};
  let pipelineValue = 0;
  for (const r of pipelineRows) {
    pipeline[String(r.coluna)] = Number(r.n);
    if (r.coluna !== "ganho" && r.coluna !== "perdido") pipelineValue += Number(r.valor) || 0;
  }

  const agendaToday = agendaRows;
  const catsById = new Map(catRows.map((c) => [c.id, c]));

  return (
    <DashboardClient
      kpis={{
        revenue14,
        todayRevenue,
        avgTicket,
        /* Correção de coerência: o cartão mostrava `salesRows.length`,
           ou seja TODAS as vendas, canceladas inclusive — logo abaixo de
           um faturamento que as exclui. "25 vendas" com "R$ 549,78" não
           fechavam entre si. Agora conta só as válidas, na mesma regra
           do valor exibido ao lado. */
        totalSales: totalVendasValidas,
        pendingReceivable,
        customers: totalCustomers,
        activeCustomers,
        products: Number(contagens[0]?.n ?? 0),
        openQuotes,
        conversion,
        inProduction,
        lowStockCount,
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
      lowStock={materiaisBaixos.map((m) => ({
        id: m.id,
        name: m.name,
        stock: Number(m.stock),
        min: Number(m.minStock || 0),
        unit: m.unit || "un",
      }))}
      birthdays={upcomingBirthdays(aniversariantesBase)}
      recentQuotes={orcamentosRecentes.map((q) => ({
        id: q.id,
        number: q.number,
        status: q.status,
        total: Number(q.total || 0),
        createdAt: q.createdAt.toISOString(),
      }))}
      recentOrders={pedidosRecentes.map((o) => ({
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
