import type { Metadata } from "next";
import { db } from "@/db";
import { crmLeads, crmActivities, quotes, orders, sales, registrationLinks } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { getCustomersPage, TAMANHO_PAGINA_PADRAO } from "@/lib/queries";
import { ClientsClient } from "@/components/modules/ClientsClient";
import { aniversariantes, cadastrosIncompletos } from "@/lib/crm-alertas";

export const metadata: Metadata = { title: "Clientes & CRM" };
export const dynamic = "force-dynamic";

/* v3.62.0 — a carteira passou a vir por página, com busca e filtros no
   servidor. Histórico (orçamentos, pedidos, vendas e atividades) só é
   carregado para os clientes visíveis: ele só aparece na ficha que o
   operador abre. */
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    origem?: string;
    pagina?: string;
    por?: string;
  }>;
}) {
  const sp = await searchParams;
  const busca = sp.q || "";
  const status = sp.status || "all";
  const origem = sp.origem || "all";
  const pagina = Number(sp.pagina) || 1;
  const porPagina = Number(sp.por) || TAMANHO_PAGINA_PADRAO;

  const pageClientes = await getCustomersPage({ pagina, porPagina, busca, status, origem });
  const idsVisiveis = pageClientes.linhas.map((c) => Number(c.id));

  const [leads, activities, quoteRows, orderRows, saleRows, regLinks, nivers, incompletos] = await Promise.all([
    db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt)),
    idsVisiveis.length
      ? db.select().from(crmActivities).where(inArray(crmActivities.customerId, idsVisiveis)).orderBy(desc(crmActivities.createdAt))
      : Promise.resolve([]),
    idsVisiveis.length
      ? db.select().from(quotes).where(inArray(quotes.customerId, idsVisiveis)).orderBy(desc(quotes.createdAt))
      : Promise.resolve([]),
    idsVisiveis.length
      ? db.select().from(orders).where(inArray(orders.customerId, idsVisiveis)).orderBy(desc(orders.createdAt))
      : Promise.resolve([]),
    idsVisiveis.length
      ? db.select().from(sales).where(inArray(sales.customerId, idsVisiveis)).orderBy(desc(sales.createdAt))
      : Promise.resolve([]),
    /* Só os links que ainda significam alguma coisa. Cancelado e
       expirado não interessam ao operador — poluiriam a ficha. */
    db
      .select()
      .from(registrationLinks)
      .where(inArray(registrationLinks.status, ["pendente", "aberto", "concluido"]))
      .orderBy(desc(registrationLinks.createdAt)),
    /* Alertas do CRM: o que pedir ao operador HOJE. */
    aniversariantes(15),
    cadastrosIncompletos(20),
  ]);

  return (
    <ClientsClient
      aniversariantes={nivers}
      cadastrosIncompletos={incompletos}
      customers={pageClientes.linhas}
      paginacao={{
        total: pageClientes.total,
        totalCarteira: pageClientes.totalCarteira,
        pagina: pageClientes.pagina,
        porPagina: pageClientes.porPagina,
        totalPaginas: pageClientes.totalPaginas,
        ltv: pageClientes.ltv,
        origens: pageClientes.origens,
        busca,
        status,
        origem,
      }}
      leads={leads}
      activities={activities}
      quotes={quoteRows}
      orders={orderRows}
      sales={saleRows}
      registrationLinks={regLinks}
    />
  );
}
