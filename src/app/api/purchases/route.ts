import { createPurchase, receivePurchase } from "@/lib/stock";

export const dynamic = "force-dynamic";
function jsonResult(result: unknown) { const m = result as { error?: string; status?: number }; return m.error ? Response.json(result, { status: m.status || 400 }) : Response.json(result); }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "JSON inválido" }, { status: 400 });
  const op = String(body.op || "");
  try {
    if (op === "create") return jsonResult(await createPurchase(body.data || {}));
    if (op === "receive") return jsonResult(await receivePurchase(Number(body.purchaseId)));
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) { console.error("[purchases]", e); return Response.json({ error: e instanceof Error ? e.message : "erro interno" }, { status: 500 }); }
}
