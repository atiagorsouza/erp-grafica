import { db } from "@/lib/crud";
import { stockMovements } from "@/db/schema";
import { createStockMovement, deleteStockMovement } from "@/lib/stock";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";
function jsonResult(result: unknown) { const m = result as { error?: string; status?: number }; return m.error ? Response.json(result, { status: m.status || 400 }) : Response.json(result); }
export async function GET() {
  const rows = await db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(200);
  return Response.json({ ok: true, rows });
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "JSON inválido" }, { status: 400 });
  const op = String(body.op || ""); const id = Number(body.id); const data = body.data || {};
  try {
    if (op === "create") return jsonResult(await createStockMovement(data));
    if (op === "delete") { if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 }); return jsonResult(await deleteStockMovement(id)); }
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[stock-movements]", e);
    const message = e instanceof Error ? e.message : "erro interno";
    const status = message.includes("Saldo insuficiente") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
