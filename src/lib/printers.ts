import "server-only";

import { z } from "zod";
import { db } from "@/db";
import {
  printerCategories,
  printerConsumables,
  printers,
  printFormats,
  products,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type PrinterError = { error: string; status: number; details?: unknown };

const money6 = z.coerce.number().finite().min(0).max(1_000_000);
const money4 = z.coerce.number().finite().min(0).max(1_000_000);
const factor = z.coerce.number().finite().min(0).max(100);

/* ==================================================================
 *  CATEGORIA (define a lógica de custo por página)
 * ================================================================== */

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Nome da categoria obrigatório").max(80),
  description: z.union([z.string(), z.null()]).transform((v) => (v ? String(v).trim().slice(0, 300) || null : null)).optional(),
  icon: z.string().trim().max(8).optional(),
  color: z.string().trim().max(20).optional(),
  measureMode: z.enum(["pagina", "etiqueta", "grama"]).default("pagina"),
  unitLabel: z.string().trim().max(20).optional(),
  slug: z.string().trim().max(80).optional(),
  fixedCostPerPage: money6.default(0),
  referenceCoverage: z.coerce.number().finite().min(0).max(1).default(0.05),
  wasteFactor: z.coerce.number().finite().min(0).max(1).default(0),
  defaultMargin: z.coerce.number().finite().min(0).max(0.99).default(0.4),
});

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
}

async function slugTaken(slug: string, ignoreId?: number) {
  const rows = await db.select({ id: printerCategories.id, slug: printerCategories.slug }).from(printerCategories);
  return rows.some((r) => r.slug === slug && r.id !== ignoreId);
}

export async function createCategory(raw: unknown) {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  let slug = input.slug?.trim() || slugify(input.name);
  if (await slugTaken(slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const [row] = await db
    .insert(printerCategories)
    .values({
      ...input,
      slug,
      fixedCostPerPage: input.fixedCostPerPage.toFixed(6),
      referenceCoverage: input.referenceCoverage.toFixed(4),
      wasteFactor: input.wasteFactor.toFixed(4),
      defaultMargin: input.defaultMargin.toFixed(4),
    } as never)
    .returning();
  return { ok: true as const, row };
}

export async function updateCategory(id: number, raw: unknown) {
  const parsed = categorySchema.partial().safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const patch: Record<string, unknown> = { ...input };
  if (input.slug !== undefined || input.name !== undefined) {
    let slug = input.slug?.trim() || (input.name ? slugify(input.name) : undefined);
    if (slug && (await slugTaken(slug, id))) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    if (slug) patch.slug = slug;
  }
  if (input.fixedCostPerPage !== undefined) patch.fixedCostPerPage = input.fixedCostPerPage.toFixed(6);
  if (input.referenceCoverage !== undefined) patch.referenceCoverage = input.referenceCoverage.toFixed(4);
  if (input.wasteFactor !== undefined) patch.wasteFactor = input.wasteFactor.toFixed(4);
  if (input.defaultMargin !== undefined) patch.defaultMargin = input.defaultMargin.toFixed(4);

  const [row] = await db.update(printerCategories).set(patch as never).where(eq(printerCategories.id, id)).returning();
  if (!row) return { error: "Categoria não encontrada", status: 404 } satisfies PrinterError;
  return { ok: true as const, row };
}

/** Excluir categoria apaga (cascade) impressoras/consumíveis/formatos dela e
 *  orfanaria produtos. Bloqueia se houver produtos usando a categoria ou suas
 *  impressoras/formatos. */
export async function deleteCategory(id: number) {
  const prts = await db.select({ id: printers.id }).from(printers).where(eq(printers.categoryId, id));
  const fmts = await db.select({ id: printFormats.id }).from(printFormats).where(eq(printFormats.categoryId, id));
  const printerIds = prts.map((p) => p.id);
  const formatIds = fmts.map((f) => f.id);

  const [byCat] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.printerCategoryId, id));
  let used = byCat?.n ?? 0;
  for (const pid of printerIds) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.printerId, pid));
    used += r?.n ?? 0;
  }
  for (const fid of formatIds) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.printFormatId, fid));
    used += r?.n ?? 0;
  }
  if (used > 0) {
    return {
      error: `Esta categoria (ou suas impressoras/formatos) é usada por ${used} produto(s). Ajuste os produtos antes de excluir.`,
      status: 409,
    } satisfies PrinterError;
  }
  await db.delete(printerCategories).where(eq(printerCategories.id, id));
  return { ok: true as const };
}

/* ==================================================================
 *  CONSUMÍVEL (toner/tinta/cilindro — custo por página via rendimento)
 * ================================================================== */

export const consumableSchema = z.object({
  categoryId: z.coerce.number().int().positive("Categoria obrigatória"),
  name: z.string().trim().min(2, "Nome do consumível obrigatório").max(80),
  unitCost: money4.default(0),
  yieldPages: z.coerce.number().int().min(0).max(100_000_000).default(0),
  appliesTo: z.enum(["mono", "color", "both"]).default("both"),
  costRole: z.enum(["colorant", "mechanical"]).default("colorant"),
});

export async function createConsumable(raw: unknown) {
  const parsed = consumableSchema.safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  /* rendimento 0 zera o custo silenciosamente — avisa o operador */
  if (input.unitCost > 0 && input.yieldPages <= 0) {
    return { error: "Rendimento (páginas) deve ser maior que zero para calcular o custo por página", status: 422 } satisfies PrinterError;
  }
  const [row] = await db.insert(printerConsumables).values({ ...input, unitCost: input.unitCost.toFixed(4) } as never).returning();
  return { ok: true as const, row };
}

export async function updateConsumable(id: number, raw: unknown) {
  const parsed = consumableSchema.partial().safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const patch: Record<string, unknown> = { ...input };
  if (input.unitCost !== undefined) patch.unitCost = input.unitCost.toFixed(4);
  const [row] = await db.update(printerConsumables).set(patch as never).where(eq(printerConsumables.id, id)).returning();
  if (!row) return { error: "Consumível não encontrado", status: 404 } satisfies PrinterError;
  return { ok: true as const, row };
}

export async function deleteConsumable(id: number) {
  await db.delete(printerConsumables).where(eq(printerConsumables.id, id));
  return { ok: true as const };
}

/* ==================================================================
 *  IMPRESSORA
 * ================================================================== */

export const printerSchema = z.object({
  categoryId: z.coerce.number().int().positive("Categoria obrigatória"),
  name: z.string().trim().min(2, "Nome da impressora obrigatório").max(80),
  brand: z.union([z.string(), z.null()]).transform((v) => (v ? String(v).trim().slice(0, 60) || null : null)).optional(),
  model: z.union([z.string(), z.null()]).transform((v) => (v ? String(v).trim().slice(0, 60) || null : null)).optional(),
  status: z.enum(["ativa", "manutencao", "inativa"]).default("ativa"),
  costMultiplier: factor.default(1),
  maxFormat: z.union([z.string(), z.null()]).transform((v) => (v ? String(v).trim().slice(0, 20) || null : null)).optional(),
  buildVolume: z.union([z.string(), z.null()]).transform((v) => (v ? String(v).trim().slice(0, 40) || null : null)).optional(),
  notes: z.union([z.string(), z.null()]).transform((v) => (v ? String(v).trim().slice(0, 300) || null : null)).optional(),
});

export async function createPrinter(raw: unknown) {
  const parsed = printerSchema.safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const [row] = await db.insert(printers).values({ ...input, costMultiplier: input.costMultiplier.toFixed(4) } as never).returning();
  return { ok: true as const, row };
}

export async function updatePrinter(id: number, raw: unknown) {
  const parsed = printerSchema.partial().safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const patch: Record<string, unknown> = { ...input };
  if (input.costMultiplier !== undefined) patch.costMultiplier = input.costMultiplier.toFixed(4);
  const [row] = await db.update(printers).set(patch as never).where(eq(printers.id, id)).returning();
  if (!row) return { error: "Impressora não encontrada", status: 404 } satisfies PrinterError;
  return { ok: true as const, row };
}

export async function deletePrinter(id: number) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.printerId, id));
  if ((r?.n ?? 0) > 0) {
    return { error: `Impressora usada por ${r.n} produto(s). Troque a impressora deles antes de excluir.`, status: 409 } satisfies PrinterError;
  }
  await db.delete(printers).where(eq(printers.id, id));
  return { ok: true as const };
}

/* ==================================================================
 *  FORMATO DE IMPRESSÃO
 * ================================================================== */

export const formatSchema = z.object({
  categoryId: z.coerce.number().int().positive("Categoria obrigatória"),
  name: z.string().trim().min(1, "Nome do formato obrigatório").max(40),
  widthMm: z.coerce.number().finite().min(0).max(100000).default(210),
  heightMm: z.coerce.number().finite().min(0).max(100000).default(297),
  areaFactor: z.coerce.number().finite().min(0).max(1000).default(1),
  inkCoverage: z.coerce.number().finite().min(0).max(1).default(0.05),
  printCostOverride: money4.default(0),
  isPhoto: z.coerce.boolean().default(false),
  /* térmica: avanço por linha e colunas do rolo (v3.36.0) */
  feedMm: z.coerce.number().finite().min(0).max(100000).default(0),
  columns: z.coerce.number().int().min(1).max(50).default(1),
});

export async function createFormat(raw: unknown) {
  const parsed = formatSchema.safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const [row] = await db.insert(printFormats).values({
    ...input,
    widthMm: String(input.widthMm),
    heightMm: String(input.heightMm),
    areaFactor: String(input.areaFactor),
    inkCoverage: String(input.inkCoverage),
    printCostOverride: String(input.printCostOverride),
    feedMm: String(input.feedMm),
  } as never).returning();
  return { ok: true as const, row };
}

export async function updateFormat(id: number, raw: unknown) {
  const parsed = formatSchema.partial().safeParse(raw);
  if (!parsed.success) return zodErr(parsed.error);
  const input = parsed.data;
  const patch: Record<string, unknown> = { ...input };
  for (const k of ["widthMm", "heightMm", "areaFactor", "inkCoverage", "printCostOverride", "feedMm"] as const) {
    if (input[k] !== undefined) patch[k] = String(input[k]);
  }
  const [row] = await db.update(printFormats).set(patch as never).where(eq(printFormats.id, id)).returning();
  if (!row) return { error: "Formato não encontrado", status: 404 } satisfies PrinterError;
  return { ok: true as const, row };
}

export async function deleteFormat(id: number) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.printFormatId, id));
  if ((r?.n ?? 0) > 0) {
    return { error: `Formato usado por ${r.n} produto(s). Ajuste os produtos antes de excluir.`, status: 409 } satisfies PrinterError;
  }
  await db.delete(printFormats).where(eq(printFormats.id, id));
  return { ok: true as const };
}

/* ------------------------------------------------------------------ */
function zodErr(error: z.ZodError): PrinterError {
  const first = error.issues[0];
  return { error: first?.message || "Dados inválidos", status: 400, details: error.flatten() };
}
