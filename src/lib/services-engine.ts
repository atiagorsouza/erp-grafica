import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { finishingItems, productFinishings, products, quoteItems, services } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { toDecimalString } from "@/lib/money";

export type ServicesEngineError = { error: string; status: number; details?: unknown };

const finite = z.coerce.number().finite();

const serviceSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(160),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  type: z.enum(["proprio", "terceirizado"]).default("proprio"),
  baseCost: finite.min(0).max(999999999).default(0),
  estimatedHours: finite.min(0).max(999999).default(0),
  becomesProduct: z.boolean().default(false),
  partner: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

const finishingSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(160),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  unit: z.string().trim().min(1).max(40).default("unidade"),
  unitCost: finite.min(0).max(999999999).default(0),
  description: z.string().trim().max(1000).nullable().optional(),
});

function parse<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | ServicesEngineError {
  const parsed = schema.safeParse(raw);
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

function nullable(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export async function saveService(raw: unknown, id?: number) {
  const parsed = parse(serviceSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const data = {
    name: d.name,
    categoryId: d.categoryId || null,
    type: d.type,
    baseCost: toDecimalString(d.baseCost, 4),
    estimatedHours: toDecimalString(d.estimatedHours, 2),
    becomesProduct: d.becomesProduct,
    partner: d.type === "terceirizado" ? nullable(d.partner) : null,
    description: nullable(d.description),
  };
  if (id) {
    const [row] = await db.update(services).set(data).where(eq(services.id, id)).returning();
    if (!row) return { error: "Serviço não encontrado", status: 404 } satisfies ServicesEngineError;
    return { ok: true as const, row };
  }
  const [row] = await db.insert(services).values(data).returning();
  return { ok: true as const, row };
}

export async function archiveService(id: number, reason = "Arquivado") {
  const [existing] = await db.select().from(services).where(eq(services.id, id)).limit(1);
  if (!existing) return { error: "Serviço não encontrado", status: 404 } satisfies ServicesEngineError;
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.baseServiceId, id)).limit(1);
  const [quote] = await db.select({ id: quoteItems.id }).from(quoteItems).where(eq(quoteItems.serviceId, id)).limit(1);
  if (product || quote) {
    const description = [existing.description, `ARQUIVADO: ${reason}`].filter(Boolean).join("\n");
    const [row] = await db.update(services).set({ description }).where(eq(services.id, id)).returning();
    return { ok: true as const, row, archived: true };
  }
  await db.delete(services).where(eq(services.id, id));
  return { ok: true as const };
}

export async function saveFinishing(raw: unknown, id?: number) {
  const parsed = parse(finishingSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const data = {
    name: d.name,
    categoryId: d.categoryId || null,
    unit: d.unit || "unidade",
    unitCost: toDecimalString(d.unitCost, 4),
    description: nullable(d.description),
  };
  if (id) {
    const [row] = await db.update(finishingItems).set(data).where(eq(finishingItems.id, id)).returning();
    if (!row) return { error: "Acabamento não encontrado", status: 404 } satisfies ServicesEngineError;
    return { ok: true as const, row };
  }
  const [row] = await db.insert(finishingItems).values(data).returning();
  return { ok: true as const, row };
}

export async function archiveFinishing(id: number, reason = "Arquivado") {
  const [existing] = await db.select().from(finishingItems).where(eq(finishingItems.id, id)).limit(1);
  if (!existing) return { error: "Acabamento não encontrado", status: 404 } satisfies ServicesEngineError;
  const [used] = await db.select({ id: productFinishings.id }).from(productFinishings).where(eq(productFinishings.finishingId, id)).limit(1);
  if (used) {
    const description = [existing.description, `ARQUIVADO: ${reason}`].filter(Boolean).join("\n");
    const [row] = await db.update(finishingItems).set({ description }).where(eq(finishingItems.id, id)).returning();
    return { ok: true as const, row, archived: true };
  }
  await db.delete(finishingItems).where(eq(finishingItems.id, id));
  return { ok: true as const };
}
