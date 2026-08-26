import type { Metadata } from "next";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { asc, isNotNull } from "drizzle-orm";
import { listProducts, getQuotesPage, TAMANHO_PAGINA_PADRAO } from "@/lib/queries";
import { getServices } from "@/lib/queries-extra";
import { getPricingDefaults } from "@/lib/settings";
import { QuotesClient } from "@/components/modules/QuotesClient";
import { expireStaleQuotes } from "@/lib/quotes";

export const metadata: Metadata = { title: "Orçamentos" };
export const dynamic = "force-dynamic";

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string; pagina?: string; por?: string }>;
}) {
  const sp = await searchParams;
  const busca = sp.q || "";
  const filtro = sp.filtro || "all";
  const paginaAtual = Number(sp.pagina) || 1;
  const porPagina = Number(sp.por) || TAMANHO_PAGINA_PADRAO;
  /* Propostas vencidas passam a "expirado" antes da leitura: sem isto,
     a expiração só acontecia no install/update e o funil ficava
     otimista entre um deploy e outro. */
  await expireStaleQuotes();

  const [pageOrc, customerRows, productRows, serviceRows, orderRows, defaults] = await Promise.all([
    getQuotesPage({ pagina: paginaAtual, porPagina, busca, filtro }),
    db.select().from(customers).orderBy(asc(customers.name)),
    listProducts(),
    getServices(),
    /* A tela só pergunta "este orçamento já virou pedido?", então basta
       o vínculo — não a tabela de pedidos inteira. */
    db.select({ id: orders.id, quoteId: orders.quoteId }).from(orders).where(isNotNull(orders.quoteId)),
    getPricingDefaults(),
  ]);

  const quoteRows = pageOrc.linhas;
  const items = pageOrc.itens;

  return (
    <QuotesClient
      quotes={quoteRows}
      items={items}
      paginacao={{
        total: pageOrc.total,
        pagina: pageOrc.pagina,
        porPagina: pageOrc.porPagina,
        totalPaginas: pageOrc.totalPaginas,
        contadores: pageOrc.contadores,
        busca,
        filtro,
      }}
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
        stateRegistration: defaults.company_ie,
      }}
    />
  );
}
