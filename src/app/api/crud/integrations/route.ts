import { crudHandler, db } from "@/lib/crud";
import { apiIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crudHandler(req, {
    onCreate: (d) =>
      db
        .insert(apiIntegrations)
        .values(d as never)
        .returning()
        .then((r) => r[0]),
    onUpdate: (id, d) =>
      db
        .update(apiIntegrations)
        .set(d as never)
        .where(eq(apiIntegrations.id, id))
        .returning()
        .then((r) => r[0]),
    onDelete: (id) =>
      db.delete(apiIntegrations).where(eq(apiIntegrations.id, id)),
  });
}
