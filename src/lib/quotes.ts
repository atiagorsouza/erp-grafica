import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { customers, kanbanCards, orders, quoteItems, quotes, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nextDocumentNumber } from "@/lib/documents";
import { getPricingDefaults } from "@/lib/settings";
import { applyDiscount, round2, toDecimalString, toNumber, toPositive } from "@/lib/money";

export type QuoteError = { error: string; status: number; details?: unknown };

const finiteNumber = z.coerce.number().finite();
const quoteStatus = z.enum(["rascunho", "enviado", "aprovado", "recusado", "expirado"]);

const itemSchema = z.object({
  productId: z.coerce.number().int().positive().nullable().optional(),
  serviceId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1, "Descrição obrigatória").max(240),
  quantity: finiteNumber.positive("Quantidade deve ser maior que zero").max(1_000_000),
  unitPrice: finiteNumber.min(0, "Preço não pode ser negativo").max(10_000_000),
});

const quotePayload = z.object({
  customerId: z.coerce.number().int().positive().nullable().optional(),
  status: quoteStatus.optional(),
  validUntil: z.string().trim().nullable().optional(),
  items: z.array(itemSchema).optional(),
  discount: finiteNumber.min(0).optional(),
  discountMode: z.enum(["value", "percent"]).optional().default("value"),
  shippingFee: finiteNumber.min(0).optional(),
  taxes: finiteNumber.min(0).optional(),
  paymentMethod: z.string().trim().max(120).optional(),
  channel: z.string().trim().max(80).optional(),
  sellerName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1500).nullable().optional(),
});

type QuotePayload = z.infer<typeof quotePayload>;
type QuoteItem = z.infer<typeof itemSchema> & { total: number };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type QuoteDefaults = {
  validityDays: number;
  payment: string;
  seller: string;
  notes: string;
};

async function getQuoteDefaults(): Promise<QuoteDefaults> {
  const rows = await db.select().from(settings).where(eq(settings.category, "orcamentos"));
  const map = new Map(rows.map((r) => [r.key, r.value || ""]));
  return {
    validityDays: Math.max(1, Math.min(365, Number(map.get("quote_validity_days") || 10))),
    payment: map.get("quote_default_payment") || "PIX",
    seller: map.get("quote_default_seller") || "OPERADOR",
    notes: map.get("quote_default_notes") || "Validade conforme prazo informado. Produção inicia após aprovação.",
  };
}

function parse(raw: unknown): { ok: true; data: QuotePayload } | QuoteError {
  const parsed = quotePayload.safeParse(raw);
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

function normalizeItems(input: QuotePayload["items"] | QuoteItem[]): QuoteItem[] {
  return (input || []).map((i) => {
    const quantity = toPositive(i.quantity, 1);
    const unitPrice = round2(toPositive(i.unitPrice, 0));
    return {
      productId: i.productId ? Number(i.productId) : null,
      serviceId: i.serviceId ? Number(i.serviceId) : null,
      description: String(i.description || "Item avulso").trim(),
      quantity,
      unitPrice,
      total: round2(quantity * unitPrice),
    };
  });
}

function calcTotals(items: QuoteItem[], discountRaw: unknown, discountMode: "value" | "percent", shippingRaw: unknown, taxesRaw: unknown) {
  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const discount = applyDiscount(subtotal, discountRaw, discountMode);
  const shippingFee = toPositive(shippingRaw, 0);
  const taxes = toPositive(taxesRaw, 0);
  const total = round2(subtotal - discount + shippingFee + taxes);
  return { subtotal, discount, shippingFee, taxes, total };
}

async function saveItemsTx(tx: Tx, quoteId: number, items: QuoteItem[]) {
  await tx.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  for (const it of items) {
    await tx.insert(quoteItems).values({
      quoteId,
      description: it.description,
      productId: it.productId || null,
      serviceId: it.serviceId || null,
      quantity: toDecimalString(it.quantity, 3),
      unitPrice: toDecimalString(it.unitPrice, 4),
      total: toDecimalString(it.total, 4),
    });
  }
}

async function loadItems(quoteId: number): Promise<QuoteItem[]> {
  const rows = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  return rows.map((i) => ({
    productId: i.productId,
    serviceId: i.serviceId,
    description: i.description,
    quantity: toNumber(i.quantity, 1),
    unitPrice: toNumber(i.unitPrice, 0),
    total: toNumber(i.total, 0),
  }));
}

async function customerName(customerId: number | null) {
  if (!customerId) return "Consumidor final";
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  return customer ? customer.tradeName || customer.name : "Consumidor final";
}

async function syncKanbanForQuote(tx: Tx, quote: typeof quotes.$inferSelect, items: QuoteItem[]) {
  const [existingOrder] = await tx.select().from(orders).where(eq(orders.quoteId, quote.id)).limit(1);
  if (existingOrder) return;

  const [existing] = await tx.select().from(kanbanCards).where(eq(kanbanCards.quoteId, quote.id)).limit(1);

  if (quote.status !== "aprovado") {
    if (existing) {
      await tx
        .update(kanbanCards)
        .set({ column: quote.status === "recusado" || quote.status === "expirado" ? "cancelado" : "backlog", updatedAt: new Date() })
        .where(eq(kanbanCards.id, existing.id));
    }
    return;
  }

  const summary = items.slice(0, 3).map((i) => `${i.quantity}× ${i.description}`).join(" · ");
  const data = {
    title: `Orçamento ${quote.number}`,
    description: summary || "Orçamento aprovado — aguardando conversão em OS.",
    column: "backlog",
    customerId: quote.customerId || null,
    customerName: await customerName(quote.customerId),
    productId: items.find((i) => i.productId)?.productId || null,
    priority: "normal",
    quoteId: quote.id,
    estimatedValue: toDecimalString(quote.total, 2),
    dueDate: quote.validUntil || null,
    updatedAt: new Date(),
  };

  if (existing) await tx.update(kanbanCards).set(data).where(eq(kanbanCards.id, existing.id));
  else await tx.insert(kanbanCards).values(data);
}

export async function createQuote(raw: unknown) {
  const parsed = parse(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const pricingDefaults = await getPricingDefaults();
  const quoteDefaults = await getQuoteDefaults();
  const items = normalizeItems(d.items || []);
  if (items.length === 0) return { error: "Adicione ao menos um item ao orçamento", status: 422 } satisfies QuoteError;

  const totals = calcTotals(items, d.discount ?? 0, d.discountMode || "value", d.shippingFee ?? 0, d.taxes ?? 0);
  const number = await nextDocumentNumber("quote");
  const validUntil = d.validUntil || new Date(Date.now() + quoteDefaults.validityDays * 86400000).toISOString().slice(0, 10);

  const row = await db.transaction(async (tx) => {
    const [quote] = await tx
      .insert(quotes)
      .values({
        number,
        customerId: d.customerId || null,
        status: d.status || "rascunho",
        validUntil,
        subtotal: toDecimalString(totals.subtotal),
        discount: toDecimalString(totals.discount),
        taxes: toDecimalString(totals.taxes),
        shippingFee: toDecimalString(totals.shippingFee),
        total: toDecimalString(totals.total),
        paymentMethod: d.paymentMethod || quoteDefaults.payment,
        channel: d.channel || "Atendimento",
        sellerName: d.sellerName || quoteDefaults.seller || pricingDefaults.pdv_seller_default || "OPERADOR",
        notes: d.notes || quoteDefaults.notes || null,
      })
      .returning();
    await saveItemsTx(tx, quote.id, items);
    await syncKanbanForQuote(tx, quote, items);
    return quote;
  });

  return { ok: true as const, row };
}

export async function updateQuote(id: number, raw: unknown) {
  const [current] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!current) return { error: "Orçamento não encontrado", status: 404 } satisfies QuoteError;

  const [existingOrder] = await db.select().from(orders).where(eq(orders.quoteId, id)).limit(1);
  const parsed = parse(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;

  if (existingOrder && (d.items || d.discount !== undefined || d.shippingFee !== undefined || d.taxes !== undefined)) {
    return { error: "Orçamento já convertido em Pedido/OS não pode alterar valores ou itens", status: 409 } satisfies QuoteError;
  }

  const hasItemsPatch = Array.isArray(d.items);
  const items = hasItemsPatch ? normalizeItems(d.items) : await loadItems(id);
  if (hasItemsPatch && items.length === 0) return { error: "Orçamento precisa ter ao menos um item", status: 422 } satisfies QuoteError;

  const shouldRecalc = hasItemsPatch || d.discount !== undefined || d.shippingFee !== undefined || d.taxes !== undefined;
  const totals = shouldRecalc
    ? calcTotals(
        items,
        d.discount !== undefined ? d.discount : current.discount,
        d.discountMode || "value",
        d.shippingFee !== undefined ? d.shippingFee : current.shippingFee,
        d.taxes !== undefined ? d.taxes : current.taxes
      )
    : null;

  const row = await db.transaction(async (tx) => {
    const patch: Partial<typeof quotes.$inferInsert> = {};
    if (d.customerId !== undefined) patch.customerId = d.customerId || null;
    if (d.status !== undefined) patch.status = d.status;
    if (d.validUntil !== undefined) patch.validUntil = d.validUntil || null;
    if (d.paymentMethod !== undefined) patch.paymentMethod = d.paymentMethod || "PIX";
    if (d.channel !== undefined) patch.channel = d.channel || "Atendimento";
    if (d.sellerName !== undefined) patch.sellerName = d.sellerName || "OPERADOR";
    if (d.notes !== undefined) patch.notes = d.notes || null;
    if (totals) {
      patch.subtotal = toDecimalString(totals.subtotal);
      patch.discount = toDecimalString(totals.discount);
      patch.taxes = toDecimalString(totals.taxes);
      patch.shippingFee = toDecimalString(totals.shippingFee);
      patch.total = toDecimalString(totals.total);
    }

    const [quote] = await tx.update(quotes).set(patch).where(eq(quotes.id, id)).returning();
    if (hasItemsPatch) await saveItemsTx(tx, id, items);
    await syncKanbanForQuote(tx, quote, items);
    return quote;
  });

  return { ok: true as const, row };
}

export async function archiveQuote(id: number, reason = "Arquivado") {
  const [current] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!current) return { error: "Orçamento não encontrado", status: 404 } satisfies QuoteError;
  const [existingOrder] = await db.select().from(orders).where(eq(orders.quoteId, id)).limit(1);
  if (existingOrder) return { error: "Orçamento convertido em Pedido/OS não pode ser arquivado", status: 409 } satisfies QuoteError;
  const notes = [current.notes, `ARQUIVADO/RECUSADO: ${reason}`].filter(Boolean).join("\n");
  return updateQuote(id, { status: "recusado", notes });
}

export async function repairExpiredQuotes() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select().from(quotes).where(eq(quotes.status, "enviado"));
  let count = 0;
  for (const q of rows) {
    if (q.validUntil && q.validUntil < today) {
      await updateQuote(q.id, { status: "expirado" });
      count++;
    }
  }
  return count;
}
