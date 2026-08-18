import "server-only";

import { z } from "zod";
import { db } from "@/db";
import {
  products,
  productFinishings,
  productMaterials,
  pricingTables,
  services,
  finishingItems,
  materials,
  suppliers,
  stockMovements,
  purchases,
  sales,
  orders,
  quoteItems,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { nextDocumentNumber } from "@/lib/documents";
import { toDecimalString, toNumber, toPositive, round2 } from "@/lib/money";

export type CatalogError = { error: string; status: number; details?: unknown };
const finite = z.coerce.number().finite();
const nullable = (v: unknown) => { const s = String(v ?? "").trim(); return s ? s : null; };
const dec = (v: unknown, scale = 4) => toDecimalString(v, scale);

function parse<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | CatalogError {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${first.path.join(".") || "dados"}: ${first.message}` : "Dados inválidos", status: 400, details: parsed.error.flatten() };
  }
  return { ok: true, data: parsed.data };
}

function genSku(name: string, id: number) {
  const slug = (name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "").toUpperCase().slice(0, 6);
  return `PRO-${slug || "ITEM"}${String(id).padStart(3, "0")}`;
}

const productSchema = z.object({
  name: z.string().trim().min(2).max(180), sku: z.string().trim().max(80).nullable().optional(), barcode: z.string().trim().max(80).nullable().optional(), description: z.string().trim().max(1000).nullable().optional(),
  productCategoryId: z.coerce.number().int().positive().nullable().optional(), printerId: z.coerce.number().int().positive().nullable().optional(), printerCategoryId: z.coerce.number().int().positive().nullable().optional(), printFormatId: z.coerce.number().int().positive().nullable().optional(),
  colorMode: z.enum(["mono","color"]).default("mono"), pagesPerUnit: finite.min(0).default(1), copies: finite.min(0).default(1), baseMaterialId: z.coerce.number().int().positive().nullable().optional(), baseMaterialQty: finite.min(0).default(1), baseServiceId: z.coerce.number().int().positive().nullable().optional(),
  calculationMode: z.string().default("unit"), defaultQuantity: finite.min(0).default(1), piecesPerSheet: finite.min(0.0001).default(1), printSides: z.coerce.number().int().min(1).max(4).default(1), wastePercent: finite.min(0).max(1).default(0), setupSheets: z.coerce.number().int().min(0).default(0), minOrderQty: finite.min(0).default(1), operationalRate: finite.min(0).max(1).default(0), roundingStep: finite.min(0.01).default(0.01),
  margin: finite.min(0).max(0.95).default(0.4), costSnapshot: finite.min(0).default(0), sellPrice: finite.min(0).default(0), finalPrice: finite.min(0).default(0), active: z.boolean().default(true), trackStock: z.boolean().default(false), stock: finite.default(0), minStock: finite.min(0).default(0), breakdown: z.unknown().nullable().optional(),
  finishings: z.array(z.object({ id: z.coerce.number().int().positive(), quantity: finite.min(0).default(1), chargeMode: z.string().optional(), batchSize: finite.min(0.0001).optional() })).optional(),
  materials: z.array(z.object({ id: z.coerce.number().int().positive(), quantity: finite.min(0).default(1) })).optional(),
});

async function syncComponents(productId: number, finishings = [] as any[], mats = [] as any[]) {
  await db.delete(productFinishings).where(eq(productFinishings.productId, productId));
  await db.delete(productMaterials).where(eq(productMaterials.productId, productId));
  for (const f of finishings) await db.insert(productFinishings).values({ productId, finishingId: f.id, quantity: dec(f.quantity,3), chargeMode: f.chargeMode || "per_piece", batchSize: dec(f.batchSize ?? 1,3) });
  for (const m of mats) await db.insert(productMaterials).values({ productId, materialId: m.id, quantity: dec(m.quantity,3) });
}

export async function saveProduct(raw: unknown, id?: number) {
  const parsed = parse(productSchema, raw); if ("error" in parsed) return parsed; const d = parsed.data;
  const data: any = { ...d, sku: d.sku || undefined, description: nullable(d.description), productCategoryId: d.productCategoryId || null, printerId: d.printerId || null, printerCategoryId: d.printerCategoryId || null, printFormatId: d.printFormatId || null, baseMaterialId: d.baseMaterialId || null, baseServiceId: d.baseServiceId || null, baseMaterialQty: dec(d.baseMaterialQty,3), pagesPerUnit: dec(d.pagesPerUnit,3), copies: dec(d.copies,3), defaultQuantity: dec(d.defaultQuantity,3), piecesPerSheet: dec(d.piecesPerSheet,3), wastePercent: dec(d.wastePercent,4), minOrderQty: dec(d.minOrderQty,3), operationalRate: dec(d.operationalRate,4), roundingStep: dec(d.roundingStep,2), margin: dec(d.margin,4), costSnapshot: dec(d.costSnapshot,4), sellPrice: dec(d.sellPrice,4), finalPrice: dec(d.finalPrice,4), stock: dec(d.stock,3), minStock: dec(d.minStock,3), breakdown: d.breakdown ?? null };
  delete data.finishings; delete data.materials;
  if (id) { const [row] = await db.update(products).set(data).where(eq(products.id,id)).returning(); await syncComponents(id,d.finishings,d.materials); return {ok:true as const,row}; }
  const [row0] = await db.insert(products).values(data).returning(); const sku = d.sku || genSku(row0.name,row0.id); const [row] = await db.update(products).set({sku}).where(eq(products.id,row0.id)).returning();
  if (d.trackStock && d.stock > 0) await db.insert(stockMovements).values({ kind:"entrada", targetType:"product", productId: row.id, quantity: dec(d.stock,3), reason:"ajuste", notes:"Estoque inicial", automatic:true });
  await syncComponents(row.id,d.finishings,d.materials); return {ok:true as const,row};
}

export async function deleteProduct(id: number) {
  const [sale] = await db.select({id:sales.id}).from(sales).where(sql`${sales.items}::text LIKE ${`%"productId":${id}%`}`).limit(1);
  const [order] = await db.select({id:orders.id}).from(orders).where(sql`${orders.items}::text LIKE ${`%"productId":${id}%`}`).limit(1);
  const [qi] = await db.select({id:quoteItems.id}).from(quoteItems).where(eq(quoteItems.productId,id)).limit(1);
  if (sale || order || qi) { const [row]=await db.update(products).set({active:false}).where(eq(products.id,id)).returning(); return {ok:true as const,row,archived:true}; }
  await db.delete(products).where(eq(products.id,id)); return {ok:true as const};
}

/* --------------------------------------------------------------------
 * TABELAS DE PREÇO — caminho único (v3.41.0)
 *
 * Este arquivo tinha uma segunda implementação de `savePricingTable`
 * que gravava direto em `pricing_tables` SEM as validações do módulo
 * oficial: aceitava lona sem dimensão (deixando o cálculo de m² com
 * área zero), permitia descrição duplicada e não normalizava a
 * unidade. Não estava plugada em rota nenhuma, mas estava exportada —
 * qualquer código novo que a importasse furava as três regras.
 *
 * Reexportamos o módulo validado para que exista UMA porta só.
 * ------------------------------------------------------------------ */
export {
  createPricingTable,
  updatePricingTable,
  archivePricingTable as deletePricingTable,
} from "@/lib/pricing-tables";

export async function savePricingTable(raw: unknown, id?: number) {
  const { createPricingTable, updatePricingTable } = await import("@/lib/pricing-tables");
  return id ? updatePricingTable(id, raw) : createPricingTable(raw);
}


const serviceSchema = z.object({ name:z.string().trim().min(2), categoryId:z.coerce.number().int().positive().nullable().optional(), type:z.enum(["proprio","terceirizado"]).default("proprio"), baseCost:finite.min(0).default(0), estimatedHours:finite.min(0).default(0), becomesProduct:z.boolean().default(false), partner:z.string().trim().nullable().optional(), description:z.string().trim().nullable().optional() });
export async function saveService(raw:unknown,id?:number){ const p=parse(serviceSchema,raw); if("error" in p)return p; const d=p.data; const data={...d,categoryId:d.categoryId||null,baseCost:dec(d.baseCost),estimatedHours:dec(d.estimatedHours,2),partner:nullable(d.partner),description:nullable(d.description)}; if(id){const [row]=await db.update(services).set(data).where(eq(services.id,id)).returning(); return {ok:true as const,row};} const [row]=await db.insert(services).values(data).returning(); return {ok:true as const,row}; }
export async function deleteService(id:number){ const [p]=await db.select({id:products.id}).from(products).where(eq(products.baseServiceId,id)).limit(1); const [q]=await db.select({id:quoteItems.id}).from(quoteItems).where(eq(quoteItems.serviceId,id)).limit(1); if(p||q) return {error:"Serviço em uso por produtos/orçamentos.",status:409} as CatalogError; await db.delete(services).where(eq(services.id,id)); return {ok:true as const}; }

const finishingSchema = z.object({ name:z.string().trim().min(2), categoryId:z.coerce.number().int().positive().nullable().optional(), unit:z.string().trim().default("unidade"), unitCost:finite.min(0).default(0), description:z.string().trim().nullable().optional() });
export async function saveFinishing(raw:unknown,id?:number){ const p=parse(finishingSchema,raw); if("error" in p)return p; const d=p.data; const data={...d,categoryId:d.categoryId||null,unitCost:dec(d.unitCost),description:nullable(d.description)}; if(id){const [row]=await db.update(finishingItems).set(data).where(eq(finishingItems.id,id)).returning(); return {ok:true as const,row};} const [row]=await db.insert(finishingItems).values(data).returning(); return {ok:true as const,row}; }
export async function deleteFinishing(id:number){ const [p]=await db.select({id:productFinishings.id}).from(productFinishings).where(eq(productFinishings.finishingId,id)).limit(1); if(p) return {error:"Acabamento em uso por produtos.",status:409} as CatalogError; await db.delete(finishingItems).where(eq(finishingItems.id,id)); return {ok:true as const}; }

const materialSchema=z.object({name:z.string().trim().min(2),categoryId:z.coerce.number().int().positive().nullable().optional(),unit:z.string().trim().default("unidade"),unitCost:finite.min(0).default(0),supplier:z.string().trim().nullable().optional(),stock:finite.default(0),minStock:finite.min(0).default(0),notes:z.string().trim().nullable().optional()});
export async function saveMaterial(raw:unknown,id?:number){ const p=parse(materialSchema,raw); if("error" in p)return p; const d=p.data; const data={...d,categoryId:d.categoryId||null,unitCost:dec(d.unitCost),stock:dec(d.stock,3),minStock:dec(d.minStock,3),supplier:nullable(d.supplier),notes:nullable(d.notes)}; if(id){const [row]=await db.update(materials).set(data).where(eq(materials.id,id)).returning(); return {ok:true as const,row};} const [row]=await db.insert(materials).values(data).returning(); return {ok:true as const,row}; }
export async function deleteMaterial(id:number){ const [pm]=await db.select({id:productMaterials.id}).from(productMaterials).where(eq(productMaterials.materialId,id)).limit(1); const [mv]=await db.select({id:stockMovements.id}).from(stockMovements).where(eq(stockMovements.materialId,id)).limit(1); if(pm||mv) return {error:"Material em uso por produtos/movimentações.",status:409} as CatalogError; await db.delete(materials).where(eq(materials.id,id)); return {ok:true as const}; }
