import {
  createKanbanCard,
  deleteKanbanCard,
  reorderKanban,
  syncKanbanBy,
  updateKanbanCard,
} from "@/lib/kanban";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, unknown>;

function jsonResult(result: unknown) {
  const maybe = result as { error?: string; status?: number };
  if (maybe.error) return Response.json(result, { status: maybe.status || 400 });
  return Response.json(result);
}

export async function POST(req: Request) {
  let body: AnyRow;
  try {
    body = (await req.json()) as AnyRow;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "");
  const id = Number(body.id);
  const d = (body.data as AnyRow) || {};

  try {
    if (op === "syncByQuote") {
      const quoteId = Number(body.quoteId);
      if (!Number.isFinite(quoteId)) return Response.json({ error: "quoteId obrigatório" }, { status: 400 });
      return jsonResult(await syncKanbanBy("quoteId", quoteId, d));
    }

    if (op === "syncByOrder") {
      const orderId = Number(body.orderId);
      if (!Number.isFinite(orderId)) return Response.json({ error: "orderId obrigatório" }, { status: 400 });
      return jsonResult(await syncKanbanBy("orderId", orderId, d));
    }

    if (op === "reorder") {
      const column = String(body.column || d.column || "backlog") as never;
      const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
      return jsonResult(await reorderKanban(column, ids));
    }

    if (op === "create") return jsonResult(await createKanbanCard(d));

    if (op === "update") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await updateKanbanCard(id, d));
    }

    if (op === "delete") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await deleteKanbanCard(id));
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[kanban]", e);
    return Response.json({ error: e instanceof Error ? e.message : "erro interno" }, { status: 500 });
  }
}
