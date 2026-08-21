import { createOrder, updateOrder, cancelOrder } from "@/lib/orders";
import { idValido } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crud/orders
 *   { op: "create", data }
 *   { op: "update", id, data }
 *   { op: "cancel", id, reason }
 *   { op: "delete", id }  -> cancelamento lógico, não apaga histórico
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "");
  const id = Number(body.id);
  const data = (body.data as Record<string, unknown>) || {};

  try {
    if (op === "create") {
      const result = await createOrder(data);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }

    if (op === "update") {
      if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const result = await updateOrder(id, data);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }

    if (op === "cancel" || op === "delete") {
      if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const reason = String(body.reason || data.reason || "Cancelamento solicitado");
      const result = await cancelOrder(id, reason);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    /* Mensagem genérica: o detalhe (inclusive SQL) fica no log. */
    console.error("[orders]", e);
    return Response.json(
      { error: "Não foi possível concluir a operação no pedido." },
      { status: 500 }
    );
  }
}
