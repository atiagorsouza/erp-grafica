import { createSale, cancelSale } from "@/lib/sales";

export const dynamic = "force-dynamic";

/**
 * POST /api/crud/sales
 *   { op: "cancel", id, reason }  → cancela e estorna estoque + financeiro
 *   { ...saleInput }              → cria a venda
 *
 * Toda a regra vive em `@/lib/sales` (validação Zod, recálculo dos
 * totais no servidor, conferência de estoque e transação atômica).
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    if (body.op === "cancel") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return Response.json({ error: "id obrigatório" }, { status: 400 });
      }
      const reason = String(body.reason || "").trim();
      if (reason.length < 3) {
        return Response.json({ error: "Informe o motivo do cancelamento" }, { status: 400 });
      }
      const result = await cancelSale(id, reason);
      if ("error" in result) {
        return Response.json({ error: result.error }, { status: result.status });
      }
      return Response.json(result);
    }

    const result = await createSale(body);
    if ("error" in result) {
      return Response.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }
    return Response.json(result);
  } catch (e) {
    console.error("[sales]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "erro interno" },
      { status: 500 }
    );
  }
}
