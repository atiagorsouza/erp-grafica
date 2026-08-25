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
import { eq, desc, asc, isNull, sql, inArray } from "drizzle-orm";
import { todayISO } from "@/lib/period";

/* ─────────────────────────────────────────────────────────────
   Paginação no servidor (v3.62.0)

   Até aqui as telas carregavam a tabela inteira e filtravam no
   navegador. Com ~125 pedidos/mês isso viraria alguns MB de HTML
   por abertura de tela em cerca de um ano — o celular sente
   primeiro. Estas funções trazem só a página pedida.

   Duas armadilhas que o desenho precisa respeitar:

   1. A busca da tela varre SEIS campos, incluindo dados do
      cliente (outra tabela) e a descrição dos itens (dentro do
      JSONB). Paginar sem reproduzir isso faria a busca emagrecer
      em silêncio: o usuário procuraria "banner" e não acharia.
   2. Os contadores das abas ("Em aberto", "Atrasados"...) somam a
      base toda. Se virassem contagem da página, passariam a
      mentir. Por isso são COUNT separados, e não `.length` da
      lista devolvida.
   ───────────────────────────────────────────────────────────── */

/* 10 por página: o dono achou 50 demais para ler de uma vez. Continua
   ajustável pela URL (?por=) e, mais para frente, pelo Painel. */
export const TAMANHO_PAGINA_PADRAO = 10;

export type PaginaPedidos = {
  linhas: Awaited<ReturnType<typeof getOrders>>;
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
  contadores: Record<string, number>;
};

/** Filtros das abas da tela de Pedidos, traduzidos para SQL. */
function condicaoFiltroPedido(filtro: string) {
  const hoje = todayISO();
  const encerrado = sql`(${orders.status} = 'cancelado' OR ${orders.productionStatus} = 'concluido')`;
  switch (filtro) {
    case "ativos":
      return sql`NOT ${encerrado}`;
    case "atrasados":
      // Mesma regra do dueInfo() da tela: vencido e ainda não encerrado.
      return sql`${orders.dueDate} IS NOT NULL AND NOT ${encerrado} AND ${orders.dueDate} < ${hoje}`;
    case "aguardando":
    case "em_producao":
    case "concluido":
      return sql`(${orders.productionStatus} = ${filtro} OR ${orders.status} = ${filtro})`;
    default:
      return sql`TRUE`;
  }
}

/** Busca textual equivalente à da tela: número, cliente e itens. */
function condicaoBuscaPedido(termo: string) {
  const t = termo.trim().toLowerCase();
  if (!t) return sql`TRUE`;
  const like = `%${t}%`;
  return sql`(
    lower(${orders.number}) LIKE ${like}
    OR EXISTS (
      SELECT 1 FROM ${customers} c
       WHERE c.id = ${orders.customerId}
         AND (
           lower(c.name) LIKE ${like}
           OR lower(coalesce(c.trade_name, '')) LIKE ${like}
           OR lower(coalesce(c.document, '')) LIKE ${like}
           OR lower(coalesce(c.phone, '')) LIKE ${like}
         )
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(${orders.items}) AS item
       WHERE lower(coalesce(item->>'description', '')) LIKE ${like}
    )
  )`;
}

export async function getOrdersPage(opcoes: {
  pagina?: number;
  porPagina?: number;
  busca?: string;
  filtro?: string;
} = {}): Promise<PaginaPedidos> {
  const porPagina = Math.min(Math.max(opcoes.porPagina || TAMANHO_PAGINA_PADRAO, 1), 200);
  const busca = opcoes.busca || "";
  const filtro = opcoes.filtro || "ativos";

  const where = sql`${condicaoFiltroPedido(filtro)} AND ${condicaoBuscaPedido(busca)}`;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(opcoes.pagina || 1, 1), totalPaginas);

  const linhas = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);

  return { linhas, total, pagina, porPagina, totalPaginas, contadores: await contadoresPedidos(busca) };
}

/** Contadores das abas — sempre sobre a base inteira, nunca sobre a página. */
export async function contadoresPedidos(busca = "") {
  const b = condicaoBuscaPedido(busca);
  const [linha] = await db
    .select({
      ativos: sql<number>`count(*) FILTER (WHERE ${condicaoFiltroPedido("ativos")})::int`,
      atrasados: sql<number>`count(*) FILTER (WHERE ${condicaoFiltroPedido("atrasados")})::int`,
      aguardando: sql<number>`count(*) FILTER (WHERE ${orders.productionStatus} = 'aguardando')::int`,
      em_producao: sql<number>`count(*) FILTER (WHERE ${orders.productionStatus} = 'em_producao')::int`,
      concluido: sql<number>`count(*) FILTER (WHERE ${orders.productionStatus} = 'concluido')::int`,
      todos: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(b);
  return linha as unknown as Record<string, number>;
}

/** Anexos das telas de pedido, restritos aos pedidos visíveis na página. */
export async function auxiliaresDosPedidos(idsPedidos: number[]) {
  if (idsPedidos.length === 0) return { approvals: [], schedules: [], deliveries: [] };
  const [approvalRows, scheduleRows, deliveryRows] = await Promise.all([
    db.select().from(artApprovals).where(inArray(artApprovals.orderId, idsPedidos)).orderBy(desc(artApprovals.createdAt)),
    db.select().from(productionSchedules).where(inArray(productionSchedules.orderId, idsPedidos)).orderBy(asc(productionSchedules.scheduledDate)),
    db.select().from(deliveries).where(inArray(deliveries.orderId, idsPedidos)),
  ]);
  return { approvals: approvalRows, schedules: scheduleRows, deliveries: deliveryRows };
}

/* ── ORÇAMENTOS ───────────────────────────────────────────────
   Mesmo desenho de Pedidos. Diferença: os itens moram em outra
   tabela (`quote_items`), então a busca por descrição é um EXISTS
   com join, e não uma varredura de JSON. */

function condicaoBuscaOrcamento(termo: string) {
  const t = termo.trim().toLowerCase();
  if (!t) return sql`TRUE`;
  const like = `%${t}%`;
  return sql`(
    lower(${quotes.number}) LIKE ${like}
    OR EXISTS (
      SELECT 1 FROM ${customers} c
       WHERE c.id = ${quotes.customerId}
         AND (
           lower(c.name) LIKE ${like}
           OR lower(coalesce(c.trade_name, '')) LIKE ${like}
           OR lower(coalesce(c.document, '')) LIKE ${like}
         )
    )
    OR EXISTS (
      SELECT 1 FROM ${quoteItems} qi
       WHERE qi.quote_id = ${quotes.id}
         AND lower(coalesce(qi.description, '')) LIKE ${like}
    )
  )`;
}

export async function getQuotesPage(opcoes: {
  pagina?: number;
  porPagina?: number;
  busca?: string;
  filtro?: string;
} = {}) {
  const porPagina = Math.min(Math.max(opcoes.porPagina || TAMANHO_PAGINA_PADRAO, 1), 200);
  const busca = opcoes.busca || "";
  const filtro = opcoes.filtro || "all";

  const buscaSql = condicaoBuscaOrcamento(busca);
  const where =
    filtro === "all" ? buscaSql : sql`${buscaSql} AND ${quotes.status}::text = ${filtro}`;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(quotes)
    .where(where);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(opcoes.pagina || 1, 1), totalPaginas);

  const linhas = await db
    .select()
    .from(quotes)
    .where(where)
    .orderBy(desc(quotes.createdAt))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);

  /* Contadores por status sobre a base inteira (respeitando a busca),
     para as abas não passarem a contar só a página. */
  const [c] = await db
    .select({
      rascunho: sql<number>`count(*) FILTER (WHERE ${quotes.status}::text = 'rascunho')::int`,
      enviado: sql<number>`count(*) FILTER (WHERE ${quotes.status}::text = 'enviado')::int`,
      aprovado: sql<number>`count(*) FILTER (WHERE ${quotes.status}::text = 'aprovado')::int`,
      recusado: sql<number>`count(*) FILTER (WHERE ${quotes.status}::text = 'recusado')::int`,
      expirado: sql<number>`count(*) FILTER (WHERE ${quotes.status}::text = 'expirado')::int`,
      todos: sql<number>`count(*)::int`,
    })
    .from(quotes)
    .where(buscaSql);

  /* Só os itens dos orçamentos visíveis — antes vinha a tabela toda. */
  const ids = linhas.map((q) => Number(q.id));
  const itens = ids.length
    ? await db.select().from(quoteItems).where(inArray(quoteItems.quoteId, ids))
    : [];

  return {
    linhas,
    itens,
    total,
    pagina,
    porPagina,
    totalPaginas,
    contadores: c as unknown as Record<string, number>,
  };
}

/* ── CLIENTES ─────────────────────────────────────────────────
   A busca desta tela varre DEZ campos, incluindo IE, RG e nome do
   contato — segundo o comentário do código, são os números que o
   cliente informa ao telefone quando não lembra o CNPJ. Reduzir
   isso a "nome e documento" quebraria o atendimento sem avisar. */

function condicaoBuscaCliente(termo: string) {
  const t = termo.trim().toLowerCase();
  if (!t) return sql`TRUE`;
  const like = `%${t}%`;
  return sql`(
    lower(${customers.name}) LIKE ${like}
    OR lower(coalesce(${customers.tradeName}, '')) LIKE ${like}
    OR lower(coalesce(${customers.document}, '')) LIKE ${like}
    OR lower(coalesce(${customers.email}, '')) LIKE ${like}
    OR lower(coalesce(${customers.phone}, '')) LIKE ${like}
    OR lower(coalesce(${customers.whatsapp}, '')) LIKE ${like}
    OR lower(coalesce(${customers.stateRegistration}, '')) LIKE ${like}
    OR lower(coalesce(${customers.municipalRegistration}, '')) LIKE ${like}
    OR lower(coalesce(${customers.rg}, '')) LIKE ${like}
    OR lower(coalesce(${customers.contactName}, '')) LIKE ${like}
  )`;
}

export async function getCustomersPage(opcoes: {
  pagina?: number;
  porPagina?: number;
  busca?: string;
  status?: string;
  origem?: string;
} = {}) {
  const porPagina = Math.min(Math.max(opcoes.porPagina || TAMANHO_PAGINA_PADRAO, 1), 200);
  const busca = opcoes.busca || "";
  const status = opcoes.status || "all";
  const origem = opcoes.origem || "all";

  const partes = [condicaoBuscaCliente(busca)];
  if (status !== "all") partes.push(sql`${customers.status} = ${status}`);
  if (origem !== "all") partes.push(sql`coalesce(${customers.origin}, '') = ${origem}`);
  const where = partes.reduce((acc, p) => sql`${acc} AND ${p}`);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(customers)
    .where(where);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(opcoes.pagina || 1, 1), totalPaginas);

  const linhas = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(asc(customers.name))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);

  /* LTV (vendas do PDV + pedidos) calculado no banco e só para os
     clientes visíveis. Antes a tela somava isso no navegador, o que
     exigia baixar as tabelas de vendas e pedidos inteiras.

     Diferença de comportamento, de propósito: a soma antiga incluía
     vendas CANCELADAS no faturamento do cliente. O resto do sistema
     já as exclui (`reports.ts` e `getDashboardStats`), então o LTV
     era a exceção — agora segue a mesma regra. Onde houver venda
     cancelada, o valor exibido cai; o número novo é o certo. */
  const ids = linhas.map((c) => Number(c.id));
  const ltv: Record<number, number> = {};
  if (ids.length) {
    const somas = await db.execute(sql`
      SELECT cid, SUM(t)::float8 AS total FROM (
        SELECT customer_id AS cid, COALESCE(total, 0) AS t FROM ${sales}
         WHERE customer_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
           AND status IS DISTINCT FROM 'cancelada'
        UNION ALL
        SELECT customer_id AS cid, COALESCE(total, 0) AS t FROM ${orders}
         WHERE customer_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
      ) u GROUP BY cid`);
    for (const r of somas.rows as Array<{ cid: number; total: number }>) {
      ltv[Number(r.cid)] = Number(r.total) || 0;
    }
  }

  /* Contadores e lista de origens sempre sobre a carteira inteira:
     são o retrato da base, não da página. */
  const [tot] = await db
    .select({ todos: sql<number>`count(*)::int` })
    .from(customers);

  const origensRows = await db
    .select({
      origem: sql<string>`coalesce(${customers.origin}, '')`,
      n: sql<number>`count(*)::int`,
    })
    .from(customers)
    .where(sql`coalesce(${customers.origin}, '') <> ''`)
    .groupBy(sql`coalesce(${customers.origin}, '')`)
    .orderBy(sql`count(*) DESC`);

  return {
    linhas,
    ltv,
    origens: origensRows.map((r) => [r.origem, Number(r.n)] as [string, number]),
    total,
    totalCarteira: Number(tot?.todos ?? 0),
    pagina,
    porPagina,
    totalPaginas,
  };
}

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
