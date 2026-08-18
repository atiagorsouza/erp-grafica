import { deletePrintFormat, savePrintFormat } from "@/lib/print-engine";

export const dynamic = "force-dynamic";

function jsonResult(result: unknown) {
  const maybe = result as { error?: string; status?: number };
  if (maybe.error) return Response.json(result, { status: maybe.status || 400 });
  return Response.json(result);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "JSON inválido" }, { status: 400 });
  const op = String(body.op || "");
  const id = Number(body.id);
  const data = body.data || {};
  try {
    if (op === "create") return jsonResult(await savePrintFormat(data));
    if (op === "update") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await savePrintFormat(data, id));
    }
    if (op === "delete") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await deletePrintFormat(id));
    }
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[print-formats]", e);
    return Response.json({ error: e instanceof Error ? e.message : "erro interno" }, { status: 500 });
  }
}
