import type { Metadata } from "next";
import { db } from "@/db";
import { sales, orders, quotes, customers, products } from "@/db/schema";
import { ReportsClient } from "@/components/modules/ReportsClient";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const [saleRows, orderRows, quoteRows, customerRows, productRows] = await Promise.all([
    db.select().from(sales),
    db.select().from(orders),
    db.select().from(quotes),
    db.select().from(customers),
    db.select().from(products),
  ]);

  /* meses (6) */
  const months: { key: string; label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("pt-BR", { month: "short" }), value: 0 });
  }
  for (const s of saleRows) {
    const k = new Date(s.createdAt).toISOString().slice(0, 7);
    const m = months.find((x) => x.key === k);
    if (m) m.value += Number(s.total || 0);
  }
  for (const o of orderRows) {
    const k = new Date(o.createdAt).toISOString().slice(0, 7);
    const m = months.find((x) => x.key === k);
    if (m) m.value += Number(o.total || 0);
  }

  /* pagamento */
  const payMap = new Map<string, number>();
  for (const s of saleRows) payMap.set(s.paymentMethod || "Outro", (payMap.get(s.paymentMethod || "Outro") || 0) + Number(s.total || 0));

  /* top clientes */
  const custMap = new Map<number, number>();
  for (const o of orderRows) if (o.customerId) custMap.set(Number(o.customerId), (custMap.get(Number(o.customerId)) || 0) + Number(o.total || 0));
  for (const s of saleRows) if (s.customerId) custMap.set(Number(s.customerId), (custMap.get(Number(s.customerId)) || 0) + Number(s.total || 0));
  const topCustomers = Array.from(custMap.entries())
    .map(([id, v]) => ({ label: customerRows.find((c) => Number(c.id) === id)?.tradeName || customerRows.find((c) => Number(c.id) === id)?.name || `#${id}`, value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  /* margem por produto */
  const margins = productRows
    .filter((p) => Number(p.finalPrice || 0) > 0)
    .map((p) => ({
      label: p.name,
      value: Number(((Number(p.finalPrice) - Number(p.costSnapshot || 0)) / Number(p.finalPrice)) * 100),
      sub: `custo ${Number(p.costSnapshot || 0).toFixed(2)} → venda ${Number(p.finalPrice).toFixed(2)}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  /* funil */
  const funnel = ["rascunho", "enviado", "aprovado", "recusado", "expirado"].map((s) => ({
    label: s,
    value: quoteRows.filter((q) => q.status === s).length,
  }));

  return (
    <ReportsClient
      months={months}
      payments={Array.from(payMap.entries()).map(([label, value]) => ({ label, value }))}
      topCustomers={topCustomers}
      margins={margins}
      funnel={funnel}
      totals={{
        salesCount: saleRows.length,
        ordersCount: orderRows.length,
        quotesCount: quoteRows.length,
        avgTicket: saleRows.length ? saleRows.reduce((s, r) => s + Number(r.total || 0), 0) / saleRows.length : 0,
        revenue: saleRows.reduce((s, r) => s + Number(r.total || 0), 0) + orderRows.reduce((s, r) => s + Number(r.total || 0), 0),
        conversion: quoteRows.length ? Math.round((quoteRows.filter((q) => q.status === "aprovado").length / quoteRows.length) * 100) : 0,
      }}
    />
  );
}
