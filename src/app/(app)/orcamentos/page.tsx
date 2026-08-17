import type { Metadata } from "next";
import { db } from "@/db";
import { quotes, quoteItems, customers, orders } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { listProducts } from "@/lib/queries";
import { getServices } from "@/lib/queries-extra";
import { getPricingDefaults } from "@/lib/settings";
import { QuotesClient } from "@/components/modules/QuotesClient";

export const metadata: Metadata = { title: "Orçamentos" };
export const dynamic = "force-dynamic";

export default async function OrcamentosPage() {
  const [quoteRows, items, customerRows, productRows, serviceRows, orderRows, defaults] = await Promise.all([
    db.select().from(quotes).orderBy(desc(quotes.createdAt)),
    db.select().from(quoteItems),
    db.select().from(customers).orderBy(asc(customers.name)),
    listProducts(),
    getServices(),
    db.select().from(orders),
    getPricingDefaults(),
  ]);

  return (
    <QuotesClient
      quotes={quoteRows}
      items={items}
      customers={customerRows}
      products={productRows}
      services={serviceRows}
      orders={orderRows}
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
