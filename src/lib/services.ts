import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { services, finishingItems, products, productFinishings, quoteItems } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type ServiceError = { error: string; status: number; details?: unknown };

function zodErr(error: z.ZodError): ServiceError {
  const first = error.issues[0];
  return { error: first?.message || "Dados inválidos", status: 400, details: error.flatten() };
}

const nullableStr = (max: number) =>
  z.union([z.string(), z.null()]).transform((v) => (v ? String(v).trim().slice(0, max) || null : null));

/* ==================================================================
 *  SERVIÇOS (próprios / terceirizados)
 * ================================================================== */

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Nome do serviço obrigatório").max(120),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  type: z.enum(["proprio", "terceirizado"]).default("proprio"),
  baseCost: z.coerce.number().finite().min(0, "Custo não pode ser negativo").max(10_000_000).default(0),
  estimatedHours: z.coerce.number().finite().min(0).max(100000).default(0),
  becomesProduct: z.coerce.boolean().default(false),
  partner: nullableStr(120).optional(),
  description: nullableStr(500).optional(),
});

export async function createService(raw: unknown) {
  const parsed = serviceSchema.safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const [row] = await db
    .insert(services)
    .values({ ...input, baseCost: input.baseCost.toFixed(4), estimatedHours: input.estimatedHours.toFixed(2) } as never)
    .returning();
  return { ok: true as const, row };
}

export async function updateService(id: number, raw: unknown) {
  /* update sem defaults — .partial() sozinho resetaria baseCost/horas/type ao
   * editar campos isolados. Campo ausente = não altera. */
  const updateSchema = z.object({
    name: z.string().trim().min(2, "Nome do serviço obrigatório").max(120).optional(),
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    type: z.enum(["proprio", "terceirizado"]).optional(),
    baseCost: z.coerce.number().finite().min(0, "Custo não pode ser negativo").max(10_000_000).optional(),
    estimatedHours: z.coerce.number().finite().min(0).max(100000).optional(),
    becomesProduct: z.coerce.boolean().optional(),
    partner: nullableStr(120).optional(),
    description: nullableStr(500).optional(),
  });
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const patch: Record<string, unknown> = { ...input };
  if (input.baseCost !== undefined) patch.baseCost = input.baseCost.toFixed(4);
  if (input.estimatedHours !== undefined) patch.estimatedHours = input.estimatedHours.toFixed(2);
  const [row] = await db.update(services).set(patch as never).where(eq(services.id, id)).returning();
  if (!row) return { error: "Serviço não encontrado", status: 404 } satisfies ServiceError;
  return { ok: true as const, row };
}

/** Bloqueia exclusão de serviço usado como base de produto ou em orçamentos
 *  (ambos ficariam órfãos — FK set null — perdendo o serviço do cálculo). */
export async function deleteService(id: number) {
  const [byProduct] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.baseServiceId, id));
  const [byQuote] = await db.select({ n: sql<number>`count(*)::int` }).from(quoteItems).where(eq(quoteItems.serviceId, id));
  const prod = byProduct?.n ?? 0;
  const quote = byQuote?.n ?? 0;
  if (prod + quote > 0) {
    const parts = [prod ? `${prod} produto(s)` : "", quote ? `${quote} item(ns) de orçamento` : ""].filter(Boolean).join(" e ");
    return { error: `Serviço usado por ${parts}. Ajuste-os antes de excluir.`, status: 409 } satisfies ServiceError;
  }
  await db.delete(services).where(eq(services.id, id));
  return { ok: true as const };
}

/* ==================================================================
 *  ACABAMENTOS
 * ================================================================== */

export const finishingSchema = z.object({
  name: z.string().trim().min(2, "Nome do acabamento obrigatório").max(120),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  unit: z.string().trim().max(20).default("unidade"),
  unitCost: z.coerce.number().finite().min(0, "Custo não pode ser negativo").max(10_000_000).default(0),
  description: nullableStr(500).optional(),
});

export async function createFinishing(raw: unknown) {
  const parsed = finishingSchema.safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const [row] = await db.insert(finishingItems).values({ ...input, unitCost: input.unitCost.toFixed(4) } as never).returning();
  return { ok: true as const, row };
}

export async function updateFinishing(id: number, raw: unknown) {
  const updateSchema = z.object({
    name: z.string().trim().min(2, "Nome do acabamento obrigatório").max(120).optional(),
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    unit: z.string().trim().max(20).optional(),
    unitCost: z.coerce.number().finite().min(0, "Custo não pode ser negativo").max(10_000_000).optional(),
    description: nullableStr(500).optional(),
  });
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const patch: Record<string, unknown> = { ...input };
  if (input.unitCost !== undefined) patch.unitCost = input.unitCost.toFixed(4);
  const [row] = await db.update(finishingItems).set(patch as never).where(eq(finishingItems.id, id)).returning();
  if (!row) return { error: "Acabamento não encontrado", status: 404 } satisfies ServiceError;
  return { ok: true as const, row };
}

/** Bloqueia exclusão de acabamento vinculado a produto (productFinishings tem
 *  cascade — excluir removeria o acabamento do produto e mudaria o custo). */
export async function deleteFinishing(id: number) {
  const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(productFinishings).where(eq(productFinishings.finishingId, id));
  if ((used?.n ?? 0) > 0) {
    return { error: `Acabamento usado em ${used.n} produto(s). Remova-o dos produtos antes de excluir.`, status: 409 } satisfies ServiceError;
  }
  await db.delete(finishingItems).where(eq(finishingItems.id, id));
  return { ok: true as const };
}
