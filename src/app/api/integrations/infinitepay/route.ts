import { createCharge, getInfinitePayConfig } from "@/lib/infinitepay";

export const dynamic = "force-dynamic";

/**
 * COMPATIBILIDADE — rota legada mantida para integrações externas.
 *
 * Até a v3.12.0 este arquivo tinha a lógica inteira, com o contrato
 * ERRADO: enviava `Authorization: Bearer <handle>` e `{ amount }`, e a
 * API respondia 400 "param is missing: handle". Nunca funcionou — e
 * nada no sistema o chamava.
 *
 * A partir da v3.13.0 a regra vive em `@/lib/infinitepay`. Para novas
 * integrações use `/api/payments`.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const result = await createCharge({
    amount: body.amount,
    description: body.description,
    orderId: body.orderId,
    saleId: body.saleId,
    customerId: body.customerId,
  });

  if ("error" in result) {
    const cfg = await getInfinitePayConfig();
    return Response.json(
      {
        ok: false,
        error: result.error,
        fallback: cfg.handle
          ? {
              manualLink: `https://infinitepay.io/${cfg.handle}`,
              amount: Number(body.amount || 0),
              hint: `Use o link manual e informe R$ ${Number(body.amount || 0).toFixed(2)}`,
            }
          : undefined,
      },
      { status: result.status }
    );
  }

  return Response.json({
    ok: true,
    paymentLink: result.row.checkoutUrl,
    id: result.row.id,
    orderNsu: result.row.orderNsu,
    amount: Number(result.row.amount),
    description: result.row.description,
    expiresAt: result.row.expiresAt,
  });
}

/** GET — status da integração + link manual */
export async function GET() {
  const cfg = await getInfinitePayConfig();
  return Response.json({
    module: "infinitepay",
    configured: Boolean(cfg.handle),
    handle: cfg.handle || null,
    manualLink: cfg.handle ? `https://infinitepay.io/${cfg.handle}` : null,
    methods: cfg.methods,
    docs: "https://www.infinitepay.io/checkout-documentacao",
  });
}
