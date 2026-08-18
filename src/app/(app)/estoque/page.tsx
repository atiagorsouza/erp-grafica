import type { Metadata } from "next";
import { getPurchasingData } from "@/lib/queries";
import { getCategoriesByModule } from "@/lib/queries";
import { getStockMovements } from "@/lib/queries";
import { StockClient } from "@/components/modules/StockClient";

export const metadata: Metadata = { title: "Estoque & Compras" };
export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const [{ suppliers, purchases, materials }, materialCats, movements] = await Promise.all([
    getPurchasingData(),
    getCategoriesByModule("material"),
    getStockMovements(200),
  ]);
  return <StockClient materials={materials} suppliers={suppliers} purchases={purchases} materialCats={materialCats} movements={movements} />;
}
