import type { Metadata } from "next";
import { getCatalog } from "@/lib/queries";
import { PricingTablesClient } from "@/components/modules/PricingTablesClient";

export const metadata: Metadata = { title: "Tabelas de Preços" };
export const dynamic = "force-dynamic";

export default async function TabelasPrecosPage() {
  const catalog = await getCatalog();
  return <PricingTablesClient tables={catalog.pricingTables} />;
}
