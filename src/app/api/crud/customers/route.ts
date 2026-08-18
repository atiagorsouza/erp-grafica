import { archiveCustomer, createCustomer, updateCustomer } from "@/lib/crm";

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
      const result = await createCustomer(data);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }
    if (op === "update") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const result = await updateCustomer(id, data);
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }
    if (op === "delete" || op === "archive") {
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const result = await archiveCustomer(id, String(data.reason || "Arquivado pelo CRM"));
      if ("error" in result) return Response.json(result, { status: result.status });
      return Response.json(result);
    }
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    /* Corrida perdida no índice `customers_document_unique_idx`: outra
       requisição gravou o mesmo documento entre a checagem e o INSERT.
       Vira 409 amigável — o catch genérico devolvia o INSERT inteiro
       para o navegador. Drizzle embrulha o erro do pg, daí o `cause`. */
    const raw = `${String(e)} ${String((e as { cause?: unknown })?.cause ?? "")}`;
    if (raw.includes("customers_document_unique_idx") || raw.includes("duplicate key")) {
      return Response.json(
        { error: "Este documento já está cadastrado para outro cliente." },
        { status: 409 }
      );
    }

    console.error("[customers]", e);
    return Response.json(
      { error: "Não foi possível concluir a operação no cadastro." },
      { status: 500 }
    );
  }
}
