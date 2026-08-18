import "server-only";
import { db } from "@/db";
import {
  customers,
  printerCategories,
  printerConsumables,
  printers,
  materials,
  finishingItems,
  services,
  products,
  quotes,
  sales,
  transactions,
  kanbanCards,
  productFinishings,
  productMaterials,
  quoteItems,
  pricingTables,
  printFormats,
  itemCategories,
  stockMovements,
  crmLeads,
  crmActivities,
  orders,
  artApprovals,
  suppliers,
  purchases,
  productionSchedules,
  deliveries,
  settings,
} from "@/db/schema";
import { eq, desc, asc, isNull } from "drizzle-orm";
import { todayISO } from "@/lib/period";

export async function getCategoriesByModule(
  module: "product" | "material" | "service" | "finishing" | "pricing_table"
) {
  return db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.module, module))
    .orderBy(asc(itemCategories.order), asc(itemCategories.id));
}

export async function getAllCategories() {
  return db.select().from(itemCategories).orderBy(asc(itemCategories.id));
}

export async function getStockMovements(limit = 200) {
  return db
    .select()
    .from(stockMovements)
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

export async function getCrmPipeline() {
  return db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt));
}

export async function getOrders() {
  return db.select().from(orders).orderBy(desc(orders.createdAt));
}

export async function getOrderDetail(id: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return null;
  const [approvals, delivery, schedule] = await Promise.all([
    db.select().from(artApprovals).where(eq(artApprovals.orderId, id)).orderBy(desc(artApprovals.createdAt)),
    db.select().from(deliveries).where(eq(deliveries.orderId, id)),
    db.select().from(productionSchedules).where(eq(productionSchedules.orderId, id)),
  ]);
  return { order, approvals, delivery: delivery[0] || null, schedule };
}

export async function getClient360(id: number) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return null;
  const [customerQuotes, customerSales, customerLeads, activities, customerOrders, customerCards, customerTx] = await Promise.all([
    db.select().from(quotes).where(eq(quotes.customerId, id)).orderBy(desc(quotes.createdAt)),
    db.select().from(sales).where(eq(sales.customerId, id)).orderBy(desc(sales.createdAt)),
    db.select().from(crmLeads).where(eq(crmLeads.customerId, id)).orderBy(desc(crmLeads.updatedAt)),
    db.select().from(crmActivities).where(eq(crmActivities.customerId, id)).orderBy(desc(crmActivities.createdAt)),
    db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt)),
    db.select().from(kanbanCards).where(eq(kanbanCards.customerId, id)).orderBy(desc(kanbanCards.createdAt)),
    db.select().from(transactions).where(eq(transactions.customerId, id)).orderBy(desc(transactions.createdAt)),
  ]);
  return { customer, customerQuotes, customerSales, customerLeads, activities, customerOrders, customerCards, customerTx };
}

export async function getPurchasingData() {
  const [suppliersList, purchasesList, materialsList] = await Promise.all([
    db.select().from(suppliers).orderBy(asc(suppliers.name)),
    db.select().from(purchases).orderBy(desc(purchases.createdAt)),
    db.select().from(materials).orderBy(asc(materials.name)),
  ]);
  return { suppliers: suppliersList, purchases: purchasesList, materials: materialsList };
}

export async function getProductionData() {
  const [schedules, ordersList, printersList] = await Promise.all([
    db.select().from(productionSchedules).orderBy(asc(productionSchedules.scheduledDate)),
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(printers).orderBy(asc(printers.name)),
  ]);
  return { schedules, orders: ordersList, printers: printersList };
}

export async function getDeliveryData() {
  const [deliveryList, ordersList, customersList] = await Promise.all([
    db.select().from(deliveries).orderBy(desc(deliveries.createdAt)),
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(customers).orderBy(asc(customers.name)),
  ]);
  return { deliveries: deliveryList, orders: ordersList, customers: customersList };
}



export async function getDashboardStats() {
  const [c, p, pr, m, f, s, q] = await Promise.all([
    db.select().from(customers),
    db.select().from(products),
    db.select().from(printers),
    db.select().from(materials),
    db.select().from(finishingItems),
    db.select().from(services),
    db.select().from(quotes),
  ]);
  /* v3.11.0 — cancelada não é faturamento; arquivado não é conta */
  const salesRows = (await db.select().from(sales)).filter((r) => r.status !== "cancelada");
  const tx = (await db.select().from(transactions)).filter((r) => !r.archivedAt);

  const revenue = salesRows.reduce(
    (sum, r) => sum + (Number(r.total) || 0),
    0
  );
  const pending = tx
    .filter((t) => t.status === "pendente" || t.status === "atrasado")
    .reduce((sum, t) => sum + (t.type === "receita" ? Number(t.amount) : 0), 0);
  const expenses = tx
    .filter((t) => t.type === "despesa")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    customers: c.length,
    products: p.length,
    printers: pr.length,
    materials: m.length,
    finishings: f.length,
    services: s.length,
    quotes: q.length,
    revenue,
    pending,
    expenses,
    recentQuotes: q.slice(-5).reverse(),
    lowStock: m.filter((x) => Number(x.stock) <= Number(x.minStock || 0)),
    birthdays: upcomingBirthdays(c),
  };
}

/**
 * Aniversariantes dos próximos 7 dias (inclusive hoje).
 *
 * A data de nascimento era coletada desde a v3.21.0 e só aparecia na
 * ficha individual — ninguém ia abrir 300 fichas para descobrir quem
 * faz aniversário. Numa gráfica isso é gancho comercial concreto.
 *
 * Comparação por dia/mês em string, sem `Date`: `birth_date` é
 * `date` puro e converter para Date arrastaria o fuso, fazendo um
 * aniversário do dia 1º aparecer no dia 31.
 */
export function upcomingBirthdays(rows: { id: number; name: string; tradeName: string | null; birthDate: string | null; phone: string | null; whatsapp: string | null; whatsappOptOut: boolean | null; status: string | null }[]) {
  /* A janela parte do "hoje" da LOJA, não do relógio do servidor: o
     container roda em UTC e depois das 21h no Brasil já é o dia
     seguinte lá, o que fazia o aniversariante de hoje desaparecer do
     painel algumas horas antes da meia-noite. */
  const hojeLoja = todayISO(); // "YYYY-MM-DD" em America/Sao_Paulo
  const [ano, mes, dia] = hojeLoja.split("-").map(Number);
  const janela: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia + i));
    janela.push(
      `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    );
  }

  return rows
    .filter((c) => c.birthDate && c.status !== "inativo" && c.status !== "bloqueado")
    .map((c) => {
      const mmdd = String(c.birthDate).slice(5, 10);
      return { c, mmdd, pos: janela.indexOf(mmdd) };
    })
    .filter((x) => x.pos >= 0)
    .sort((a, b) => a.pos - b.pos)
    .slice(0, 6)
    .map((x) => ({
      id: x.c.id,
      name: String(x.c.tradeName || x.c.name),
      day: `${x.mmdd.slice(3)}/${x.mmdd.slice(0, 2)}`,
      isToday: x.pos === 0,
      /* quem pediu para não receber WhatsApp não entra em campanha */
      contact: x.c.whatsappOptOut === true ? null : x.c.whatsapp || x.c.phone,
    }));
}

export async function getCatalog() {
  const [
    categories,
    consumables,
    printersList,
    materialsList,
    finishingsList,
    servicesList,
    pricingTableRows,
    formatRows,
  ] = await Promise.all([
    db.select().from(printerCategories).orderBy(asc(printerCategories.id)),
    db.select().from(printerConsumables),
    db.select().from(printers).orderBy(asc(printers.id)),
    db.select().from(materials).orderBy(asc(materials.id)),
    /* Arquivado sai da seleção mas continua no banco: produto e orçamento
       antigos seguem mostrando o nome certo. Sem este filtro (até a
       v3.46.0) o operador podia escolher um serviço que foi arquivado
       justamente para não ser mais usado. */
    db.select().from(finishingItems).where(isNull(finishingItems.archivedAt)).orderBy(asc(finishingItems.id)),
    db.select().from(services).where(isNull(services.archivedAt)).orderBy(asc(services.id)),
    db.select().from(pricingTables),
    db.select().from(printFormats).orderBy(asc(printFormats.id)),
  ]);
  return {
    categories,
    consumables,
    printers: printersList,
    materials: materialsList,
    finishings: finishingsList,
    services: servicesList,
    pricingTables: pricingTableRows,
    formats: formatRows,
  };
}

export async function getProductWithComponents(id: number) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id));
  if (!product) return null;
  const [fins, mats] = await Promise.all([
    db
      .select()
      .from(productFinishings)
      .where(eq(productFinishings.productId, id)),
    db
      .select()
      .from(productMaterials)
      .where(eq(productMaterials.productId, id)),
  ]);
  return { product, finishings: fins, materials: mats };
}

export async function listProducts() {
  return db.select().from(products).orderBy(desc(products.createdAt));
}

export async function getQuoteWithItems(id: number) {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!quote) return null;
  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, id));
  return { quote, items };
}
