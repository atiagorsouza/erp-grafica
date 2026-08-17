import { createPurchase, receivePurchase } from "@/lib/stock";

export const dynamic = "force-dynamic";

function jsonResult(result: unknown) {
  const m = result as { error?: string; status?: number };
  return m.error ? Response.json(result, { status: m.status || 400 }) : Response.json(result);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "JSON inválido" }, { status: 400 });
  const op = String(body.op || "");

  try {
    if (op === "create") return jsonResult(await createPurchase(body.data || {}));

    if (op === "receive") {
      /* Aceita `purchaseId` ou `id`: o resto do sistema usa `id` e a
         divergência fazia a query rodar com NaN. */
      const raw = body.purchaseId ?? body.id;
      const purchaseId = Number(raw);
      if (!Number.isFinite(purchaseId) || purchaseId <= 0) {
        return Response.json(
          { error: "Informe a compra a receber (purchaseId)", status: 422 },
          { status: 422 }
        );
      }
      return jsonResult(await receivePurchase(purchaseId));
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    /* Nunca devolver a mensagem crua do driver: erros de banco traziam
       o SQL inteiro, com nomes de coluna e parâmetros, até o navegador. */
    console.error("[purchases]", e);
    return Response.json(
      { error: "Não foi possível processar a compra. Tente novamente." },
      { status: 500 }
    );
  }
}
