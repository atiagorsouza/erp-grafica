import "server-only";

import { z } from "zod";
import { db } from "@/db";
import {
  printerCategories,
  printerConsumables,
  printers,
  printFormats,
  products,
  productionSchedules,
} from "@/db/schema";
import { eq, or } from "drizzle-orm";

export type PrintEngineError = { error: string; status: number; details?: unknown };

const measureModes = ["pagina", "etiqueta", "grama"] as const;
const printerStatuses = ["ativa", "manutencao", "inativa"] as const;
const appliesTo = ["mono", "color", "both"] as const;
const costRoles = ["colorant", "mechanical"] as const;

const finite = z.coerce.number().finite();

const categorySchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  slug: z.string().trim().max(140).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(8).optional().default("🖨️"),
  fixedCostPerPage: finite.min(0).max(999999).optional().default(0),
  wasteFactor: finite.min(0).max(1).optional().default(0),
  defaultMargin: finite.min(0).max(0.95).optional().default(0.4),
  color: z.string().trim().max(20).optional().default("#06b6d4"),
  measureMode: z.enum(measureModes).default("pagina"),
  unitLabel: z.string().trim().max(40).optional().default("folha"),
  referenceCoverage: finite.min(0.0001).max(1).optional().default(0.05),
});

const consumableSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, "Nome obrigatório").max(160),
  unitCost: finite.min(0).max(999999999).optional().default(0),
  yieldPages: z.coerce.number().int().min(1, "Rendimento precisa ser maior que zero").max(999999999),
  appliesTo: z.enum(appliesTo).default("both"),
  costRole: z.enum(costRoles).default("colorant"),
  notes: z.string().trim().max(500).nullable().optional(),
});

const printerSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2, "Nome obrigatório").max(160),
  brand: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  status: z.enum(printerStatuses).default("ativa"),
  costMultiplier: finite.min(0.01).max(100).optional().default(1),
  maxFormat: z.string().trim().max(60).nullable().optional(),
  buildVolume: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const formatSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "Nome obrigatório").max(80),
  widthMm: finite.min(0).max(100000).optional().default(210),
  heightMm: finite.min(0).max(100000).optional().default(297),
  areaFactor: finite.min(0.0001).max(1000).optional().default(1),
  inkCoverage: finite.min(0).max(1).optional().default(0.05),
  printCostOverride: finite.min(0).max(999999999).optional().default(0),
  isPhoto: z.boolean().optional().default(false),
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | PrintEngineError {
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

async function ensureCategory(categoryId: number) {
  const [cat] = await db.select().from(printerCategories).where(eq(printerCategories.id, categoryId)).limit(1);
  return cat || null;
}

function dec(value: unknown, scale = 4) {
  const n = Number(value || 0);
  return (Number.isFinite(n) ? n : 0).toFixed(scale);
}

export async function savePrinterCategory(raw: unknown, id?: number) {
  const parsed = parse(categorySchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const slug = (d.slug || slugify(d.name)).slice(0, 140);

  const [dupe] = await db.select().from(printerCategories).where(eq(printerCategories.slug, slug)).limit(1);
  if (dupe && dupe.id !== id) return { error: `Já existe categoria com slug ${slug}`, status: 409 } satisfies PrintEngineError;

  const data = {
    name: d.name,
    slug,
    description: d.description || null,
    icon: d.icon || "🖨️",
    fixedCostPerPage: dec(d.fixedCostPerPage, 6),
    wasteFactor: dec(d.wasteFactor, 4),
    defaultMargin: dec(d.defaultMargin, 4),
    color: d.color || "#06b6d4",
    measureMode: d.measureMode,
    unitLabel: d.unitLabel || (d.measureMode === "grama" ? "grama" : d.measureMode === "etiqueta" ? "etiqueta" : "folha"),
    referenceCoverage: dec(d.referenceCoverage, 4),
  };

  if (id) {
    const [row] = await db.update(printerCategories).set(data).where(eq(printerCategories.id, id)).returning();
    return { ok: true as const, row };
  }
  const [row] = await db.insert(printerCategories).values(data).returning();
  return { ok: true as const, row };
}

export async function deletePrinterCategory(id: number) {
  const [printer] = await db.select({ id: printers.id }).from(printers).where(eq(printers.categoryId, id)).limit(1);
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.printerCategoryId, id)).limit(1);
  if (printer || product) {
    return { error: "Categoria em uso por impressoras/produtos. Remova ou inative dependências antes.", status: 409 } satisfies PrintEngineError;
  }
  await db.delete(printerCategories).where(eq(printerCategories.id, id));
  return { ok: true as const };
}

export async function saveConsumable(raw: unknown, id?: number) {
  const parsed = parse(consumableSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  if (!(await ensureCategory(d.categoryId))) return { error: "Categoria não encontrada", status: 422 } satisfies PrintEngineError;
  const data = {
    categoryId: d.categoryId,
    name: d.name,
    unitCost: dec(d.unitCost, 4),
    yieldPages: d.yieldPages,
    appliesTo: d.appliesTo,
    costRole: d.costRole,
    notes: d.notes || null,
  };
  if (id) {
    const [row] = await db.update(printerConsumables).set(data).where(eq(printerConsumables.id, id)).returning();
    return { ok: true as const, row };
  }
  const [row] = await db.insert(printerConsumables).values(data).returning();
  return { ok: true as const, row };
}

export async function deleteConsumable(id: number) {
  await db.delete(printerConsumables).where(eq(printerConsumables.id, id));
  return { ok: true as const };
}

export async function savePrinter(raw: unknown, id?: number) {
  const parsed = parse(printerSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const category = await ensureCategory(d.categoryId);
  if (!category) return { error: "Categoria não encontrada", status: 422 } satisfies PrintEngineError;
  const isGram = category.measureMode === "grama";
  const data = {
    categoryId: d.categoryId,
    name: d.name,
    brand: d.brand || null,
    model: d.model || null,
    status: d.status,
    costMultiplier: dec(d.costMultiplier, 4),
    maxFormat: isGram ? null : d.maxFormat || null,
    buildVolume: isGram ? d.buildVolume || null : null,
    notes: d.notes || null,
  };
  if (id) {
    const [row] = await db.update(printers).set(data).where(eq(printers.id, id)).returning();
    return { ok: true as const, row };
  }
  const [row] = await db.insert(printers).values(data).returning();
  return { ok: true as const, row };
}

export async function deletePrinter(id: number) {
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.printerId, id)).limit(1);
  const [schedule] = await db.select({ id: productionSchedules.id }).from(productionSchedules).where(eq(productionSchedules.printerId, id)).limit(1);
  if (product || schedule) {
    const [row] = await db.update(printers).set({ status: "inativa" }).where(eq(printers.id, id)).returning();
    return { ok: true as const, row, archived: true };
  }
  await db.delete(printers).where(eq(printers.id, id));
  return { ok: true as const };
}

export async function savePrintFormat(raw: unknown, id?: number) {
  const parsed = parse(formatSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  if (!(await ensureCategory(d.categoryId))) return { error: "Categoria não encontrada", status: 422 } satisfies PrintEngineError;
  const data = {
    categoryId: d.categoryId,
    name: d.name,
    widthMm: dec(d.widthMm, 2),
    heightMm: dec(d.heightMm, 2),
    areaFactor: dec(d.areaFactor, 4),
    inkCoverage: dec(d.inkCoverage, 4),
    printCostOverride: dec(d.printCostOverride, 4),
    isPhoto: d.isPhoto,
  };
  if (id) {
    const [row] = await db.update(printFormats).set(data).where(eq(printFormats.id, id)).returning();
    return { ok: true as const, row };
  }
  const [row] = await db.insert(printFormats).values(data).returning();
  return { ok: true as const, row };
}

export async function deletePrintFormat(id: number) {
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.printFormatId, id)).limit(1);
  if (product) return { error: "Formato em uso por produtos. Remova o vínculo antes de excluir.", status: 409 } satisfies PrintEngineError;
  await db.delete(printFormats).where(eq(printFormats.id, id));
  return { ok: true as const };
}

export async function getPrinterEngineHealth() {
  const [catRows, consRows, printerRows, formatRows] = await Promise.all([
    db.select().from(printerCategories),
    db.select().from(printerConsumables),
    db.select().from(printers),
    db.select().from(printFormats),
  ]);
  return {
    categories: catRows.length,
    consumablesWithoutYield: consRows.filter((c) => !c.yieldPages || c.yieldPages <= 0).length,
    inactivePrinters: printerRows.filter((p) => p.status !== "ativa").length,
    categoriesWithoutPrinter: catRows.filter((c) => !printerRows.some((p) => p.categoryId === c.id)).length,
    categoriesWithoutFormat: catRows.filter((c) => !formatRows.some((f) => f.categoryId === c.id)).length,

    /* Consumíveis que parecem peça de desgaste (cilindro, fusor, cabeça,
       correia, lâmina) mas estão marcados como colorante.
       `costRole` tem default "colorant": quem cadastra sem escolher acaba
       fazendo o cilindro escalar com a cobertura de tinta, o que não
       acontece na máquina — ele se desgasta por passagem de papel.
       O erro é invisível na cobertura de referência e só aparece em
       trabalho com muita ou pouca tinta. */
    consumablesMaybeMechanical: consRows.filter(
      (c) =>
        (c.costRole || "colorant") === "colorant" &&
        /cilindro|fusor|fus[oó]ra|cabe[çc]a|correia|belt|drum|l[âa]mina|rolo/i.test(c.name || "")
    ).length,
  };
}
