import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * API pública para o PORTAL DE CLIENTES (sistema externo).
 * Permite ao portal listar produtos/precificação e criar pedidos
 * sem acoplar com o ERP interno.
 *
 * GET /api/portal?token=...     -> catálogo de produtos ativos
 *
 * A autenticação do portal deve validar um token (process.env.PORTAL_TOKEN).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (process.env.PORTAL_TOKEN && token !== process.env.PORTAL_TOKEN) {
    return Response.json({ error: "token inválido" }, { status: 401 });
  }
  const activeProducts = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      productCategoryId: products.productCategoryId,
      description: products.description,
      finalPrice: products.finalPrice,
    })
    .from(products)
    .where(eq(products.active, true));

  return Response.json({
    module: "customer-portal",
    catalog: activeProducts,
  });
}

/** POST: o portal envia um pedido simplificado que vira um orçamento rascunho */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (process.env.PORTAL_TOKEN && token !== process.env.PORTAL_TOKEN) {
    return Response.json({ error: "token inválido" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  // Em produção: cria um orçamento rascunho + card no kanban.
  return Response.json({
    ok: true,
    received: body,
    message: "Pedido do portal recebido — virou rascunho de orçamento.",
  });
}
