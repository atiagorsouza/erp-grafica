import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { materials, products, purchases, stockMovements, suppliers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { nextDocumentNumber } from "@/lib/documents";
import { formatCEP, formatPhone, isValidEmail } from "@/lib/validators";
import { round2, toDecimalString, toNumber } from "@/lib/money";
import { upsertAutoTransaction } from "@/lib/finance";
import { todayISO } from "@/lib/period";

export type StockError = { error: string; status: number; details?: unknown };

/**
 * Erro de regra de negócio lançado de dentro de uma transação.
 * Precisa ser uma exceção para abortar o `db.transaction`, mas carrega
 * status HTTP para virar resposta tratada — e não um 500 com SQL.
 */
class StockRuleError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "StockRuleError";
    this.status = status;
  }
}

/** Quantidades de estoque são numeric(12,3): evita 0.30000000000000004. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

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
  /* Zero só faz sentido em `ajuste` (a contagem não encontrou o item);
     entrada e saída exigem quantidade positiva — validado no superRefine. */
  quantity: finite.min(0).max(999999999),
  unitCost: finite.min(0).max(999999999).default(0),
  reason: z.string().trim().max(80).default("ajuste"),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  automatic: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.kind !== "ajuste" && v.quantity <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quantity"],
      message: "Quantidade deve ser maior que zero",
    });
  }
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

/**
 * Registra movimentação de estoque.
 *
 * A leitura do saldo usa `FOR UPDATE`: sem a trava, duas saídas
 * simultâneas liam o mesmo saldo e ambas passavam na validação — 5
 * saídas de 4 un sobre um saldo de 10 deixavam o material em -10.
 * Mesma estratégia que o PDV já usa em `assertStockLocked`.
 *
 * `ajuste` DEFINE o saldo (contagem física): o delta é a diferença
 * entre o valor contado e o saldo atual, e pode ser negativo.
 */
export async function createStockMovement(raw: unknown, opts?: { allowAutomatic?: boolean }) {
  const parsed = parse(movementSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const targetId = d.targetId || (d.targetType === "material" ? d.materialId : d.productId);
  if (!targetId) return { error: "Informe o item do estoque", status: 422 } satisfies StockError;

  /* `automatic` marca o que o sistema gerou (venda, produção, compra) e
     bloqueia a exclusão manual. Aceitar a flag do cliente permitia criar
     um movimento manual impossível de apagar pela tela. */
  const automatic = opts?.allowAutomatic === true ? d.automatic : false;

  try {
    const row = await db.transaction(async (tx) => {
      const table = d.targetType === "material" ? materials : products;

      const [target] = await tx
        .select()
        .from(table)
        .where(eq(table.id, targetId))
        .limit(1)
        .for("update");

      if (!target) {
        throw new StockRuleError(
          d.targetType === "material" ? "Material não encontrado" : "Produto não encontrado",
          404
        );
      }

      /* Produto sob demanda não tem saldo para movimentar: gravar aqui
         criava um estoque fantasma que nenhuma tela leva a sério. */
      if (d.targetType === "product" && (target as typeof products.$inferSelect).trackStock !== true) {
        throw new StockRuleError(
          "Produto não controla estoque. Ative “Controlar estoque” no cadastro para movimentá-lo.",
          422
        );
      }

      const current = toNumber(target.stock, 0);

      let delta: number;
      if (d.kind === "saida") {
        if (current < d.quantity) {
          throw new StockRuleError(
            `Saldo insuficiente para saída. Disponível: ${current}`,
            409
          );
        }
        delta = -d.quantity;
      } else if (d.kind === "ajuste") {
        delta = round3(d.quantity - current);
      } else {
        delta = d.quantity;
      }

      await tx
        .update(table)
        .set({ stock: sql`${table.stock} + ${delta}` })
        .where(eq(table.id, targetId));

      const [mv] = await tx
        .insert(stockMovements)
        .values({
          kind: d.kind,
          targetType: d.targetType,
          materialId: d.targetType === "material" ? targetId : null,
          productId: d.targetType === "product" ? targetId : null,
          /* no ajuste, guardamos o movimento real aplicado ao saldo */
          quantity: toDecimalString(d.kind === "ajuste" ? Math.abs(delta) : d.quantity, 3),
          unitCost: toDecimalString(d.unitCost, 4),
          reason: d.reason,
          reference: nullable(d.reference),
          notes: nullable(d.notes),
          automatic,
        })
        .returning();
      return mv;
    });
    return { ok: true as const, row };
  } catch (e) {
    if (e instanceof StockRuleError) {
      return { error: e.message, status: e.status } satisfies StockError;
    }
    throw e;
  }
}

/**
 * Exclui uma movimentação manual, revertendo o efeito no saldo.
 *
 * A reversão é recusada quando deixaria o saldo negativo: apagar uma
 * entrada de 50 que já foi consumida por uma saída de 50 levava o
 * material a -50 silenciosamente. Nesse caso o certo é registrar um
 * novo movimento, não apagar o histórico.
 */
export async function deleteStockMovement(id: number) {
  if (!Number.isFinite(id) || id <= 0) {
    return { error: "Movimentação inválida", status: 422 } satisfies StockError;
  }

  try {
    await db.transaction(async (tx) => {
      const [mv] = await tx
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.id, id))
        .limit(1)
        .for("update");

      if (!mv) throw new StockRuleError("Movimentação não encontrada", 404);
      if (mv.automatic) {
        throw new StockRuleError(
          "Movimentação automática não pode ser excluída manualmente",
          409
        );
      }

      const qty = toNumber(mv.quantity, 0);
      const revert = mv.kind === "saida" ? qty : -qty;
      const table = mv.targetType === "material" ? materials : products;
      const targetId = mv.targetType === "material" ? mv.materialId : mv.productId;

      if (targetId) {
        const [target] = await tx
          .select()
          .from(table)
          .where(eq(table.id, targetId))
          .limit(1)
          .for("update");

        if (target) {
          const resulting = round3(toNumber(target.stock, 0) + revert);
          if (resulting < 0) {
            throw new StockRuleError(
              `Excluir deixaria o saldo em ${resulting}. A quantidade já foi consumida — registre um novo movimento para corrigir.`,
              409
            );
          }
          await tx
            .update(table)
            .set({ stock: sql`${table.stock} + ${revert}` })
            .where(eq(table.id, targetId));
        }
      }

      await tx.delete(stockMovements).where(eq(stockMovements.id, id));
    });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof StockRuleError) {
      return { error: e.message, status: e.status } satisfies StockError;
    }
    throw e;
  }
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

/**
 * Recebe a compra e dá entrada no estoque.
 *
 * O status é conferido DENTRO da transação, sobre a linha travada com
 * `FOR UPDATE`. Antes a conferência acontecia fora: três recebimentos
 * simultâneos passavam juntos e davam entrada 3× (100 un viravam 300).
 * A despesa nunca duplicou porque `upsertAutoTransaction` é idempotente
 * — o estoque é que não tinha defesa.
 */
export async function receivePurchase(purchaseId: number) {
  if (!Number.isFinite(purchaseId) || purchaseId <= 0) {
    return { error: "Compra inválida", status: 422 } satisfies StockError;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select()
        .from(purchases)
        .where(eq(purchases.id, purchaseId))
        .limit(1)
        .for("update");

      if (!purchase) throw new StockRuleError("Compra não encontrada", 404);
      if (purchase.status === "cancelado") {
        throw new StockRuleError("Compra cancelada não pode ser recebida", 409);
      }
      /* Segundo recebimento concorrente encontra o status já gravado. */
      if (purchase.status === "recebido") {
        return { row: purchase, alreadyReceived: true as const };
      }

      const row = await receivePurchaseLocked(tx, purchase);
      return { row, alreadyReceived: false as const };
    });

    return { ok: true as const, row: result.row, alreadyReceived: result.alreadyReceived };
  } catch (e) {
    if (e instanceof StockRuleError) {
      return { error: e.message, status: e.status } satisfies StockError;
    }
    throw e;
  }
}

type PurchaseRow = typeof purchases.$inferSelect;

async function receivePurchaseLocked(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  purchase: PurchaseRow
) {
  const items = (purchase.items || []) as { materialId: number; quantity: number; unitCost: number; label?: string }[];
  const purchaseId = purchase.id;
  {
    for (const item of items) {
      const quantity = toNumber(item.quantity, 0);
      const unitCost = toNumber(item.unitCost, 0);
      if (!item.materialId || quantity <= 0) continue;
      await tx.update(materials).set({ stock: sql`${materials.stock} + ${quantity}`, unitCost: toDecimalString(unitCost, 4) }).where(eq(materials.id, item.materialId));
      await tx.insert(stockMovements).values({ kind: "entrada", targetType: "material", materialId: item.materialId, quantity: toDecimalString(quantity, 3), unitCost: toDecimalString(unitCost, 4), reason: "compra", reference: purchase.number, notes: "Recebimento automático de compra.", automatic: true });
    }
    const [updated] = await tx.update(purchases).set({ status: "recebido", receivedAt: new Date() }).where(eq(purchases.id, purchaseId)).returning();

    /* ------------------------------------------------------------
     * DESPESA DA COMPRA (v3.11.0)
     *
     * Até a v3.10.0 o recebimento só mexia em estoque: o custo do
     * insumo NUNCA entrava no financeiro, embora a própria tela do
     * Financeiro prometesse "compras, as despesas". O resultado do
     * período mostrava receita sem o custo de material.
     *
     * `upsertAutoTransaction` casa por purchaseId, então receber a
     * mesma compra duas vezes atualiza — não duplica a despesa.
     * ----------------------------------------------------------- */
    const totalPurchase = toNumber(updated.total, 0);
    if (totalPurchase > 0) {
      const [supplier] = updated.supplierId
        ? await tx.select().from(suppliers).where(eq(suppliers.id, updated.supplierId)).limit(1)
        : [];
      await upsertAutoTransaction(tx, {
        type: "despesa",
        category: "compra",
        description: `Compra ${updated.number}${supplier?.name ? ` — ${supplier.name}` : ""}`,
        amount: totalPurchase,
        dueDate: updated.expectedDate || todayISO(),
        status: "pendente",
        purchaseId: updated.id,
        notes: "Gerada automaticamente pelo recebimento da compra.",
      });
    }

    return updated;
  }
}
