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

/**
 * Custo de uma linha de tabela para a quantidade pedida.
 *
 * Em `m2` a conta tem DOIS eixos que não podem ser confundidos:
 *   - a área de UMA peça (largura × altura), com m² mínimo faturável;
 *   - quantas peças foram pedidas.
 *
 * A versão anterior calculava a área e devolvia o valor de UMA peça,
 * descartando `quantity`: 10 lonas de 1 m² custavam o mesmo que 1.
 * O bug estava dormente porque a função nunca era chamada — mas ela é
 * a única porta de entrada para plugar a tabela no orçamento, então
 * seria o primeiro erro a aparecer no dia em que fosse ligada.
 *
 * `minQty` em m² é o mínimo faturável POR PEÇA (gráfica não vende
 * 0,3 m² de lona), não o mínimo do pedido.
 */
export function estimatePricingTableCost(
  row: typeof pricingTables.$inferSelect,
  quantity: number,
  widthCm?: number,
  heightCm?: number
) {
  const unit = String(row.unit || "unidade");
  const unitCost = toNumber(row.unitCost, 0);
  const minQty = toNumber(row.minQty, 1);
  /* Quantidade nunca é negativa nem fracionária-negativa; 0 peças = 0. */
  const qty = Math.max(quantity, 0);

  if (unit === "m2") {
    const w = toNumber(widthCm, toNumber(row.widthCm, 0));
    const h = toNumber(heightCm, toNumber(row.heightCm, 0));
    const areaM2 = Math.max((w * h) / 10000, 0);
    /* mínimo faturável por peça */
    const billableArea = Math.max(areaM2, minQty);
    return round2(billableArea * unitCost * qty);
  }

  /* unidade | metro | folha: o mínimo é do PEDIDO.
     Zero peças custa zero — sem isso, uma linha removida do orçamento
     continuaria cobrando o mínimo. */
  if (qty <= 0) return 0;
  return round2(Math.max(qty, minQty) * unitCost);
}
