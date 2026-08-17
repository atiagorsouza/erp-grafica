import "server-only";

import { z } from "zod";
import { db } from "@/db";
import {
  finishingItems,
  materials,
  printerCategories,
  printerConsumables,
  printers,
  printFormats,
  productFinishings,
  productMaterials,
  products,
  quoteItems,
  services,
  stockMovements,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPricingDefaults } from "@/lib/settings";
import {
  computeBatchProduct,
  computeProduct,
  type BatchFinishingLine,
  type ColorMode,
  type MaterialLine,
} from "@/lib/pricing";
import { round2, toDecimalString, toNumber } from "@/lib/money";

export type ProductError = { error: string; status: number; details?: unknown };

const finite = z.coerce.number().finite();

const componentSchema = z.object({
  id: z.coerce.number().int().positive(),
  quantity: finite.min(0).max(1_000_000).default(1),
  chargeMode: z.string().trim().max(40).optional(),
  batchSize: finite.min(1).max(1_000_000).optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(180),
  sku: z.string().trim().max(80).nullable().optional(),
  barcode: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(1500).nullable().optional(),
  productCategoryId: z.coerce.number().int().positive().nullable().optional(),
  printerId: z.coerce.number().int().positive().nullable().optional(),
  printerCategoryId: z.coerce.number().int().positive().nullable().optional(),
  printFormatId: z.coerce.number().int().positive().nullable().optional(),
  colorMode: z.enum(["mono", "color"]).default("color"),
  pagesPerUnit: finite.min(0).max(1_000_000).default(1),
  copies: finite.min(0).max(1_000_000).default(1),
  baseMaterialId: z.coerce.number().int().positive().nullable().optional(),
  baseMaterialQty: finite.min(0).max(1_000_000).default(1),
  baseServiceId: z.coerce.number().int().positive().nullable().optional(),
  calculationMode: z.enum(["unit", "batch"]).default("unit"),
  defaultQuantity: finite.min(0).max(1_000_000).default(1),
  piecesPerSheet: finite.min(0.0001).max(1_000_000).default(1),
  printSides: z.coerce.number().int().min(1).max(10).default(1),
  wastePercent: finite.min(0).max(1).default(0),
  setupSheets: z.coerce.number().int().min(0).max(100000).default(0),
  minOrderQty: finite.min(0).max(1_000_000).default(1),
  operationalRate: finite.min(0).max(0.95).default(0),
  roundingStep: finite.min(0.01).max(100000).default(0.01),
  margin: finite.min(0).max(0.95).default(0.4),
  active: z.boolean().default(true),
  trackStock: z.boolean().default(false),
  stock: finite.min(-1_000_000).max(1_000_000).default(0),
  minStock: finite.min(0).max(1_000_000).default(0),
  /* logística — usados na cotação de frete (v3.12.0) */
  shipWeight: finite.min(0).max(1000).default(0),
  shipHeight: finite.min(0).max(200).default(0),
  shipWidth: finite.min(0).max(200).default(0),
  shipLength: finite.min(0).max(200).default(0),
  finishings: z.array(componentSchema).optional().default([]),
  materials: z.array(componentSchema).optional().default([]),
});

type ProductPayload = z.infer<typeof productSchema>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function parse(raw: unknown): { ok: true; data: ProductPayload } | ProductError {
  const parsed = productSchema.safeParse(raw);
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

function genSku(name: string, id: number) {
  const slug = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 6);
  return `PRO-${slug || "ITEM"}${String(id).padStart(3, "0")}`;
}

async function findById<T extends { id: number }>(rows: T[], id?: number | null) {
  return id ? rows.find((r) => Number(r.id) === Number(id)) || null : null;
}

async function buildCalculation(data: ProductPayload) {
  const [cats, cons, prts, fmts, mats, fins, srvs, defaults] = await Promise.all([
    db.select().from(printerCategories),
    db.select().from(printerConsumables),
    db.select().from(printers),
    db.select().from(printFormats),
    db.select().from(materials),
    db.select().from(finishingItems),
    db.select().from(services),
    getPricingDefaults(),
  ]);

  const printer = await findById(prts, data.printerId || null);
  const printerCategoryId = printer?.categoryId || data.printerCategoryId || null;
  const category = await findById(cats, printerCategoryId);
  const format = await findById(fmts, data.printFormatId || null);
  const baseMaterial = await findById(mats, data.baseMaterialId || null);
  const service = await findById(srvs, data.baseServiceId || null);
  const categoryConsumables = printerCategoryId ? cons.filter((c) => Number(c.categoryId) === Number(printerCategoryId)) : [];

  const finishingLines: BatchFinishingLine[] = data.finishings.map((line) => ({
    finishing: fins.find((f) => Number(f.id) === Number(line.id)),
    quantity: line.quantity,
    chargeMode: line.chargeMode || "per_piece",
    batchSize: line.batchSize || 1,
  }));

  const materialLines: MaterialLine[] = data.materials.map((line) => ({
    material: mats.find((m) => Number(m.id) === Number(line.id)),
    quantity: line.quantity,
  }));

  if (data.calculationMode === "batch") {
    const result = computeBatchProduct({
      printer,
      category,
      consumables: categoryConsumables,
      format,
      colorMode: data.colorMode as ColorMode,
      requestedQuantity: data.defaultQuantity,
      piecesPerSheet: data.piecesPerSheet,
      printSides: data.printSides,
      wastePercent: data.wastePercent,
      setupSheets: data.setupSheets,
      materialSheetsPerPrintedSheet: data.baseMaterialQty,
      baseMaterial,
      extraMaterials: materialLines,
      finishings: finishingLines,
      service,
      operationalRate: data.operationalRate || defaults.operationalRate,
      taxRate: defaults.taxRate,
      paymentRate: defaults.cardFeeRate,
      profitRate: data.margin,
      roundingStep: data.roundingStep,
    });
    if (!result.valid) return { error: result.error || "Cálculo inválido", status: 422 } satisfies ProductError;
    return {
      printerCategoryId,
      costSnapshot: round2(result.directCost),
      sellPrice: round2(result.finalPrice),
      finalPrice: round2(result.finalPrice),
      breakdown: {
        mode: "batch",
        lines: result.lines,
        finalSheets: result.finalSheets,
        printCostPerSheet: result.printCostPerSheet,
        unitPrice: result.unitPrice,
      },
    };
  }

  const result = computeProduct({
    category,
    consumables: categoryConsumables,
    printer,
    colorMode: data.colorMode as ColorMode,
    pagesPerUnit: data.pagesPerUnit,
    copies: data.copies,
    baseMaterial,
    baseMaterialQty: data.baseMaterialQty,
    finishings: finishingLines,
    extraMaterials: materialLines,
    service,
    margin: data.margin,
    taxRate: defaults.taxRate,
    cardFeeRate: defaults.cardFeeRate,
  });

  return {
    printerCategoryId,
    costSnapshot: round2(result.baseCost),
    sellPrice: round2(result.sellPrice),
    finalPrice: round2(result.finalPrice),
    breakdown: {
      mode: "unit",
      lines: result.lines,
      unitPrice: result.unitPrice,
    },
  };
}

async function syncComponents(tx: Tx, productId: number, data: ProductPayload) {
  await tx.delete(productFinishings).where(eq(productFinishings.productId, productId));
  await tx.delete(productMaterials).where(eq(productMaterials.productId, productId));
  for (const f of data.finishings) {
    await tx.insert(productFinishings).values({
      productId,
      finishingId: f.id,
      quantity: toDecimalString(f.quantity, 3),
      chargeMode: f.chargeMode || "per_piece",
      batchSize: toDecimalString(f.batchSize || 1, 3),
    });
  }
  for (const m of data.materials) {
    await tx.insert(productMaterials).values({
      productId,
      materialId: m.id,
      quantity: toDecimalString(m.quantity, 3),
    });
  }
}

function baseProductData(data: ProductPayload, calc: Awaited<ReturnType<typeof buildCalculation>> & Record<string, unknown>) {
  return {
    name: data.name,
    sku: nullable(data.sku),
    barcode: nullable(data.barcode),
    description: nullable(data.description),
    productCategoryId: data.productCategoryId || null,
    printerId: data.printerId || null,
    printerCategoryId: (calc.printerCategoryId as number | null) || null,
    printFormatId: data.printFormatId || null,
    colorMode: data.colorMode,
    pagesPerUnit: toDecimalString(data.pagesPerUnit, 3),
    copies: toDecimalString(data.copies, 3),
    baseMaterialId: data.baseMaterialId || null,
    baseMaterialQty: toDecimalString(data.baseMaterialQty, 3),
    baseServiceId: data.baseServiceId || null,
    calculationMode: data.calculationMode,
    defaultQuantity: toDecimalString(data.defaultQuantity, 3),
    piecesPerSheet: toDecimalString(data.piecesPerSheet, 3),
    printSides: data.printSides,
    wastePercent: toDecimalString(data.wastePercent, 4),
    setupSheets: data.setupSheets,
    minOrderQty: toDecimalString(data.minOrderQty, 3),
    operationalRate: toDecimalString(data.operationalRate, 4),
    roundingStep: toDecimalString(data.roundingStep, 2),
    margin: toDecimalString(data.margin, 4),
    costSnapshot: toDecimalString(calc.costSnapshot, 4),
    sellPrice: toDecimalString(calc.sellPrice, 4),
    finalPrice: toDecimalString(calc.finalPrice, 4),
    breakdown: calc.breakdown,
    active: data.active,
    trackStock: data.trackStock,
    stock: toDecimalString(data.stock, 3),
    minStock: toDecimalString(data.minStock, 3),
    shipWeight: toDecimalString(data.shipWeight, 3),
    shipHeight: toDecimalString(data.shipHeight, 2),
    shipWidth: toDecimalString(data.shipWidth, 2),
    shipLength: toDecimalString(data.shipLength, 2),
  };
}

export async function createProduct(raw: unknown) {
  const parsed = parse(raw);
  if ("error" in parsed) return parsed;
  const data = parsed.data;
  const calc = await buildCalculation(data);
  if ("error" in calc) return calc;

  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(products).values(baseProductData(data, calc) as never).returning();
    const sku = data.sku || genSku(created.name, created.id);
    const [updated] = await tx.update(products).set({ sku }).where(eq(products.id, created.id)).returning();
    await syncComponents(tx, created.id, data);
    if (data.trackStock && data.stock > 0) {
      await tx.insert(stockMovements).values({
        kind: "entrada",
        targetType: "product",
        productId: created.id,
        quantity: toDecimalString(data.stock, 3),
        reason: "ajuste",
        notes: "Estoque inicial",
        automatic: true,
      });
    }
    return updated;
  });

  return { ok: true as const, row };
}

export async function updateProduct(id: number, raw: unknown) {
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) return { error: "Produto não encontrado", status: 404 } satisfies ProductError;
  const parsed = parse({ ...existing, ...(raw as object) });
  if ("error" in parsed) return parsed;
  const data = parsed.data;
  const calc = await buildCalculation(data);
  if ("error" in calc) return calc;
  const previousStock = toNumber(existing.stock, 0);

  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(products).set(baseProductData(data, calc) as never).where(eq(products.id, id)).returning();
    await syncComponents(tx, id, data);
    const delta = round2(data.stock - previousStock);
    if (data.trackStock && Math.abs(delta) > 0.0001) {
      await tx.insert(stockMovements).values({
        kind: delta >= 0 ? "entrada" : "saida",
        targetType: "product",
        productId: id,
        quantity: toDecimalString(Math.abs(delta), 3),
        reason: "ajuste",
        notes: "Ajuste manual no cadastro do produto",
        automatic: false,
      });
    }
    return updated;
  });

  return { ok: true as const, row };
}

export async function archiveProduct(id: number, reason = "Arquivado") {
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) return { error: "Produto não encontrado", status: 404 } satisfies ProductError;
  const [usedQuote] = await db.select({ id: quoteItems.id }).from(quoteItems).where(eq(quoteItems.productId, id)).limit(1);
  if (usedQuote) {
    const [row] = await db.update(products).set({ active: false, description: [existing.description, `ARQUIVADO: ${reason}`].filter(Boolean).join("\n") }).where(eq(products.id, id)).returning();
    return { ok: true as const, row, archived: true };
  }
  await db.delete(products).where(eq(products.id, id));
  return { ok: true as const };
}
