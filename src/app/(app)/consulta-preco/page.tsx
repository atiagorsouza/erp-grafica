import type { Metadata } from "next";
import { db } from "@/db";
import { itemCategories, productPriceTiers, products } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ConsultaPrecoClient, type ProdutoConsulta } from "@/components/modules/ConsultaPrecoClient";

export const metadata: Metadata = { title: "Consulta Rápida de Preço" };
export const dynamic = "force-dynamic";

export default async function ConsultaPrecoPage() {
  const [linhas, faixas] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        nome: products.name,
        categoria: itemCategories.name,
        venda: products.finalPrice,
        custo: products.costSnapshot,
      })
      .from(products)
      .leftJoin(itemCategories, eq(itemCategories.id, products.productCategoryId))
      .where(eq(products.active, true))
      .orderBy(asc(itemCategories.name), asc(products.name)),
    db.select().from(productPriceTiers).orderBy(asc(productPriceTiers.minQuantity)),
  ]);

  /* Junta as faixas em memória: são poucas dezenas de linhas, não
     compensa uma query agregada por produto. */
  const porProduto = new Map<number, { qtd: number; preco: number }[]>();
  for (const f of faixas) {
    const lista = porProduto.get(f.productId) ?? [];
    lista.push({ qtd: Number(f.minQuantity), preco: Number(f.unitPrice) });
    porProduto.set(f.productId, lista);
  }

  const produtos: ProdutoConsulta[] = linhas.map((l) => ({
    id: l.id,
    sku: l.sku,
    nome: l.nome,
    categoria: l.categoria ?? "Outros",
    venda: Number(l.venda ?? 0),
    custo: Number(l.custo ?? 0),
    faixas: porProduto.get(l.id) ?? [],
  }));

  return <ConsultaPrecoClient produtos={produtos} />;
}
