import type { Metadata } from "next";
import { db } from "@/db";
import { customers, printers } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getPricingDefaults } from "@/lib/settings";
import { getOrdersPage, auxiliaresDosPedidos, TAMANHO_PAGINA_PADRAO } from "@/lib/queries";
import { OrdersClient } from "@/components/modules/OrdersClient";

export const metadata: Metadata = { title: "Pedidos & OS" };
export const dynamic = "force-dynamic";

/* v3.62.0 — a página passou a trazer só a fatia visível de pedidos.
   Busca e filtro viajam na URL para que recarregar a aba, voltar no
   navegador ou mandar o link para outra pessoa mostrem a mesma tela. */
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string; pagina?: string; por?: string }>;
}) {
  const sp = await searchParams;
  const busca = sp.q || "";
  const filtro = sp.filtro || "ativos";
  const pagina = Number(sp.pagina) || 1;
  const porPagina = Number(sp.por) || TAMANHO_PAGINA_PADRAO;

  const [pagePedidos, customerRows, printerRows, defaults] = await Promise.all([
    getOrdersPage({ pagina, porPagina, busca, filtro }),
    db.select().from(customers).orderBy(asc(customers.name)),
    db.select().from(printers).orderBy(asc(printers.name)),
    getPricingDefaults(),
  ]);

  const orderRows = pagePedidos.linhas;
  /* Aprovações, agendamentos e entregas só são lidos para o pedido
     aberto, então basta carregar os da página — antes vinham inteiros. */
  const { approvals: artRows, schedules: scheduleRows, deliveries: deliveryRows } =
    await auxiliaresDosPedidos(orderRows.map((o) => Number(o.id)));

  return (
    <OrdersClient
      orders={orderRows}
      paginacao={{
        total: pagePedidos.total,
        pagina: pagePedidos.pagina,
        porPagina: pagePedidos.porPagina,
        totalPaginas: pagePedidos.totalPaginas,
        contadores: pagePedidos.contadores,
        busca,
        filtro,
      }}
      customers={customerRows}
      printers={printerRows}
      approvals={artRows}
      schedules={scheduleRows}
      deliveries={deliveryRows}
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
