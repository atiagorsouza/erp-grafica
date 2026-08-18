import type { Metadata } from "next";
import { db } from "@/db";
import { productFinishings, productMaterials, productPriceTiers } from "@/db/schema";
import { getCatalog, getCategoriesByModule, listProducts } from "@/lib/queries";
import { getPricingDefaults } from "@/lib/settings";
import { ProductsClient } from "@/components/modules/ProductsClient";

export const metadata: Metadata = { title: "Produtos & Custos" };
export const dynamic = "force-dynamic";

export default async function ProdutosPage() {
  const [catalog, productsList, fins, mats, tiers, defaults, productCats] = await Promise.all([
    getCatalog(),
    listProducts(),
    db.select().from(productFinishings),
    db.select().from(productMaterials),
    db.select().from(productPriceTiers),
    getPricingDefaults(),
    getCategoriesByModule("product"),
  ]);

  return (
    <ProductsClient
      catalog={{ ...catalog, itemCategories: productCats }}
      products={productsList}
      finishings={fins}
      materials={mats}
      priceTiers={tiers}
      taxRate={defaults.taxRate}
      cardFeeRate={defaults.cardFeeRate}
    />
  );
}
