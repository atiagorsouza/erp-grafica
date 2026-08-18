import { db } from "@/db";
import { orders, quotes, quoteItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createOrder } from "@/lib/orders";
import { toNumber } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Converte orçamento aprovado em Pedido/OS. Idempotente por quoteId. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const quoteId = Number(body.quoteId);
  if (!quoteId) return Response.json({ error: "quoteId obrigatório" }, { status: 400 });

  try {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
    if (!quote) return Response.json({ error: "Orçamento não encontrado" }, { status: 404 });
    if (quote.status !== "aprovado") {
      return Response.json({ error: "Apenas orçamentos aprovados podem virar pedido" }, { status: 409 });
    }

    const [existing] = await db.select().from(orders).where(eq(orders.quoteId, quoteId));
    if (existing) return Response.json({ ok: true, order: existing, existing: true });

    const rawItems = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    const items = rawItems.map((it) => ({
      productId: it.productId,
      serviceId: it.serviceId,
      description: it.description,
      quantity: toNumber(it.quantity, 1),
      unitPrice: toNumber(it.unitPrice, 0),
    }));

    const payMethod = String(quote.paymentMethod || "");
    const financialStatus =
      payMethod.includes("50%") || payMethod === "Boleto"
        ? "parcial"
        : payMethod === "Crédito"
          ? "pendente"
          : "pago";

    /* A partir daqui o índice único `orders_one_per_quote_idx` é a
       autoridade: se duas conversões correrem juntas, uma insere e a
       outra estoura violação — tratada no catch abaixo. */
    const result = await createOrder({
      quoteId,
      customerId: quote.customerId,
      status: "confirmado",
      productionStatus: "aguardando",
      artStatus: "nao_enviada",
      deliveryStatus: "a_definir",
      financialStatus,
      priority: "normal",
      dueDate: quote.validUntil || null,
      items,
      discount: toNumber(quote.discount, 0),
      shippingFee: toNumber(quote.shippingFee, 0),
      taxes: toNumber(quote.taxes, 0),
      paymentMethod: quote.paymentMethod || "A definir",
      channel: quote.channel || "Atendimento",
      sellerName: quote.sellerName || "OPERADOR",
      notes: quote.notes,
    });

    if ("error" in result) {
      return Response.json({ error: result.error, details: result.details }, { status: result.status });
    }

    return Response.json({ ok: true, order: result.row, existing: false });
  } catch (e) {
    /* Corrida perdida: outra requisição converteu o mesmo orçamento
       primeiro. Não é erro para o usuário — devolvemos o pedido que
       venceu, como se a chamada tivesse sido idempotente.
       O Drizzle embrulha o erro do pg, então olhamos também em `cause`. */
    const raw = `${String(e)} ${String((e as { cause?: unknown })?.cause ?? "")}`;
    if (raw.includes("orders_one_per_quote_idx") || raw.includes("duplicate key")) {
      const [winner] = await db.select().from(orders).where(eq(orders.quoteId, quoteId));
      if (winner) return Response.json({ ok: true, order: winner, existing: true });
      return Response.json(
        { error: "Este orçamento já está sendo convertido. Atualize a página." },
        { status: 409 }
      );
    }

    console.error("[orders/convert]", e);
    return Response.json(
      { error: "Não foi possível converter o orçamento em pedido." },
      { status: 500 }
    );
  }
}
