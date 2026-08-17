"use client";

/** Helper client-side para chamar as rotas CRUD. */
export async function mutate(
  resource: string,
  op: "create" | "update" | "delete" | "cancel",
  data?: Record<string, unknown>,
  id?: number
) {
  const res = await fetch(`/api/crud/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, data, id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Falha na operação");
  return json;
}
