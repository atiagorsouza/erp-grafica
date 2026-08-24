import { archiveProduct, createProduct, updateProduct } from "@/lib/products";
import { idValido } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function jsonResult(result: unknown) {
  const maybe = result as { error?: string; status?: number };
  if (maybe.error) return Response.json(result, { status: maybe.status || 400 });
  return Response.json(result);
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
    if (op === "create") return jsonResult(await createProduct(data));
    if (op === "update") {
      if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await updateProduct(id, data));
    }
    if (op === "delete" || op === "archive") {
      if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      return jsonResult(await archiveProduct(id, String(data.reason || "Arquivado pelo usuário")));
    }
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[products]", e);

    /* Violação dos índices únicos de SKU/código de barras. Sem este
       tratamento o catch devolvia `e.message`, que num erro de
       constraint carrega o SQL inteiro para o navegador.

       O Drizzle embrulha o erro do driver, então o nome do índice pode
       estar na mensagem, em `cause.constraint` ou em `cause.message`. */
    const cause = (e as { cause?: { constraint?: string; message?: string } })?.cause;
    const raw = [
      e instanceof Error ? e.message : "",
      cause?.constraint || "",
      cause?.message || "",
    ].join(" ");
    if (raw.includes("products_sku_unique_idx")) {
      return Response.json(
        { error: "Já existe um produto com este SKU.", status: 409 },
        { status: 409 }
      );
    }
    if (raw.includes("products_barcode_unique_idx")) {
      return Response.json(
        { error: "Já existe um produto com este código de barras.", status: 409 },
        { status: 409 }
      );
    }

    return Response.json(
      { error: "Não foi possível salvar o produto. Tente novamente." },
      { status: 500 }
    );
  }
}
