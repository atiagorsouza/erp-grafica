import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { deliveries, kanbanCards, orders } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { round2, toDecimalString, toNumber } from "@/lib/money";
import { todayISO } from "@/lib/period";

export const KANBAN_COLUMNS = ["backlog", "producao", "revisao", "pronto", "entregue", "cancelado"] as const;
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

export const KANBAN_COLUMN_META: Record<KanbanColumn, { label: string; color: string }> = {
  backlog: { label: "Backlog", color: "#94a3b8" },
  producao: { label: "Em produção", color: "var(--color-proc-c)" },
  revisao: { label: "Revisão / QC", color: "var(--color-proc-y)" },
  pronto: { label: "Pronto", color: "var(--color-proc-m)" },
  entregue: { label: "Entregue", color: "#10b981" },
  cancelado: { label: "Cancelados", color: "#64748b" },
};

const CARD_TO_ORDER: Partial<Record<KanbanColumn, Partial<typeof orders.$inferInsert>>> = {
  backlog: { productionStatus: "aguardando", status: "confirmado" },
  producao: { productionStatus: "em_producao", status: "confirmado" },
  revisao: { productionStatus: "em_producao", status: "confirmado", artStatus: "revisao" },
  pronto: { productionStatus: "concluido", status: "concluido" },
  entregue: { productionStatus: "concluido", status: "concluido", deliveryStatus: "entregue" },
};

const cardSchema = z.object({
  title: z.string().trim().min(2, "Título obrigatório").max(180),
  description: z.string().trim().max(500).nullable().optional(),
  column: z.enum(KANBAN_COLUMNS).default("backlog"),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  customerName: z.string().trim().max(160).nullable().optional(),
  orderId: z.coerce.number().int().positive().nullable().optional(),
  quoteId: z.coerce.number().int().positive().nullable().optional(),
  productId: z.coerce.number().int().positive().nullable().optional(),
  order: z.coerce.number().int().min(0).max(1_000_000).optional(),
  priority: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
  dueDate: z.string().trim().nullable().optional(),
  estimatedValue: z.coerce.number().finite().min(0).max(999999999).nullable().optional(),
});

const patchSchema = cardSchema.partial().extend({ column: z.enum(KANBAN_COLUMNS).optional() });

type KanbanError = { error: string; status: number; details?: unknown };

function parse<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | KanbanError {
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

function insertData(data: z.infer<typeof cardSchema>) {
  return {
    title: data.title.trim(),
    description: nullable(data.description),
    column: data.column,
    customerId: data.customerId || null,
    customerName: nullable(data.customerName),
    orderId: data.orderId || null,
    quoteId: data.quoteId || null,
    productId: data.productId || null,
    order: data.order ?? 0,
    priority: data.priority,
    dueDate: data.dueDate ? String(data.dueDate) : null,
    estimatedValue: data.estimatedValue != null ? toDecimalString(data.estimatedValue, 2) : null,
  };
}

function patchData(data: z.infer<typeof patchSchema>) {
  const patch: Partial<typeof kanbanCards.$inferInsert> = { updatedAt: new Date() };
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.description !== undefined) patch.description = nullable(data.description);
  if (data.column !== undefined) patch.column = data.column;
  if (data.customerId !== undefined) patch.customerId = data.customerId || null;
  if (data.customerName !== undefined) patch.customerName = nullable(data.customerName);
  if (data.orderId !== undefined) patch.orderId = data.orderId || null;
  if (data.quoteId !== undefined) patch.quoteId = data.quoteId || null;
  if (data.productId !== undefined) patch.productId = data.productId || null;
  if (data.order !== undefined) patch.order = data.order;
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.dueDate !== undefined) patch.dueDate = data.dueDate ? String(data.dueDate) : null;
  if (data.estimatedValue !== undefined) {
    patch.estimatedValue = data.estimatedValue != null ? toDecimalString(data.estimatedValue, 2) : null;
  }
  return patch;
}

async function syncOrderFromCard(card: typeof kanbanCards.$inferSelect) {
  if (!card.orderId) return;
  const col = String(card.column) as KanbanColumn;
  const orderPatch = CARD_TO_ORDER[col];
  if (!orderPatch) return; // cancelado exige cancelamento formal em Pedidos & OS

  await db.update(orders).set({ ...orderPatch, updatedAt: new Date() }).where(eq(orders.id, card.orderId));

  if (col === "entregue") {
    await db
      .update(deliveries)
      .set({ status: "entregue", deliveredAt: new Date() })
      .where(eq(deliveries.orderId, card.orderId));
  }
}

/** Prazo no passado nasce vencido e polui o painel de atrasos. */
function assertDueDate(dueDate: string | null | undefined): KanbanError | null {
  if (!dueDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "Data de entrega inválida", status: 422 };
  }
  if (dueDate < todayISO()) {
    return { error: "A data de entrega não pode ser uma data passada", status: 422 };
  }
  return null;
}

export async function createKanbanCard(raw: unknown) {
  const parsed = parse(cardSchema, raw);
  if ("error" in parsed) return parsed;

  const dueError = assertDueDate(parsed.data.dueDate);
  if (dueError) return dueError;

  const [row] = await db.insert(kanbanCards).values(insertData(parsed.data)).returning();
  await syncOrderFromCard(row);
  return { ok: true as const, row };
}

export async function updateKanbanCard(id: number, raw: unknown) {
  const parsed = parse(patchSchema, raw);
  if ("error" in parsed) return parsed;
  const [existing] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, id)).limit(1);
  if (!existing) return { error: "Card não encontrado", status: 404 } satisfies KanbanError;

  if (parsed.data.column === "cancelado" && existing.orderId) {
    return {
      error: "Cancele pedidos vinculados em Pedidos & OS para registrar motivo e estorno corretamente.",
      status: 409,
    } satisfies KanbanError;
  }

  const dueError = assertDueDate(parsed.data.dueDate);
  if (dueError) return dueError;

  const [row] = await db.update(kanbanCards).set(patchData(parsed.data)).where(eq(kanbanCards.id, id)).returning();
  await syncOrderFromCard(row);
  return { ok: true as const, row };
}

export async function syncKanbanBy(field: "quoteId" | "orderId", value: number, raw: unknown) {
  const column = field === "quoteId" ? kanbanCards.quoteId : kanbanCards.orderId;
  const [existing] = await db.select().from(kanbanCards).where(eq(column, value)).limit(1);
  if (!existing) return { ok: true as const, row: null, note: `card not found for ${field}` };
  return updateKanbanCard(existing.id, raw);
}

export async function deleteKanbanCard(id: number) {
  const [existing] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, id)).limit(1);
  if (!existing) return { error: "Card não encontrado", status: 404 } satisfies KanbanError;
  if (existing.orderId) {
    return {
      error: "Card vinculado a Pedido/OS não pode ser removido diretamente. Cancele ou edite o pedido.",
      status: 409,
    } satisfies KanbanError;
  }
  await db.delete(kanbanCards).where(eq(kanbanCards.id, id));
  return { ok: true as const };
}

/**
 * Reordena (e opcionalmente move) cards de uma coluna.
 *
 * Antes da v3.20.0 esta função era uma porta lateral que ignorava as
 * regras do quadro: aplicava `column` a todos os ids sem conferir a
 * origem, não sincronizava o Pedido vinculado e passava por cima da
 * trava de cancelamento que o `updateKanbanCard` impõe. Um card podia
 * ficar em "Pronto" com o pedido ainda "aguardando".
 *
 * `allowMove` distingue as duas intenções: arrastar dentro da coluna
 * (padrão, só reordena) e arrastar de outra coluna (move e sincroniza).
 */
export async function reorderKanban(
  column: KanbanColumn,
  ids: number[],
  { allowMove = false }: { allowMove?: boolean } = {}
) {
  if (!KANBAN_COLUMNS.includes(column)) return { error: "Coluna inválida", status: 400 } satisfies KanbanError;
  if (ids.length === 0) return { ok: true as const };

  /* ids repetidos gerariam posições inconsistentes */
  if (new Set(ids).size !== ids.length) {
    return { error: "Lista contém cards repetidos", status: 422 } satisfies KanbanError;
  }

  const rows = await db
    .select({ id: kanbanCards.id, column: kanbanCards.column, orderId: kanbanCards.orderId })
    .from(kanbanCards)
    .where(inArray(kanbanCards.id, ids));
  if (rows.length !== ids.length) return { error: "Lista contém card inexistente", status: 422 } satisfies KanbanError;

  const byId = new Map(rows.map((r) => [r.id, r]));
  const incoming = rows.filter((r) => r.column !== column);

  /* Sem `allowMove`, reordenar não pode arrastar card de outra coluna
     para dentro — era assim que um card ia parar no backlog sem que
     ninguém tivesse pedido. */
  if (!allowMove && incoming.length > 0) {
    return {
      error: "A lista contém cards que não pertencem a esta coluna",
      status: 422,
      details: { foreignIds: incoming.map((r) => r.id) },
    } satisfies KanbanError;
  }

  /* A mesma trava do `updateKanbanCard`: cancelar exige motivo e
     estorno formais em Pedidos & OS. */
  if (column === "cancelado") {
    const vinculados = incoming.filter((r) => r.orderId);
    if (vinculados.length > 0) {
      return {
        error: "Cancele pedidos vinculados em Pedidos & OS para registrar motivo e estorno corretamente.",
        status: 409,
        details: { orderCardIds: vinculados.map((r) => r.id) },
      } satisfies KanbanError;
    }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(kanbanCards).set({ column, order: i, updatedAt: new Date() }).where(eq(kanbanCards.id, ids[i]));
    }
  });

  /* Só quem mudou de coluna precisa refletir no Pedido — reordenar
     dentro da mesma coluna não altera o andamento da produção. */
  for (const r of incoming) {
    const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, byId.get(r.id)!.id)).limit(1);
    if (card) await syncOrderFromCard(card);
  }

  return { ok: true as const, moved: incoming.length };
}

export function getKanbanHealth(cards: (typeof kanbanCards.$inferSelect)[]) {
  const hidden = cards.filter((c) => !KANBAN_COLUMNS.includes(String(c.column) as KanbanColumn));
  const totalValue = cards.reduce((sum, c) => sum + toNumber(c.estimatedValue, 0), 0);
  return { hidden: hidden.length, totalValue: round2(totalValue) };
}
