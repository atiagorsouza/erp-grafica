import { handleWebhook, type WebhookPayload } from "@/lib/infinitepay";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhook — chamado pela InfinitePay quando o
 * pagamento é aprovado.
 *
 * SEGURANÇA
 * ---------
 * A InfinitePay NÃO assina o webhook (não há HMAC nem token no header).
 * Tratar o corpo como verdade permitiria a qualquer pessoa marcar
 * pedidos como pagos com um simples POST.
 *
 * Por isso este endpoint apenas registra o aviso e dispara uma
 * confirmação ativa em `payment_check`. Quem dá a baixa é a resposta
 * da API, nunca o corpo recebido aqui.
 *
 * Contrato da InfinitePay: responder 200 rápido (< 1s) para confirmar.
 * Se responder 400, eles reenviam — então erro de processamento nosso
 * devolve 400 de propósito, para haver nova tentativa.
 */
export async function POST(req: Request) {
  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const result = await handleWebhook(payload);

    if ("error" in result) {
      /* 404 = order_nsu desconhecido (possível tentativa forjada).
         Respondemos 200 para a InfinitePay não reenviar algo que nunca
         vai existir — mas nada é gravado. */
      if (result.status === 404) {
        console.warn("[payments:webhook] order_nsu desconhecido:", payload.order_nsu);
        return Response.json({ ok: true, ignored: true, reason: "unknown_order_nsu" });
      }
      /* A cobrança existe, mas o payment_check não confirmou. Pode ser
         atraso da adquirente (vale reenviar) ou aviso forjado. */
      console.warn("[payments:webhook] não confirmado:", payload.order_nsu, result.error);
      return Response.json(
        { ok: false, verified: false, reason: "not_confirmed_by_api", error: result.error },
        { status: 400 }
      );
    }

    return Response.json({ ok: true, verified: result.verified });
  } catch (e) {
    console.error("[payments:webhook]", e);
    /* 400 faz a InfinitePay reenviar depois */
    return Response.json({ error: "Falha ao processar" }, { status: 400 });
  }
}

/** GET — usado para validar a URL ao configurar a integração. */
export async function GET() {
  return Response.json({
    ok: true,
    endpoint: "infinitepay-webhook",
    note: "Todo aviso é reconferido via payment_check antes da baixa.",
  });
}
