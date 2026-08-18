import {
  createCalendarDate,
  deactivateCalendarDate,
  listCalendarAudit,
  updateCalendarDate,
} from "@/lib/calendar";

export const dynamic = "force-dynamic";

function jsonResult(result: unknown) {
  const maybe = result as { error?: string; status?: number };
  if (maybe.error) return Response.json(result, { status: maybe.status || 400 });
  return Response.json(result);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auditId = Number(url.searchParams.get("audit"));
  if (Number.isFinite(auditId) && auditId > 0) {
    return jsonResult(await listCalendarAudit(auditId));
  }
  return Response.json({ error: "Parâmetro audit obrigatório" }, { status: 400 });
}

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
    if (op === "create") return jsonResult(await createCalendarDate(data));
    if (op === "update") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await updateCalendarDate(id, data));
    }
    if (op === "delete" || op === "deactivate") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await deactivateCalendarDate(id, String(data.reason || "Desativada pelo usuário")));
    }
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[commemorative-dates]", e);
    return Response.json({ error: e instanceof Error ? e.message : "erro interno" }, { status: 500 });
  }
}
