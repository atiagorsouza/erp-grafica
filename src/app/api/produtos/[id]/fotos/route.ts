/* GALERIA (v3.69.2) — fotos de um produto, na ordem (1..3).
 * GET /api/produtos/:id/fotos → string[] (data URIs)
 * Usado pelo editor ao abrir um produto — a lista geral não carrega
 * as fotos (peso); elas chegam aqui, só do produto aberto. */
import { db } from "@/db";
import { productImages } from "@/db/schema";
import { idValido } from "@/lib/api-auth";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pid = Number(id);
  if (!idValido(pid)) return Response.json({ error: "id inválido" }, { status: 400 });
  const rows = await db
    .select({ dataUri: productImages.dataUri })
    .from(productImages)
    .where(eq(productImages.productId, pid))
    .orderBy(asc(productImages.position));
  return Response.json({ fotos: rows.map((r) => r.dataUri) });
}
