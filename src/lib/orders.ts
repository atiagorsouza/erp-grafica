import "server-only";

import { z } from "zod";
import { db } from "@/db";
import {
  customers,
  deliveries,
  kanbanCards,
  orders,
  settings,
  transactions,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { nextDocumentNumber } from "@/lib/documents";
import { applyDiscount, round2, toDecimalString, toNumber, toPositive } from "@/lib/money";
import { upsertAutoTransaction } from "@/lib/finance";
import { toLocalISODate } from "@/lib/period";
import { todayISO } from "@/lib/period";

const finiteNumber = z.coerce.number().finite();

const orderItemSchema = z.object({
  productId: z.coerce.number().int().positive().nullable().optional(),
  serviceId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, "Descrição obrigatória").max(240),
  quantity: finiteNumber
    .min(0.001, "Quantidade deve ser maior que zero")
    .max(1_000_000),
  unitPrice: finiteNumber.min(0, "Preço não pode ser negativo").max(10_000_000),
});

/* Os cinco eixos de status do pedido.
   Eram `text` livre: um valor fora da lista era gravado e o pedido
   SUMIA das abas da tela (que filtram por valor exato), apesar de
   existir no banco, ter card no Kanban e lançamento no Financeiro. */
const ORDER_STATUS = ["aberto", "confirmado", "concluido", "cancelado"] as const;
const PRODUCTION_STATUS = ["aguardando", "em_producao", "concluido", "cancelado"] as const;
/* "aprovado"/"recusado" no masculino: é como a tela e o portal de artes
   já gravam. Mudar a grafia agora invalidaria os pedidos existentes. */
const ART_STATUS = ["nao_enviada", "enviada", "aprovado", "revisao", "recusado"] as const;
/* `cancelado` entra nos três eixos abaixo porque `cancelOrder` marca
   assim ao desfazer o pedido — sem isso o cancelamento seria recusado
   pela própria validação. */
const DELIVERY_STATUS = [
  "a_definir",
  "separado",
  "em_rota",
  "entregue",
  "retirado",
  "cancelado",
] as const;
const FINANCIAL_STATUS = ["pendente", "parcial", "pago", "estornado", "cancelado"] as const;
const PRIORITY = ["baixa", "normal", "alta", "urgente"] as const;

/** Enum com mensagem que lista os valores aceitos. */
function statusEnum<T extends readonly [string, ...string[]]>(values: T, label: string) {
  return z.enum(values, {
    message: `${label} inválido. Valores aceitos: ${values.join(", ")}`,
  });
}

const orderPayloadSchema = z.object({
  quoteId: z.coerce.number().int().positive().nullable().optional(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  status: statusEnum(ORDER_STATUS, "Status do pedido").optional(),
  productionStatus: statusEnum(PRODUCTION_STATUS, "Status de produção").optional(),
  artStatus: statusEnum(ART_STATUS, "Status da arte").optional(),
  deliveryStatus: statusEnum(DELIVERY_STATUS, "Status de entrega").optional(),
  financialStatus: statusEnum(FINANCIAL_STATUS, "Status financeiro").optional(),
  priority: statusEnum(PRIORITY, "Prioridade").optional(),
  dueDate: z.string().trim().nullable().optional(),
  items: z.array(orderItemSchema).optional(),
  discount: finiteNumber.min(0).optional(),
  /* Percentual acima de 100 zerava (ou invertia) o pedido. */
  discountMode: z.enum(["value", "percent"]).optional().default("value"),
  shippingFee: finiteNumber.min(0).optional(),
  taxes: finiteNumber.min(0).optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  channel: z.string().trim().max(80).optional(),
  sellerName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

type OrderPayload = z.infer<typeof orderPayloadSchema>;
type OrderItem = z.infer<typeof orderItemSchema> & { total: number };
type SaleError = { error: string; status: number; details?: unknown };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type OrderPolicy = {
  autoKanban: boolean;
  autoDelivery: boolean;
  autoTransaction: boolean;
  defaultPriority: string;
  defaultChannel: string;
  defaultSeller: string;
};

const PROD_TO_KANBAN: Record<string, string> = {
  aguardando: "backlog",
  em_producao: "producao",
  concluido: "pronto",
};

function enabled(v: string | null | undefined, fallback = false) {
  if (v == null || v === "") return fallback;
  return ["true", "1", "sim", "yes", "ativo"].includes(String(v).toLowerCase().trim());
}

async function getOrderPolicy(): Promise<OrderPolicy> {
  const rows = await db.select().from(settings);
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    autoKanban: enabled(map.get("order_auto_kanban"), true),
    autoDelivery: enabled(map.get("order_auto_delivery"), true),
    autoTransaction: enabled(map.get("order_auto_transaction"), true),
    defaultPriority: map.get("order_default_priority") || "normal",
    defaultChannel: map.get("order_default_channel") || "Atendimento",
    defaultSeller: map.get("quote_default_seller") || map.get("pdv_seller_default") || "OPERADOR",
  };
}

function parsePayload(raw: unknown): { ok: true; data: OrderPayload } | SaleError {
  const parsed = orderPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first ? `${first.path.join(".") || "dados"}: ${first.message}` : "Dados inválidos",
      status: 400,
      details: parsed.error.flatten(),
    };
  }
  return { ok: true, data: parsed.data };
}

function normalizeItems(input: OrderItem[] | OrderPayload["items"]): OrderItem[] {
  const items = input || [];
  return items.map((i) => {
    const qty = toPositive(i.quantity, 1);
    const price = toPositive(i.unitPrice, 0);
    return {
      productId: i.productId ? Number(i.productId) : null,
      serviceId: i.serviceId ? Number(i.serviceId) : null,
      description: String(i.description || "Item avulso").trim(),
      quantity: qty,
      unitPrice: round2(price),
      total: round2(qty * price),
    };
  });
}

function totalsFromItems(
  items: OrderItem[],
  discountInput: unknown,
  shippingInput: unknown,
  taxesInput: unknown,
  discountMode: "value" | "percent" = "value"
) {
  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const discount = applyDiscount(subtotal, discountInput, discountMode);
  const shippingFee = toPositive(shippingInput, 0);
  const taxes = toPositive(taxesInput, 0);
  const total = round2(subtotal - discount + shippingFee + taxes);
  return { subtotal, discount, shippingFee, taxes, total };
}

/**
 * Regras de valor do pedido.
 *
 * Sem elas, um desconto maior que o subtotal zerava o pedido e o zero
 * seguia para o Financeiro como receita de R$ 0,00 — mesmo buraco já
 * fechado no PDV (v3.14.0) e no Orçamento (v3.16.0).
 */
function assertOrderTotals(
  totals: { subtotal: number; discount: number; total: number },
  discountRaw: unknown,
  mode: "value" | "percent"
): SaleError | null {
  if (mode === "percent" && toNumber(discountRaw, 0) > 100) {
    return { error: "Desconto percentual não pode passar de 100%", status: 422 };
  }
  if (totals.discount > totals.subtotal) {
    return {
      error: `Desconto (${totals.discount.toFixed(2)}) não pode ser maior que o subtotal (${totals.subtotal.toFixed(2)})`,
      status: 422,
    };
  }
  if (totals.total <= 0) {
    return {
      error:
        totals.discount >= totals.subtotal && totals.subtotal > 0
          ? "Desconto não pode zerar o pedido. Para cortesia, registre um lançamento próprio."
          : "O total do pedido precisa ser maior que zero",
      status: 422,
    };
  }
  return null;
}

/** Prazo de entrega no passado nasce vencido e contamina Kanban e Entregas. */
function assertDueDate(dueDate: string | null | undefined): SaleError | null {
  if (!dueDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "Data de entrega inválida", status: 422 };
  }
  if (dueDate < toLocalISODate(new Date())) {
    return { error: "A data de entrega não pode ser uma data passada", status: 422 };
  }
  return null;
}

async function getCustomer(customerId: number | null) {
  if (!customerId) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  return customer || null;
}

function addressSnapshot(customer: Awaited<ReturnType<typeof getCustomer>>) {
  if (!customer) return null;
  return [customer.street, customer.number, customer.district, customer.city, customer.state, customer.cep]
    .filter(Boolean)
    .join(", ") || null;
}

function cardDescription(items: OrderItem[]) {
  return items.slice(0, 3).map((i) => `${i.quantity}× ${i.description}`).join(" · ") || "Ordem de produção";
}

async function syncKanbanCard(tx: Tx, order: typeof orders.$inferSelect, customerName: string | null) {
  const column = PROD_TO_KANBAN[order.productionStatus] || "backlog";
  const items = normalizeItems(Array.isArray(order.items) ? (order.items as OrderItem[]) : []);
  const cardData = {
    title: `Pedido ${order.number}`,
    description: cardDescription(items),
    column,
    customerId: order.customerId,
    customerName: customerName || "Consumidor final",
    productId: items.find((i) => i.productId)?.productId || null,
    priority: order.priority || "normal",
    dueDate: order.dueDate || null,
    estimatedValue: toDecimalString(order.total, 2),
    orderId: order.id,
    quoteId: order.quoteId,
    updatedAt: new Date(),
  };

  const [existingByOrder] = await tx.select().from(kanbanCards).where(eq(kanbanCards.orderId, order.id)).limit(1);
  if (existingByOrder) {
    await tx.update(kanbanCards).set(cardData).where(eq(kanbanCards.id, existingByOrder.id));
    return;
  }

  if (order.quoteId) {
    const [existingByQuote] = await tx
      .select()
      .from(kanbanCards)
      .where(eq(kanbanCards.quoteId, order.quoteId))
      .limit(1);
    if (existingByQuote) {
      await tx.update(kanbanCards).set(cardData).where(eq(kanbanCards.id, existingByQuote.id));
      return;
    }
  }

  await tx.insert(kanbanCards).values(cardData);
}

async function syncDelivery(tx: Tx, order: typeof orders.$inferSelect, customer: Awaited<ReturnType<typeof getCustomer>>) {
  const [existing] = await tx.select().from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
  const data = {
    customerId: order.customerId,
    status: order.deliveryStatus === "a_definir" ? "aguardando" : order.deliveryStatus,
    addressSnapshot: addressSnapshot(customer),
  };
  if (existing) {
    await tx.update(deliveries).set(data).where(eq(deliveries.id, existing.id));
  } else {
    await tx.insert(deliveries).values({
      orderId: order.id,
      customerId: order.customerId,
      method: "retirada",
      status: data.status,
      addressSnapshot: data.addressSnapshot,
      notes: "Gerada automaticamente pelo módulo Pedidos & OS.",
    });
  }
}

function transactionStatusFromFinancial(financialStatus: string): "pago" | "pendente" {
  if (financialStatus === "pago") return "pago";
  return "pendente";
}

async function syncFinancial(tx: Tx, order: typeof orders.$inferSelect, customerName: string | null) {
  /* ----------------------------------------------------------------
   * v3.11.0 — o casamento passou a ser por orderId.
   *
   * Antes era `ilike(description, "Pedido PED-2026-001%")`, que casa
   * também com PED-2026-0010, 0011, 0012… A partir do décimo pedido
   * a atualização financeira de um sobrescrevia a de outro.
   * --------------------------------------------------------------- */
  await upsertAutoTransaction(tx, {
    type: "receita",
    category: "pedido",
    description: `Pedido ${order.number} — ${customerName || "Consumidor final"}`,
    amount: toNumber(order.total, 0),
    dueDate: order.dueDate || todayISO(),
    status: transactionStatusFromFinancial(order.financialStatus),
    method: order.paymentMethod,
    customerId: order.customerId,
    orderId: order.id,
  });
}

export async function createOrder(raw: unknown) {
  const parsed = parsePayload(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;

  const items = normalizeItems(d.items || []);
  if (items.length === 0) return { error: "Adicione ao menos um item ao pedido", status: 422 } satisfies SaleError;

  const policy = await getOrderPolicy();
  const totals = totalsFromItems(items, d.discount, d.shippingFee, d.taxes, d.discountMode);

  const totalsError = assertOrderTotals(totals, d.discount ?? 0, d.discountMode || "value");
  if (totalsError) return totalsError;

  const dueError = assertDueDate(d.dueDate);
  if (dueError) return dueError;

  const customerId = d.customerId ? Number(d.customerId) : null;
  const customer = await getCustomer(customerId);
  const customerName = customer ? customer.tradeName || customer.name : null;
  const number = await nextDocumentNumber("order");

  const row = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        number,
        quoteId: d.quoteId ? Number(d.quoteId) : null,
        customerId,
        status: d.status || "confirmado",
        productionStatus: d.productionStatus || "aguardando",
        artStatus: d.artStatus || "nao_enviada",
        deliveryStatus: d.deliveryStatus || "a_definir",
        financialStatus: d.financialStatus || "pendente",
        priority: d.priority || policy.defaultPriority,
        dueDate: d.dueDate ? String(d.dueDate) : null,
        items,
        subtotal: toDecimalString(totals.subtotal),
        discount: toDecimalString(totals.discount),
        taxes: toDecimalString(totals.taxes),
        shippingFee: toDecimalString(totals.shippingFee),
        total: toDecimalString(totals.total),
        paymentMethod: d.paymentMethod || "A definir",
        channel: d.channel || policy.defaultChannel,
        sellerName: d.sellerName || policy.defaultSeller,
        notes: d.notes ? String(d.notes) : null,
      })
      .returning();

    if (policy.autoDelivery) await syncDelivery(tx, order, customer);
    if (policy.autoKanban) await syncKanbanCard(tx, order, customerName);
    if (policy.autoTransaction) await syncFinancial(tx, order, customerName);

    return order;
  });

  return { ok: true as const, row };
}

export async function updateOrder(orderId: number, raw: unknown) {
  const parsed = parsePayload(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;

  const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current) return { error: "Pedido não encontrado", status: 404 } satisfies SaleError;
  if (current.status === "cancelado" && d.status !== "cancelado") {
    return { error: "Pedido cancelado não pode ser reaberto por edição simples", status: 409 } satisfies SaleError;
  }

  if (d.status === "cancelado") {
    return cancelOrder(orderId, d.notes || "Cancelamento solicitado");
  }

  const policy = await getOrderPolicy();
  const hasItemsPatch = Array.isArray(d.items);
  const items = hasItemsPatch
    ? normalizeItems(d.items)
    : normalizeItems(Array.isArray(current.items) ? (current.items as OrderItem[]) : []);
  if (hasItemsPatch && items.length === 0) {
    return { error: "Pedido precisa ter ao menos um item", status: 422 } satisfies SaleError;
  }

  const totals = hasItemsPatch || d.discount !== undefined || d.shippingFee !== undefined || d.taxes !== undefined
    ? totalsFromItems(
        items,
        d.discount !== undefined ? d.discount : current.discount,
        d.shippingFee !== undefined ? d.shippingFee : current.shippingFee,
        d.taxes !== undefined ? d.taxes : current.taxes,
        d.discountMode
      )
    : null;

  /* As mesmas regras da criação valem na edição: sem isto, bastava
     editar o pedido depois para zerá-lo. */
  if (totals) {
    const totalsError = assertOrderTotals(
      totals,
      d.discount !== undefined ? d.discount : current.discount,
      d.discountMode || "value"
    );
    if (totalsError) return totalsError;
  }

  const dueError = assertDueDate(d.dueDate);
  if (dueError) return dueError;

  const customerId = d.customerId !== undefined ? (d.customerId ? Number(d.customerId) : null) : current.customerId;
  const customer = await getCustomer(customerId);
  const customerName = customer ? customer.tradeName || customer.name : null;

  const updated = await db.transaction(async (tx) => {
    const patch: Partial<typeof orders.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (d.customerId !== undefined) patch.customerId = customerId;
    if (d.status !== undefined) patch.status = d.status;
    if (d.productionStatus !== undefined) {
      patch.productionStatus = d.productionStatus;
      if (d.productionStatus === "concluido") patch.status = "concluido";
      else if (!d.status) patch.status = "confirmado";
    }
    if (d.artStatus !== undefined) patch.artStatus = d.artStatus;
    if (d.deliveryStatus !== undefined) patch.deliveryStatus = d.deliveryStatus;
    if (d.financialStatus !== undefined) patch.financialStatus = d.financialStatus;
    if (d.priority !== undefined) patch.priority = d.priority;
    if (d.dueDate !== undefined) patch.dueDate = d.dueDate ? String(d.dueDate) : null;
    if (d.paymentMethod !== undefined) patch.paymentMethod = d.paymentMethod || "A definir";
    if (d.channel !== undefined) patch.channel = d.channel || policy.defaultChannel;
    if (d.sellerName !== undefined) patch.sellerName = d.sellerName || policy.defaultSeller;
    if (d.notes !== undefined) patch.notes = d.notes ? String(d.notes) : null;

    if (hasItemsPatch) patch.items = items;
    if (totals) {
      patch.subtotal = toDecimalString(totals.subtotal);
      patch.discount = toDecimalString(totals.discount);
      patch.taxes = toDecimalString(totals.taxes);
      patch.shippingFee = toDecimalString(totals.shippingFee);
      patch.total = toDecimalString(totals.total);
    }

    const [order] = await tx.update(orders).set(patch).where(eq(orders.id, orderId)).returning();

    if (policy.autoDelivery) await syncDelivery(tx, order, customer);
    if (policy.autoKanban) await syncKanbanCard(tx, order, customerName);
    if (policy.autoTransaction) await syncFinancial(tx, order, customerName);

    return order;
  });

  return { ok: true as const, row: updated };
}

export async function cancelOrder(orderId: number, reason: string) {
  const cleanReason = String(reason || "").trim();
  if (cleanReason.length < 3) {
    return { error: "Informe o motivo do cancelamento", status: 400 } satisfies SaleError;
  }
  const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current) return { error: "Pedido não encontrado", status: 404 } satisfies SaleError;
  if (current.status === "cancelado") {
    return { error: "Pedido já está cancelado", status: 409 } satisfies SaleError;
  }

  const updated = await db.transaction(async (tx) => {
    const notes = [current.notes, `CANCELADO: ${cleanReason}`].filter(Boolean).join("\n");
    const [order] = await tx
      .update(orders)
      .set({
        status: "cancelado",
        productionStatus: current.productionStatus,
        deliveryStatus: "cancelado",
        financialStatus: "cancelado",
        notes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    const orderDeliveries = await tx.select().from(deliveries).where(eq(deliveries.orderId, orderId));
    for (const delivery of orderDeliveries) {
      await tx
        .update(deliveries)
        .set({
          status: "cancelado",
          notes: [delivery.notes, `Pedido cancelado: ${cleanReason}`].filter(Boolean).join("\n"),
        })
        .where(eq(deliveries.id, delivery.id));
    }

    await tx
      .update(kanbanCards)
      .set({ column: "cancelado", updatedAt: new Date() })
      .where(eq(kanbanCards.orderId, orderId));

    const total = toNumber(current.total, 0);
    if (total > 0) {
      const today = todayISO();
      /* estorno vinculado ao pedido, para reconciliação e auditoria */
      await upsertAutoTransaction(tx, {
        type: "despesa",
        category: "estorno_pedido",
        description: `Cancelamento do pedido ${current.number} — ${cleanReason}`,
        amount: total,
        dueDate: today,
        paidDate: today,
        status: "pago",
        method: current.paymentMethod,
        customerId: current.customerId,
        orderId: current.id,
      });

      /* a receita original deixa de ser esperada */
      await tx
        .update(transactions)
        .set({
          archivedAt: new Date(),
          archiveReason: `Pedido cancelado: ${cleanReason}`,
        })
        .where(
          and(
            eq(transactions.orderId, current.id),
            eq(transactions.category, "pedido"),
            sql`${transactions.status} <> 'pago'`
          )
        );
    }

    return order;
  });

  return { ok: true as const, row: updated };
}
