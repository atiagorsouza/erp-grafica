import type { Metadata } from "next";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { desc, ne } from "drizzle-orm";
import { PaymentsClient } from "@/components/modules/PaymentsClient";
import {
  expireStale,
  getChargeSummary,
  getInfinitePayConfig,
  listCharges,
} from "@/lib/infinitepay";

export const metadata: Metadata = { title: "Cobranças" };
export const dynamic = "force-dynamic";

export default async function CobrancasPage() {
  const cfg = await getInfinitePayConfig();

  /* marca vencidas antes de exibir */
  await expireStale();

  const [charges, summary, orderRows, customerRows] = await Promise.all([
    listCharges(200),
    getChargeSummary(),
    db.select().from(orders).where(ne(orders.status, "cancelado")).orderBy(desc(orders.createdAt)).limit(120),
    db.select().from(customers).orderBy(desc(customers.createdAt)).limit(500),
  ]);

  return (
    <PaymentsClient
      charges={charges}
      summary={summary}
      orders={orderRows}
      customers={customerRows}
      config={{
        configured: Boolean(cfg.handle),
        handle: cfg.handle,
        manualLink: cfg.handle ? `https://infinitepay.io/${cfg.handle}` : null,
        methods: cfg.methods,
        webhookUrl: cfg.webhookUrl,
        hasBaseUrl: Boolean(cfg.baseUrl || cfg.webhookUrl),
      }}
    />
  );
}
