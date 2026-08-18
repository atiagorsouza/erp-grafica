import type { Metadata } from "next";
import { getCatalog } from "@/lib/queries";
import { PrintersEngine } from "@/components/modules/PrintersEngine";

export const metadata: Metadata = { title: "Impressoras & Tintas" };
export const dynamic = "force-dynamic";

export default async function ImpressorasPage() {
  const catalog = await getCatalog();
  return (
    <PrintersEngine
      categories={catalog.categories}
      consumables={catalog.consumables}
      printers={catalog.printers}
      formats={catalog.formats}
    />
  );
}
