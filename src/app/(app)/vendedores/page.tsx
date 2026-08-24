import type { Metadata } from "next";
import { SellersClient } from "@/components/modules/SellersClient";
import { listarVendedores, nomesSoltos, resumoDeComissoes } from "@/lib/comissao";
import { monthRange, todayISO } from "@/lib/period";

export const metadata: Metadata = { title: "Vendedores & Comissão" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ de?: string; ate?: string }>;

export default async function VendedoresPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  /* Mês corrente por padrão: é o período que o dono olha para saber
     quanto vai pagar de comissão no fim do mês. */
  const mes = monthRange();
  const de = /^\d{4}-\d{2}-\d{2}$/.test(params.de || "") ? params.de! : mes.from;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(params.ate || "") ? params.ate! : todayISO();

  const [vendedores, soltos, resumo] = await Promise.all([
    listarVendedores(false),
    nomesSoltos(),
    resumoDeComissoes(de, ate),
  ]);

  return (
    <SellersClient
      vendedores={vendedores}
      soltos={soltos}
      resumo={resumo}
      de={de}
      ate={ate}
    />
  );
}
