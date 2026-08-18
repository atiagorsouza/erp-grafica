"use client";

/**
 * Operações suportadas pelas rotas CRUD.
 *
 * `settle`/`reopen`/`restore` chegaram na v3.11.0 com o Financeiro:
 * exclusão virou arquivamento e a baixa passou a ser explícita.
 */
export type MutateOp =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "settle"
  | "reopen"
  | "restore"
  /* Kanban: reordenar/mover cards de uma coluna */
  | "reorder";

/** Helper client-side para chamar as rotas CRUD. */
export async function mutate(
  resource: string,
  op: MutateOp,
  data?: Record<string, unknown>,
  id?: number,
  extra?: Record<string, unknown>
) {
  const res = await fetch(`/api/crud/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, data, id, ...extra }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Falha na operação");
  return json;
}
