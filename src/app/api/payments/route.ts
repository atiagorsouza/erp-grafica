import {
  cancelCharge,
  checkPayment,
  createCharge,
  expireStale,
  getChargeSummary,
  getInfinitePayConfig,
  listCharges,
} from "@/lib/infinitepay";

export const dynamic = "force-dynamic";

/** GET /api/payments → status da integração + cobranças + resumo */
export async function GET() {
  try {
    const cfg = await getInfinitePayConfig();
    await expireStale();

    const [charges, summary] = await Promise.all([listCharges(200), getChargeSummary()]);

    return Response.json({
      ok: true,
      status: {
        configured: Boolean(cfg.handle),
        handle: cfg.handle || null,
        manualLink: cfg.handle ? `https://infinitepay.io/${cfg.handle}` : null,
        methods: cfg.methods,
        webhookUrl: cfg.webhookUrl || null,
        redirectUrl: cfg.redirectUrl || null,
        autoSettle: cfg.autoSettle,
      },
      summary,
      charges,
    });
  } catch (e) {
    console.error("[payments:GET]", e);
    return Response.json({ error: "Não foi possível carregar as cobranças" }, { status: 500 });
  }
}

/**
 * POST /api/payments
 *   { op: "create", orderId | saleId | quoteId | amount, description? }
 *   { op: "check",  id }    confirmação ativa contra a API
 *   { op: "cancel", id, reason }
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "create");
  const id = Number(body.id);
  if (["check", "cancel"].includes(op) && !Number.isFinite(id)) {
    return Response.json({ error: "id da cobrança é obrigatório" }, { status: 400 });
  }

  try {
    let result:
      | { ok: true; [k: string]: unknown }
      | { error: string; status: number; details?: unknown };

    switch (op) {
      case "create":
        result = await createCharge(body);
        break;
      case "check":
        result = await checkPayment(id);
        break;
      case "cancel":
        result = await cancelCharge(id, String(body.reason || ""));
        break;
      default:
        return Response.json({ error: "op inválido" }, { status: 400 });
    }

    if ("error" in result) {
      const err = result as { error: string; status: number; details?: unknown };
      return Response.json({ error: err.error, details: err.details }, { status: err.status });
    }
    return Response.json(result);
  } catch (e) {
    console.error("[payments:POST]", e);
    return Response.json({ error: "Falha ao processar a cobrança." }, { status: 500 });
  }
}
