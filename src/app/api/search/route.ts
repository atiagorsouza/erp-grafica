import { db } from "@/db";
import { customers, products, orders, quotes } from "@/db/schema";
import { ilike, or, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (q.length < 2) return Response.json({ results: [] });
  const term = `%${q}%`;
  try {
    const [customerRows, productRows, orderRows, quoteRows] = await Promise.all([
      db.select({ id: customers.id, name: customers.name, tradeName: customers.tradeName, document: customers.document })
        .from(customers)
        .where(or(
          ilike(customers.name, term),
          ilike(customers.tradeName, term),
          ilike(customers.document, term),
          /* IE e contato PJ: o cliente que liga nem sempre tem o CNPJ
             à mão, mas tem a inscrição na nota ou o nome de quem
             fez o pedido. */
          ilike(customers.stateRegistration, term),
          ilike(customers.municipalRegistration, term),
          ilike(customers.contactName, term),
        ))
        .limit(5),
      db.select({ id: products.id, name: products.name, sku: products.sku, finalPrice: products.finalPrice })
        .from(products)
        .where(or(ilike(products.name, term), ilike(products.sku, term)))
        .limit(5),
      db.select({ id: orders.id, number: orders.number, status: orders.status, total: orders.total })
        .from(orders)
        .where(ilike(orders.number, term))
        .orderBy(desc(orders.createdAt))
        .limit(5),
      db.select({ id: quotes.id, number: quotes.number, status: quotes.status, total: quotes.total })
        .from(quotes)
        .where(ilike(quotes.number, term))
        .orderBy(desc(quotes.createdAt))
        .limit(5),
    ]);
    const results = [
      ...customerRows.map((row) => ({ type: "cliente", icon: "👥", label: row.tradeName || row.name, detail: row.document || "Cliente", href: `/clientes?id=${row.id}` })),
      ...productRows.map((row) => ({ type: "produto", icon: "🏷️", label: row.name, detail: `${row.sku || "PRO"} · R$ ${Number(row.finalPrice || 0).toFixed(2)}`, href: `/produtos` })),
      ...orderRows.map((row) => ({ type: "pedido", icon: "📋", label: row.number, detail: `${row.status} · R$ ${Number(row.total || 0).toFixed(2)}`, href: `/pedidos` })),
      ...quoteRows.map((row) => ({ type: "orçamento", icon: "📄", label: row.number, detail: `${row.status} · R$ ${Number(row.total || 0).toFixed(2)}`, href: `/orcamentos` })),
    ];
    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}
