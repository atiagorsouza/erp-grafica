import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { materials, products, purchases, stockMovements, suppliers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { nextDocumentNumber } from "@/lib/documents";
import { formatCEP, formatPhone, isValidEmail } from "@/lib/validators";
import { round2, toDecimalString, toNumber } from "@/lib/money";

export type StockError = { error: string; status: number; details?: unknown };

const finite = z.coerce.number().finite();
const materialSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(180),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  unit: z.string().trim().min(1).max(40).default("unidade"),
  unitCost: finite.min(0).max(999999999).default(0),
  supplier: z.string().trim().max(180).nullable().optional(),
  stock: finite.min(-999999999).max(999999999).default(0),
  minStock: finite.min(0).max(999999999).default(0),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const supplierSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(180),
  tradeName: z.string().trim().max(180).nullable().optional(),
  document: z.string().trim().max(32).nullable().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().max(180).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  website: z.string().trim().max(180).nullable().optional(),
  cep: z.string().trim().max(12).nullable().optional(),
  street: z.string().trim().max(180).nullable().optional(),
  number: z.string().trim().max(30).nullable().optional(),
  complement: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(2).nullable().optional(),
  paymentTerms: z.string().trim().max(160).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).default(0),
  notes: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().default(true),
});

const movementSchema = z.object({
  kind: z.enum(["entrada", "saida", "ajuste"]),
  targetType: z.enum(["material", "product"]),
  targetId: z.coerce.number().int().positive().optional(),
  materialId: z.coerce.number().int().positive().nullable().optional(),
  productId: z.coerce.number().int().positive().nullable().optional(),
  quantity: finite.positive("Quantidade deve ser maior que zero").max(999999999),
  unitCost: finite.min(0).max(999999999).default(0),
  reason: z.string().trim().max(80).default("ajuste"),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  automatic: z.boolean().default(false),
});

const purchaseItemSchema = z.object({
  materialId: z.coerce.number().int().positive(),
  quantity: finite.positive().max(999999999),
  unitCost: finite.min(0).max(999999999),
  label: z.string().trim().max(180).nullable().optional(),
});
const purchaseSchema = z.object({
  supplierId: z.coerce.number().int().positive().nullable().optional(),
  status: z.string().trim().max(40).default("pedido"),
  items: z.array(purchaseItemSchema).min(1, "Compra precisa ter itens"),
  freight: finite.min(0).max(999999999).default(0),
  discount: finite.min(0).max(999999999).default(0),
  expectedDate: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

function parse<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | StockError {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${first.path.join(".") || "dados"}: ${first.message}` : "Dados inválidos", status: 400, details: parsed.error.flatten() };
  }
  return { ok: true, data: parsed.data };
}
const nullable = (v: unknown) => { const s = String(v ?? "").trim(); return s ? s : null; };

export async function saveMaterial(raw: unknown, id?: number) {
  const parsed = parse(materialSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const data = { name: d.name, categoryId: d.categoryId || null, unit: d.unit, unitCost: toDecimalString(d.unitCost, 4), supplier: nullable(d.supplier), stock: toDecimalString(d.stock, 3), minStock: toDecimalString(d.minStock, 3), notes: nullable(d.notes) };
  if (id) {
    const [row] = await db.update(materials).set(data).where(eq(materials.id, id)).returning();
    if (!row) return { error: "Material não encontrado", status: 404 } satisfies StockError;
    return { ok: true as const, row };
  }
  const [row] = await db.insert(materials).values(data).returning();
  return { ok: true as const, row };
}

export async function archiveMaterial(id: number, reason = "Arquivado") {
  const [m] = await db.select().from(materials).where(eq(materials.id, id)).limit(1);
  if (!m) return { error: "Material não encontrado", status: 404 } satisfies StockError;
  const [used] = await db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.materialId, id)).limit(1);
  if (used || toNumber(m.stock, 0) !== 0) {
    const [row] = await db.update(materials).set({ notes: [m.notes, `ARQUIVADO: ${reason}`].filter(Boolean).join("\n") }).where(eq(materials.id, id)).returning();
    return { ok: true as const, row, archived: true };
  }
  await db.delete(materials).where(eq(materials.id, id));
  return { ok: true as const };
}

export async function saveSupplier(raw: unknown, id?: number) {
  const parsed = parse(supplierSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  if (d.email && !isValidEmail(d.email)) return { error: "E-mail inválido", status: 422 } satisfies StockError;
  const data = {
    name: d.name, tradeName: nullable(d.tradeName), document: nullable(d.document), contactName: nullable(d.contactName),
    email: d.email ? d.email.trim().toLowerCase() : null, phone: d.phone ? formatPhone(d.phone) : null, whatsapp: d.whatsapp ? formatPhone(d.whatsapp) : null,
    website: nullable(d.website), cep: d.cep ? formatCEP(d.cep) : null, street: nullable(d.street), number: nullable(d.number), complement: nullable(d.complement), district: nullable(d.district), city: nullable(d.city), state: d.state ? d.state.toUpperCase().slice(0,2) : null,
    paymentTerms: nullable(d.paymentTerms), leadTimeDays: d.leadTimeDays, notes: nullable(d.notes), active: d.active,
  };
  if (id) {
    const [row] = await db.update(suppliers).set(data).where(eq(suppliers.id, id)).returning();
    if (!row) return { error: "Fornecedor não encontrado", status: 404 } satisfies StockError;
    return { ok: true as const, row };
  }
  const [row] = await db.insert(suppliers).values(data).returning();
  return { ok: true as const, row };
}

export async function archiveSupplier(id: number) {
  const [row] = await db.update(suppliers).set({ active: false }).where(eq(suppliers.id, id)).returning();
  if (!row) return { error: "Fornecedor não encontrado", status: 404 } satisfies StockError;
  return { ok: true as const, row };
}

export async function createStockMovement(raw: unknown) {
  const parsed = parse(movementSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const targetId = d.targetId || (d.targetType === "material" ? d.materialId : d.productId);
  if (!targetId) return { error: "Informe o item do estoque", status: 422 } satisfies StockError;

  const delta = d.kind === "saida" ? -d.quantity : d.quantity;
  const row = await db.transaction(async (tx) => {
    if (d.targetType === "material") {
      const [target] = await tx.select().from(materials).where(eq(materials.id, targetId)).limit(1);
      if (!target) throw new Error("Material não encontrado");
      if (d.kind === "saida" && toNumber(target.stock, 0) < d.quantity) throw new Error("Saldo insuficiente para saída");
      await tx.update(materials).set({ stock: sql`${materials.stock} + ${delta}` }).where(eq(materials.id, targetId));
    } else {
      const [target] = await tx.select().from(products).where(eq(products.id, targetId)).limit(1);
      if (!target) throw new Error("Produto não encontrado");
      if (d.kind === "saida" && toNumber(target.stock, 0) < d.quantity) throw new Error("Saldo insuficiente para saída");
      await tx.update(products).set({ stock: sql`${products.stock} + ${delta}` }).where(eq(products.id, targetId));
    }
    const [mv] = await tx.insert(stockMovements).values({ kind: d.kind, targetType: d.targetType, materialId: d.targetType === "material" ? targetId : null, productId: d.targetType === "product" ? targetId : null, quantity: toDecimalString(d.quantity, 3), unitCost: toDecimalString(d.unitCost, 4), reason: d.reason, reference: nullable(d.reference), notes: nullable(d.notes), automatic: d.automatic }).returning();
    return mv;
  });
  return { ok: true as const, row };
}

export async function deleteStockMovement(id: number) {
  const [mv] = await db.select().from(stockMovements).where(eq(stockMovements.id, id)).limit(1);
  if (!mv) return { error: "Movimentação não encontrada", status: 404 } satisfies StockError;
  if (mv.automatic) return { error: "Movimentação automática não pode ser excluída manualmente", status: 409 } satisfies StockError;
  const qty = toNumber(mv.quantity, 0);
  const revert = mv.kind === "saida" ? qty : -qty;
  await db.transaction(async (tx) => {
    if (mv.targetType === "material" && mv.materialId) await tx.update(materials).set({ stock: sql`${materials.stock} + ${revert}` }).where(eq(materials.id, mv.materialId));
    if (mv.targetType === "product" && mv.productId) await tx.update(products).set({ stock: sql`${products.stock} + ${revert}` }).where(eq(products.id, mv.productId));
    await tx.delete(stockMovements).where(eq(stockMovements.id, id));
  });
  return { ok: true as const };
}

export async function createPurchase(raw: unknown) {
  const parsed = parse(purchaseSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const subtotal = round2(d.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0));
  const total = round2(subtotal + d.freight - d.discount);
  const number = await nextDocumentNumber("purchase");
  const [row] = await db.insert(purchases).values({ number, supplierId: d.supplierId || null, status: d.status || "pedido", items: d.items, subtotal: toDecimalString(subtotal, 4), freight: toDecimalString(d.freight, 4), discount: toDecimalString(d.discount, 4), total: toDecimalString(total, 4), expectedDate: d.expectedDate || null, notes: nullable(d.notes) }).returning();
  return { ok: true as const, row };
}

export async function receivePurchase(purchaseId: number) {
  const [purchase] = await db.select().from(purchases).where(eq(purchases.id, purchaseId)).limit(1);
  if (!purchase) return { error: "Compra não encontrada", status: 404 } satisfies StockError;
  if (purchase.status === "recebido") return { ok: true as const, row: purchase, alreadyReceived: true };
  if (purchase.status === "cancelado") return { error: "Compra cancelada não pode ser recebida", status: 409 } satisfies StockError;
  const items = (purchase.items || []) as { materialId: number; quantity: number; unitCost: number; label?: string }[];
  const row = await db.transaction(async (tx) => {
    for (const item of items) {
      const quantity = toNumber(item.quantity, 0);
      const unitCost = toNumber(item.unitCost, 0);
      if (!item.materialId || quantity <= 0) continue;
      await tx.update(materials).set({ stock: sql`${materials.stock} + ${quantity}`, unitCost: toDecimalString(unitCost, 4) }).where(eq(materials.id, item.materialId));
      await tx.insert(stockMovements).values({ kind: "entrada", targetType: "material", materialId: item.materialId, quantity: toDecimalString(quantity, 3), unitCost: toDecimalString(unitCost, 4), reason: "compra", reference: purchase.number, notes: "Recebimento automático de compra.", automatic: true });
    }
    const [updated] = await tx.update(purchases).set({ status: "recebido", receivedAt: new Date() }).where(eq(purchases.id, purchaseId)).returning();
    return updated;
  });
  return { ok: true as const, row };
}
