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
import { and, eq, ilike, sql } from "drizzle-orm";
import { nextDocumentNumber } from "@/lib/documents";
import { applyDiscount, round2, toDecimalString, toNumber, toPositive } from "@/lib/money";

const finiteNumber = z.coerce.number().finite();

const orderItemSchema = z.object({
  productId: z.coerce.number().int().positive().nullable().optional(),
  serviceId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, "Descrição obrigatória").max(240),
  quantity: finiteNumber.positive("Quantidade deve ser maior que zero").max(1_000_000),
  unitPrice: finiteNumber.min(0, "Preço não pode ser negativo").max(10_000_000),
});

const orderPayloadSchema = z.object({
  quoteId: z.coerce.number().int().positive().nullable().optional(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  status: z.string().trim().max(40).optional(),
  productionStatus: z.string().trim().max(40).optional(),
  artStatus: z.string().trim().max(40).optional(),
  deliveryStatus: z.string().trim().max(40).optional(),
  financialStatus: z.string().trim().max(40).optional(),
  priority: z.string().trim().max(40).optional(),
  dueDate: z.string().trim().nullable().optional(),
  items: z.array(orderItemSchema).optional(),
  discount: finiteNumber.min(0).optional(),
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
  taxesInput: unknown
) {
  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const discount = applyDiscount(subtotal, discountInput, "value");
  const shippingFee = toPositive(shippingInput, 0);
  const taxes = toPositive(taxesInput, 0);
  const total = round2(subtotal - discount + shippingFee + taxes);
  return { subtotal, discount, shippingFee, taxes, total };
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
  const today = new Date().toISOString().slice(0, 10);
  const due = order.dueDate || today;
  const status = transactionStatusFromFinancial(order.financialStatus);
  const descriptionPrefix = `Pedido ${order.number}`;
  const [existing] = await tx
    .select()
    .from(transactions)
    .where(and(eq(transactions.category, "pedido"), ilike(transactions.description, `${descriptionPrefix}%`)))
    .limit(1);

  const data = {
    type: "receita" as const,
    category: "pedido",
    description: `${descriptionPrefix} — ${customerName || "Consumidor final"}`,
    amount: toDecimalString(order.total, 2),
    dueDate: due,
    paidDate: status === "pago" ? today : null,
    status,
    method: order.paymentMethod,
    customerId: order.customerId,
  };

  if (existing) {
    await tx.update(transactions).set(data).where(eq(transactions.id, existing.id));
  } else {
    await tx.insert(transactions).values(data);
  }
}

export async function createOrder(raw: unknown) {
  const parsed = parsePayload(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;

  const items = normalizeItems(d.items || []);
  if (items.length === 0) return { error: "Adicione ao menos um item ao pedido", status: 422 } satisfies SaleError;

  const policy = await getOrderPolicy();
  const totals = totalsFromItems(items, d.discount, d.shippingFee, d.taxes);
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
        d.taxes !== undefined ? d.taxes : current.taxes
      )
    : null;

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
      const today = new Date().toISOString().slice(0, 10);
      await tx.insert(transactions).values({
        type: "despesa",
        category: "estorno_pedido",
        description: `Cancelamento do pedido ${current.number} — ${cleanReason}`,
        amount: toDecimalString(total, 2),
        dueDate: today,
        paidDate: today,
        status: "pago",
        method: current.paymentMethod,
        customerId: current.customerId,
      });
    }

    return order;
  });

  return { ok: true as const, row: updated };
}
