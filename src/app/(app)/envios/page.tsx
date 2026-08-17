import type { Metadata } from "next";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { desc, ne } from "drizzle-orm";
import { ShippingClient } from "@/components/modules/ShippingClient";
import { getAccount, getSuperfreteConfig, listShipments } from "@/lib/superfrete";

export const metadata: Metadata = { title: "Envios" };
export const dynamic = "force-dynamic";

export default async function EnviosPage() {
  const cfg = await getSuperfreteConfig();

  const [shipmentRows, orderRows, customerRows] = await Promise.all([
    listShipments(200),
    db.select().from(orders).where(ne(orders.status, "cancelado")).orderBy(desc(orders.createdAt)).limit(120),
    db.select().from(customers).orderBy(desc(customers.createdAt)).limit(500),
  ]);

  const account = cfg.token ? await getAccount(cfg) : null;

  return (
    <ShippingClient
      shipments={shipmentRows}
      orders={orderRows}
      customers={customerRows}
      account={account && !("error" in account) ? account.account : null}
      accountError={account && "error" in account ? account.error : null}
      config={{
        configured: Boolean(cfg.token),
        environment: cfg.environment,
        cepOrigin: cfg.cepOrigin,
        pkg: cfg.pkg,
      }}
    />
  );
}
