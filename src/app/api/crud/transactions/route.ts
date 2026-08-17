import { crudHandler, db } from "@/lib/crud";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crudHandler(req, {
    onCreate: (d) =>
      db
        .insert(transactions)
        .values(d as never)
        .returning()
        .then((r) => r[0]),
    onUpdate: (id, d) =>
      db
        .update(transactions)
        .set(d as never)
        .where(eq(transactions.id, id))
        .returning()
        .then((r) => r[0]),
    onDelete: (id) =>
      db.delete(transactions).where(eq(transactions.id, id)),
  });
}
