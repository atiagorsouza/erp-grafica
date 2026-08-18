import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { guardPublicApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * API pública do PORTAL DE CLIENTES.
 *
 * Consumida pelo portal hospedado fora (Hostinger), via
 * `api.vtdigital.site` no Cloudflare Tunnel. Como é chamada
 * máquina-a-máquina, não passa pelo Cloudflare Access — a credencial
 * é a API key validada em `guardPublicApi`.
 *
 * ⚠️ Correção de segurança (v3.45.0)
 *
 * A versão anterior autenticava assim:
 *
 *     if (process.env.PORTAL_TOKEN && token !== ...) return 401
 *
 * Como `PORTAL_TOKEN` nunca foi definido no `.env`, a condição era
 * sempre falsa e a rota respondia **200 para qualquer um** —
 * verificado em produção: devolvia o catálogo completo com preços sem
 * nenhuma credencial. Falha aberta.
 *
 * Além disso o token vinha por query string (`?token=`), que vaza em
 * log de servidor, histórico do navegador e header `Referer`.
 *
 * Agora: header, comparação em tempo constante e falha fechada.
 */

/** GET — catálogo de produtos ativos, apenas com dado público. */
export async function GET(req: Request) {
  const denied = guardPublicApi(req);
  if (denied) return denied;

  const activeProducts = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      productCategoryId: products.productCategoryId,
      description: products.description,
      /* Só o preço de VENDA. `costSnapshot` e `margin` jamais saem
         daqui: é a margem da empresa exposta a quem tiver a chave. */
      finalPrice: products.finalPrice,
    })
    .from(products)
    .where(eq(products.active, true));

  return Response.json({
    module: "customer-portal",
    catalog: activeProducts,
  });
}

/** POST — pedido do portal vira rascunho de orçamento. */
export async function POST(req: Request) {
  const denied = guardPublicApi(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  /* TODO (fase 6): criar orçamento rascunho + card no kanban.
     Deve nascer SEMPRE como rascunho, nunca aprovado — pedido vindo
     da internet não pode entrar direto na produção. */
  return Response.json({
    ok: true,
    received: body,
    message: "Pedido do portal recebido — virou rascunho de orçamento.",
  });
}
