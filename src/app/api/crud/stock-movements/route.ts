import { db } from "@/lib/crud";
import { stockMovements } from "@/db/schema";
import { createStockMovement, deleteStockMovement } from "@/lib/stock";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function jsonResult(result: unknown) {
  const m = result as { error?: string; status?: number };
  return m.error ? Response.json(result, { status: m.status || 400 }) : Response.json(result);
}

export async function GET() {
  const rows = await db.select().from(stockMovements).orderBy(desc(stockMovements.createdAt)).limit(200);
  return Response.json({ ok: true, rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "JSON inválido" }, { status: 400 });
  const op = String(body.op || "");
  const id = Number(body.id);
  const data = body.data || {};

  try {
    if (op === "create") {
      /* `allowAutomatic` fica de fora: só o próprio sistema (venda,
         produção, recebimento de compra) cria movimento automático,
         chamando a lib direto. Pela API, tudo é manual — senão dava
         para forjar um movimento que a tela não consegue excluir. */
      return jsonResult(await createStockMovement(data));
    }

    if (op === "delete") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await deleteStockMovement(id));
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    /* As regras de negócio já voltam como StockError tratado. O que
       chega aqui é falha inesperada — não devolver o SQL do driver. */
    console.error("[stock-movements]", e);
    return Response.json(
      { error: "Não foi possível registrar a movimentação. Tente novamente." },
      { status: 500 }
    );
  }
}
