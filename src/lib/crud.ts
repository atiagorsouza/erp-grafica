import "server-only";
import { db } from "@/db";

type AnyRow = Record<string, unknown>;

interface CrudOptions {
  onCreate: (data: AnyRow) => Promise<unknown>;
  onUpdate: (id: number, data: AnyRow) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  /** executa depois de qualquer mutação com sucesso */
  afterMutate?: () => Promise<unknown>;
}

export async function crudHandler(req: Request, opts: CrudOptions) {
  let body: AnyRow;
  try {
    body = (await req.json()) as AnyRow;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const op = String(body.op || "");
  const id = Number(body.id);
  try {
    let result: unknown = null;
    if (op === "create") {
      result = await opts.onCreate((body.data as AnyRow) || {});
    } else if (op === "update") {
      if (!Number.isFinite(id))
        return Response.json({ error: "id obrigatório" }, { status: 400 });
      result = await opts.onUpdate(id, (body.data as AnyRow) || {});
    } else if (op === "delete") {
      if (!Number.isFinite(id))
        return Response.json({ error: "id obrigatório" }, { status: 400 });
      await opts.onDelete(id);
    } else {
      return Response.json({ error: "op inválido" }, { status: 400 });
    }
    if (opts.afterMutate) await opts.afterMutate();
    return Response.json({ ok: true, row: result });
  } catch (e) {
    /* Erro de REGRA (422/409) é diferente de erro de SISTEMA (500).
       Antes tudo virava 500: a tela mostrava "erro interno" quando o
       certo era explicar que a categoria tem produto dentro. Um
       handler pode anexar `status` ao erro para dizer qual é qual. */
    const status = Number((e as { status?: number })?.status);
    if (Number.isFinite(status) && status >= 400 && status < 500) {
      return Response.json(
        { error: e instanceof Error ? e.message : "requisição inválida" },
        { status }
      );
    }
    console.error("[crud]", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "erro interno" },
      { status: 500 }
    );
  }
}

/** atalho: limpa o cache de settings depois de mutações em config */
export { clearSettingsCache } from "@/lib/settings";

export { db };
