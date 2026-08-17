import { crudHandler, db } from "@/lib/crud";
import { deliveries, orders } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return crudHandler(req, {
    onCreate: async (d) => {
      const [row] = await db.insert(deliveries).values(d as never).returning();
      if (row.orderId) {
        await db
          .update(orders)
          .set({ deliveryStatus: row.status, updatedAt: new Date() })
          .where(eq(orders.id, row.orderId));
      }
      return row;
    },
    onUpdate: async (id, d) => {
      const [row] = await db.update(deliveries).set(d as never).where(eq(deliveries.id, id)).returning();
      if (row?.orderId && d.status !== undefined) {
        await db
          .update(orders)
          .set({ deliveryStatus: String(d.status), updatedAt: new Date() })
          .where(eq(orders.id, row.orderId));
      }
      return row;
    },
    onDelete: async (id) => {
      const [row] = await db.select().from(deliveries).where(eq(deliveries.id, id)).limit(1);
      await db.delete(deliveries).where(eq(deliveries.id, id));
      if (row?.orderId) {
        await db
          .update(orders)
          .set({ deliveryStatus: "a_definir", updatedAt: new Date() })
          .where(eq(orders.id, row.orderId));
      }
    },
  });
}
