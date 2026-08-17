import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { pricingTables } from "@/db/schema";
import { and, eq, ilike } from "drizzle-orm";
import { round2, toDecimalString, toNumber } from "@/lib/money";

export type PricingTableError = { error: string; status: number; details?: unknown };

const TYPES = ["dtf_uv", "dtf_textil", "lona", "adesivo"] as const;
const UNITS = ["unidade", "metro", "m2", "folha"] as const;

const tableSchema = z.object({
  type: z.enum(TYPES),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  label: z.string().trim().min(2, "Descrição obrigatória").max(180),
  unitCost: z.coerce.number().finite().min(0, "Preço não pode ser negativo").max(999999999),
  unit: z.enum(UNITS).default("unidade"),
  widthCm: z.coerce.number().finite().min(0).max(100000).nullable().optional(),
  heightCm: z.coerce.number().finite().min(0).max(100000).nullable().optional(),
  minQty: z.coerce.number().finite().min(0.001).max(999999999).default(1),
  notes: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().default(true),
});

type TablePayload = z.infer<typeof tableSchema>;

function parse(raw: unknown): { ok: true; data: TablePayload } | PricingTableError {
  const parsed = tableSchema.safeParse(raw);
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

function normalizeUnit(type: TablePayload["type"], unit: TablePayload["unit"]) {
  if (type === "lona" || type === "adesivo") return "m2";
  if (type === "dtf_textil") return unit === "unidade" ? "metro" : unit;
  return unit;
}

function validateDimensions(data: TablePayload) {
  const unit = normalizeUnit(data.type, data.unit);
  if ((unit === "m2" || unit === "metro") && (!data.widthCm || data.widthCm <= 0)) {
    return { error: "Informe largura útil para preço por metro/m²", status: 422 } satisfies PricingTableError;
  }
  if (unit === "m2" && (!data.heightCm || data.heightCm <= 0)) {
    return { error: "Informe altura útil para preço por m²", status: 422 } satisfies PricingTableError;
  }
  return null;
}

function dataToDb(data: TablePayload) {
  const unit = normalizeUnit(data.type, data.unit);
  return {
    type: data.type,
    categoryId: data.categoryId || null,
    label: data.label.trim(),
    unitCost: toDecimalString(data.unitCost, 4),
    unit,
    widthCm: data.widthCm != null && data.widthCm > 0 ? toDecimalString(data.widthCm, 2) : null,
    heightCm: data.heightCm != null && data.heightCm > 0 ? toDecimalString(data.heightCm, 2) : null,
    minQty: toDecimalString(data.minQty, 3),
    notes: data.notes?.trim() || null,
    active: data.active,
  };
}

async function duplicate(data: TablePayload, ignoreId?: number) {
  const [row] = await db
    .select({ id: pricingTables.id })
    .from(pricingTables)
    .where(and(eq(pricingTables.type, data.type), ilike(pricingTables.label, data.label.trim())))
    .limit(1);
  if (row && row.id !== ignoreId) return { error: "Já existe linha com esta descrição nesta tabela", status: 409 } satisfies PricingTableError;
  return null;
}

export async function createPricingTable(raw: unknown) {
  const parsed = parse(raw);
  if ("error" in parsed) return parsed;
  const dim = validateDimensions(parsed.data);
  if (dim) return dim;
  const dupe = await duplicate(parsed.data);
  if (dupe) return dupe;
  const [row] = await db.insert(pricingTables).values(dataToDb(parsed.data)).returning();
  return { ok: true as const, row };
}

export async function updatePricingTable(id: number, raw: unknown) {
  const [existing] = await db.select().from(pricingTables).where(eq(pricingTables.id, id)).limit(1);
  if (!existing) return { error: "Linha não encontrada", status: 404 } satisfies PricingTableError;
  const parsed = parse({ ...existing, ...(raw as object) });
  if ("error" in parsed) return parsed;
  const dim = validateDimensions(parsed.data);
  if (dim) return dim;
  const dupe = await duplicate(parsed.data, id);
  if (dupe) return dupe;
  const [row] = await db.update(pricingTables).set(dataToDb(parsed.data)).where(eq(pricingTables.id, id)).returning();
  return { ok: true as const, row };
}

export async function archivePricingTable(id: number) {
  const [row] = await db.update(pricingTables).set({ active: false }).where(eq(pricingTables.id, id)).returning();
  if (!row) return { error: "Linha não encontrada", status: 404 } satisfies PricingTableError;
  return { ok: true as const, row };
}

export function estimatePricingTableCost(row: typeof pricingTables.$inferSelect, quantity: number, widthCm?: number, heightCm?: number) {
  const unit = String(row.unit || "unidade");
  const q = Math.max(quantity, toNumber(row.minQty, 1));
  if (unit === "m2") {
    const areaM2 = Math.max((toNumber(widthCm, toNumber(row.widthCm, 100)) * toNumber(heightCm, toNumber(row.heightCm, 100))) / 10000, 0);
    return round2(Math.max(areaM2, toNumber(row.minQty, 1)) * toNumber(row.unitCost, 0));
  }
  if (unit === "metro") return round2(q * toNumber(row.unitCost, 0));
  return round2(q * toNumber(row.unitCost, 0));
}
