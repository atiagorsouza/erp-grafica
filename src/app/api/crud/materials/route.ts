import { archiveMaterial, saveMaterial } from "@/lib/stock";

export const dynamic = "force-dynamic";
function jsonResult(result: unknown) { const m = result as { error?: string; status?: number }; return m.error ? Response.json(result, { status: m.status || 400 }) : Response.json(result); }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "JSON inválido" }, { status: 400 });
  const op = String(body.op || ""); const id = Number(body.id); const data = body.data || {};
  try {
    if (op === "create") return jsonResult(await saveMaterial(data));
    if (op === "update") { if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 }); return jsonResult(await saveMaterial(data, id)); }
    if (op === "delete" || op === "archive") { if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 }); return jsonResult(await archiveMaterial(id, String(data.reason || "Arquivado"))); }
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) { console.error("[materials]", e); return Response.json({ error: e instanceof Error ? e.message : "erro interno" }, { status: 500 }); }
}
