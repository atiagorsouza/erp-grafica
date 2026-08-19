/* Edição das mensagens que o bot envia (Painel → Mensagens). */
import { restaurarMensagem, salvarMensagem } from "@/lib/mensagens";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "save");
  const slug = String(body.slug || "");
  if (!slug) return Response.json({ error: "slug obrigatório" }, { status: 400 });

  try {
    if (op === "restore") {
      const r = await restaurarMensagem(slug);
      if ("error" in r) return Response.json(r, { status: r.status });
      return Response.json({ ok: true });
    }

    const r = await salvarMensagem(slug, String(body.body ?? ""), {
      active: body.active === undefined ? undefined : body.active !== false,
      updatedBy: String(body.updatedBy || "").slice(0, 80) || undefined,
    });
    if ("error" in r) return Response.json(r, { status: r.status });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[message-templates]", e);
    return Response.json({ error: "Não foi possível salvar a mensagem." }, { status: 500 });
  }
}
