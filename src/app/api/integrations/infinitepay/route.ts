import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getSetting(key: string): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value || "";
}

/**
 * POST /api/integrations/infinitepay
 * Cria link de pagamento via InfinityPay Checkout Integrado
 * Body: { amount, description, customerName, customerDoc, items?, redirect_url? }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const handle = process.env.INFINITEPAY_HANDLE || await getSetting("infinitepay_handle");

  if (!handle) {
    return Response.json({
      error: "InfinityPay Handle não configurado. Configure em Painel de Controle → InfinityPay ou env INFINITEPAY_HANDLE.",
    }, { status: 503 });
  }

  const amount = Number(body.amount || 0);
  if (amount <= 0) {
    return Response.json({ error: "Valor deve ser maior que zero" }, { status: 400 });
  }

  const description = String(body.description || "Pagamento PrintFlow ERP");
  const customerName = String(body.customerName || body.customer_name || "");
  const customerDoc = String(body.customerDoc || body.customer_doc || "");

  try {
    // API InfinityPay Checkout Integrado — endpoint oficial 2026
    const res = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${handle}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // centavos
        description,
        customer: customerName ? {
          name: customerName,
          document: customerDoc.replace(/\D/g, "") || undefined,
        } : undefined,
        items: body.items || [{ description, quantity: 1, unit_price: Math.round(amount * 100) }],
        redirect_url: body.redirect_url || undefined,
        webhook_url: body.webhook_url || undefined,
        methods: body.methods || ["pix", "credit_card"],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Fallback: gerar link manual se API não responder
      const manualLink = `https://infinitepay.io/${handle}`;
      return Response.json({
        ok: false,
        error: data.message || data.error || "Erro InfinityPay",
        fallback: {
          manualLink,
          amount,
          description,
          hint: `Use o link manual: ${manualLink} e informe R$${amount.toFixed(2)}`,
        },
      }, { status: res.status });
    }

    return Response.json({
      ok: true,
      paymentLink: data.url || data.payment_url || data.link,
      id: data.id,
      amount,
      description,
      methods: data.methods || ["pix", "credit_card"],
      expiresAt: data.expires_at || null,
    });
  } catch (e) {
    const manualLink = `https://infinitepay.io/${handle}`;
    return Response.json({
      error: e instanceof Error ? e.message : "Falha na requisição InfinityPay",
      fallback: { manualLink, amount, description },
    }, { status: 500 });
  }
}

/** GET — status da integração + link manual */
export async function GET() {
  const handle = process.env.INFINITEPAY_HANDLE || await getSetting("infinitepay_handle");
  return Response.json({
    module: "infinitepay",
    configured: !!handle,
    handle: handle || null,
    manualLink: handle ? `https://infinitepay.io/${handle}` : null,
    methods: ["pix", "credit_card"],
    docs: "https://api.checkout.infinitepay.io",
  });
}
