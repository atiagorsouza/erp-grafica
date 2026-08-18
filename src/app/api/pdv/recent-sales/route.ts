import { db } from "@/db";
import { sales, customers } from "@/db/schema";
import { desc, eq, gte, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/pdv/recent-sales?limit=20
 *
 * Últimas vendas do PDV para reimpressão de cupom e cancelamento
 * pelo operador. Devolve o suficiente para remontar o cupom térmico
 * sem uma segunda chamada.
 *
 * Recorta as últimas 24h: o balcão só precisa do movimento recente e
 * isso mantém a resposta pequena mesmo em bases grandes.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        id: sales.id,
        number: sales.number,
        total: sales.total,
        subtotal: sales.subtotal,
        discount: sales.discount,
        cardFee: sales.cardFee,
        paymentMethod: sales.paymentMethod,
        payments: sales.payments,
        receivedAmount: sales.receivedAmount,
        changeAmount: sales.changeAmount,
        status: sales.status,
        items: sales.items,
        sellerName: sales.sellerName,
        deliveryMode: sales.deliveryMode,
        deliveryDate: sales.deliveryDate,
        notes: sales.notes,
        cancelReason: sales.cancelReason,
        createdAt: sales.createdAt,
        customerId: sales.customerId,
        customerName: customers.name,
        customerDocument: customers.document,
        customerPhone: customers.phone,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(and(gte(sales.createdAt, since)))
      .orderBy(desc(sales.createdAt))
      .limit(limit);

    return Response.json({ ok: true, sales: rows });
  } catch (e) {
    console.error("[pdv/recent-sales]", e);
    return Response.json(
      { ok: false, error: "Não foi possível carregar as últimas vendas." },
      { status: 500 }
    );
  }
}
