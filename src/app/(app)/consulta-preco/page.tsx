import type { Metadata } from "next";
import { db } from "@/db";
import { itemCategories, productPriceTiers, products } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ConsultaPrecoClient, type ProdutoConsulta } from "@/components/modules/ConsultaPrecoClient";
import { mensagem } from "@/lib/mensagens";
import { getPricingDefaults } from "@/lib/settings";

export const metadata: Metadata = { title: "Consulta Rápida de Preço" };
export const dynamic = "force-dynamic";

export default async function ConsultaPrecoPage() {
  /* A moldura (saudação + assinatura) vem do catálogo editável no
     Painel → Mensagens — o que o cliente lê nunca mora no código.
     Textos já vêm preenchidos ({empresa} incluso) e desligados viram
     string vazia, devolvendo o copiar puro de antes. */
  const defaults = await getPricingDefaults();
  const [linhas, faixas, cab, ass] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        nome: products.name,
        categoria: itemCategories.name,
        venda: products.finalPrice,
        custo: products.costSnapshot,
        unidade: products.saleUnitLabel,
        unidadeQtd: products.saleUnitPieces,
      })
      .from(products)
      .leftJoin(itemCategories, eq(itemCategories.id, products.productCategoryId))
      .where(eq(products.active, true))
      .orderBy(asc(itemCategories.name), asc(products.name)),
    db.select().from(productPriceTiers).orderBy(asc(productPriceTiers.minQuantity)),
    mensagem("consulta.cabecalho"),
    mensagem("consulta.assinatura", {
      empresa: defaults.company_trade_name || defaults.company_name || "",
    }),
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
    unidade: l.unidade ?? null,
    unidadeQtd: l.unidadeQtd != null ? Number(l.unidadeQtd) : null,
    faixas: porProduto.get(l.id) ?? [],
  }));

  return (
    <ConsultaPrecoClient
      produtos={produtos}
      moldura={{
        cabecalho: cab.ativa ? cab.texto : "",
        assinatura: ass.ativa ? ass.texto : "",
      }}
    />
  );
}
