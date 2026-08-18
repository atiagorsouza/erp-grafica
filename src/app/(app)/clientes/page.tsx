import type { Metadata } from "next";
import { db } from "@/db";
import { customers, crmLeads, crmActivities, quotes, orders, sales } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { ClientsClient } from "@/components/modules/ClientsClient";

export const metadata: Metadata = { title: "Clientes & CRM" };
export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [customerRows, leads, activities, quoteRows, orderRows, saleRows] = await Promise.all([
    db.select().from(customers).orderBy(asc(customers.name)),
    db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt)),
    db.select().from(crmActivities).orderBy(desc(crmActivities.createdAt)),
    db.select().from(quotes).orderBy(desc(quotes.createdAt)),
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(sales).orderBy(desc(sales.createdAt)),
  ]);

  return (
    <ClientsClient
      customers={customerRows}
      leads={leads}
      activities={activities}
      quotes={quoteRows}
      orders={orderRows}
      sales={saleRows}
    />
  );
}
