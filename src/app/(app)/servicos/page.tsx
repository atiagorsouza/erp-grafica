import type { Metadata } from "next";
import { getCatalog, getCategoriesByModule } from "@/lib/queries";
import { ServicesClient } from "@/components/modules/ServicesClient";

export const metadata: Metadata = { title: "Serviços & Acabamentos" };
export const dynamic = "force-dynamic";

export default async function ServicosPage() {
  const [catalog, serviceCats, finishingCats] = await Promise.all([
    getCatalog(),
    getCategoriesByModule("service"),
    getCategoriesByModule("finishing"),
  ]);
  return <ServicesClient services={catalog.services} finishings={catalog.finishings} serviceCats={serviceCats} finishingCats={finishingCats} />;
}
