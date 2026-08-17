import type { Metadata } from "next";
import { db } from "@/db";
import { orders, customers, printers, artApprovals, productionSchedules, deliveries } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { getPricingDefaults } from "@/lib/settings";
import { OrdersClient } from "@/components/modules/OrdersClient";

export const metadata: Metadata = { title: "Pedidos & OS" };
export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const [orderRows, customerRows, printerRows, artRows, scheduleRows, deliveryRows, defaults] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(customers).orderBy(asc(customers.name)),
    db.select().from(printers).orderBy(asc(printers.name)),
    db.select().from(artApprovals).orderBy(desc(artApprovals.createdAt)),
    db.select().from(productionSchedules).orderBy(asc(productionSchedules.scheduledDate)),
    db.select().from(deliveries),
    getPricingDefaults(),
  ]);

  return (
    <OrdersClient
      orders={orderRows}
      customers={customerRows}
      printers={printerRows}
      approvals={artRows}
      schedules={scheduleRows}
      deliveries={deliveryRows}
      company={{
        name: defaults.company_trade_name || defaults.company_name,
        legalName: defaults.company_legal_name,
        document: defaults.company_document,
        email: defaults.company_email,
        phone: defaults.company_phone,
        phone2: defaults.company_phone2 || defaults.company_whatsapp,
        whatsapp: defaults.company_whatsapp,
        address: defaults.company_address,
        street: defaults.company_street,
        number: defaults.company_number,
        district: defaults.company_district,
        city: defaults.company_city,
        state: defaults.company_state,
        cep: defaults.company_cep,
        website: defaults.company_website,
        pixKey: defaults.pix_key,
      }}
    />
  );
}
