/* Previsão de entrega para a tela de orçamento/pedido.
   POST { itens: [{ productId }], apartirDe?: ISO } */
import { NextRequest } from "next/server";
import { preverEntrega } from "@/lib/prazo-config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const itens = Array.isArray(body.itens) ? body.itens : [];
    const apartirDe = body.apartirDe ? new Date(body.apartirDe) : new Date();
    if (Number.isNaN(apartirDe.getTime())) {
      return Response.json({ error: "Data inválida" }, { status: 422 });
    }
    return Response.json(await preverEntrega(itens, apartirDe));
  } catch (e) {
    console.error("[prazo]", e);
    return Response.json({ error: "Não foi possível calcular o prazo" }, { status: 500 });
  }
}
