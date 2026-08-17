import { archiveLead, createLead, updateLead } from "@/lib/crm";

export const dynamic = "force-dynamic";

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
      const result = await createLead(data);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }
    if (op === "update") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const result = await updateLead(id, data);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }
    if (op === "delete" || op === "archive") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const result = await archiveLead(id, String(data.reason || "Arquivado pelo CRM"));
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[crm-leads]", e);
    return Response.json({ error: e instanceof Error ? e.message : "erro interno" }, { status: 500 });
  }
}
