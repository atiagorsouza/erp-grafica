import {
  addToCart,
  cancelShipment,
  checkoutShipment,
  getAccount,
  getSuperfreteConfig,
  listShipments,
  printLabel,
  quoteShipping,
  resyncShipment,
  trackShipment,
} from "@/lib/superfrete";

export const dynamic = "force-dynamic";

/**
 * GET /api/shipping         → status da integração + conta + envios
 * GET /api/shipping?only=account
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const only = url.searchParams.get("only");
    const cfg = await getSuperfreteConfig();

    const status = {
      configured: Boolean(cfg.token),
      environment: cfg.environment,
      sandbox: cfg.sandbox,
      cepOrigin: cfg.cepOrigin,
      package: cfg.pkg,
      autoCharge: cfg.autoCharge,
      postExpense: cfg.postExpense,
    };

    if (!cfg.token) {
      return Response.json({ ok: true, status, account: null, shipments: [] });
    }

    const account = await getAccount(cfg);
    if (only === "account") {
      return "error" in account
        ? Response.json({ ok: true, status, account: null, accountError: account.error })
        : Response.json({ ok: true, status, account: account.account });
    }

    return Response.json({
      ok: true,
      status,
      account: "error" in account ? null : account.account,
      accountError: "error" in account ? account.error : null,
      shipments: await listShipments(100),
    });
  } catch (e) {
    console.error("[shipping:GET]", e);
    return Response.json({ error: "Não foi possível carregar os envios" }, { status: 500 });
  }
}

/**
 * POST /api/shipping
 *   { op: "quote",    ... }        cotação (grátis)
 *   { op: "cart",     ... }        adiciona ao carrinho (grátis)
 *   { op: "checkout", id }         ⚠ PAGA com o saldo da conta
 *   { op: "label",    id }         imprime etiqueta
 *   { op: "track",    id }         atualiza rastreio
 *   { op: "cancel",   id, reason }
 *   { op: "sync",     id }         reprocessa entrega/financeiro
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "quote");
  const id = Number(body.id);
  const needsId = ["checkout", "label", "track", "cancel", "sync"];
  if (needsId.includes(op) && !Number.isFinite(id)) {
    return Response.json({ error: "id do envio é obrigatório" }, { status: 400 });
  }

  try {
    let result:
      | { ok: true; [k: string]: unknown }
      | { error: string; status: number; details?: unknown };

    switch (op) {
      case "quote":
        result = await quoteShipping(body);
        break;
      case "cart":
        result = await addToCart(body);
        break;
      case "checkout":
        result = await checkoutShipment(id);
        break;
      case "label":
        result = await printLabel(id);
        break;
      case "track":
        result = await trackShipment(id);
        break;
      case "cancel":
        result = await cancelShipment(id, String(body.reason || ""));
        break;
      case "sync":
        result = await resyncShipment(id);
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
    console.error("[shipping:POST]", e);
    return Response.json(
      { error: "Falha ao processar o envio. Tente novamente." },
      { status: 500 }
    );
  }
}
