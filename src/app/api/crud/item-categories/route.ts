import { crudHandler, db } from "@/lib/crud";
import { itemCategories } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crudHandler(req, {
    onCreate: (d) =>
      db
        .insert(itemCategories)
        .values(d as never)
        .returning()
        .then((r) => r[0]),
    onUpdate: (id, d) =>
      db
        .update(itemCategories)
        .set(d as never)
        .where(eq(itemCategories.id, id))
        .returning()
        .then((r) => r[0]),
    onDelete: (id) =>
      db.delete(itemCategories).where(eq(itemCategories.id, id)),
  });
}
