import { crudHandler, db } from "@/lib/crud";
import { productionSchedules } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crudHandler(req, {
    onCreate: (d) => db.insert(productionSchedules).values(d as never).returning().then((r) => r[0]),
    onUpdate: (id, d) =>
      db
        .update(productionSchedules)
        .set(d as never)
        .where(eq(productionSchedules.id, id))
        .returning()
        .then((r) => r[0]),
    onDelete: (id) => db.delete(productionSchedules).where(eq(productionSchedules.id, id)),
  });
}
