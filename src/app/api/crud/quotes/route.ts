import { archiveQuote, createQuote, updateQuote } from "@/lib/quotes";
import { idValido } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crud/quotes
 *   { op: "create", data }
 *   { op: "update", id, data }   data.reopen=true reabre orçamento aprovado
 *   { op: "delete" | "archive", id, reason }
 *
 * A resposta de create/update pode trazer `warnings[]` com divergências
 * entre o preço cobrado e o de tabela — a tela mostra, não bloqueia.
 */
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
      const result = await createQuote(data);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }

    if (op === "update") {
      if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const result = await updateQuote(id, data);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }

    if (op === "delete" || op === "archive") {
      if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const result = await archiveQuote(id, String(body.reason || data.reason || "Arquivado pelo usuário"));
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    /* Mensagem genérica: o detalhe (inclusive SQL) fica no log do
       servidor, nunca na resposta. */
    console.error("[quotes]", e);
    return Response.json(
      { error: "Não foi possível concluir a operação no orçamento." },
      { status: 500 }
    );
  }
}
