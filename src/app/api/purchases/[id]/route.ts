import { db } from "@/db";
import { purchases } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [purchase] = await db.select().from(purchases).where(eq(purchases.id, Number(id)));
  if (!purchase) return Response.json({ error: "Compra não encontrada" }, { status: 404 });
  return Response.json({ ok: true, purchase });
}
