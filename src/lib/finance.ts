import "server-only";

/* ====================================================================
 *  FINANCE — camada server-side do módulo Financeiro
 * ====================================================================
 *
 *  Antes da v3.11.0 a API `/api/crud/transactions` era um crudHandler
 *  cru: gravava direto na tabela, sem validação, sem regra de negócio.
 *  Consequências reais reproduzidas em auditoria:
 *
 *   • "10,50" (padrão BR) → NaN no numeric → erro 500 e SQL vazado
 *   • amount negativo e descrição vazia aceitos com 200 OK
 *   • lançamento gerado pelo PDV podia ser DELETADO pela UI
 *   • status "atrasado" existia no enum mas nunca era atribuído
 *
 *  Este módulo é a fonte única de verdade do Financeiro, no mesmo
 *  padrão de orders.ts / sales.ts / stock.ts.
 * ==================================================================== */

import { z } from "zod";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { round2, toDecimalString, toNumber } from "@/lib/money";
import { todayISO, monthRange } from "@/lib/period";

export type FinanceError = { error: string; status: number; details?: unknown };

/* ==================================================================
 *  CATEGORIAS CANÔNICAS
 *
 *  O seed gravava "Vendas"/"Serviços"/"Insumos" (capitalizado) e o
 *  código automático gravava "venda"/"pedido"/"taxa_cartao". Os
 *  filtros tratavam como coisas diferentes. Slug é a forma canônica.
 * ================================================================== */

export const CATEGORY_LABELS: Record<string, string> = {
  venda: "Venda PDV",
  pedido: "Pedido / OS",
  servico: "Serviço",
  compra: "Compra de insumo",
  taxa_cartao: "Taxa de cartão",
  taxa_infinitepay: "Tarifa InfinitePay",
  frete: "Frete / etiqueta",
  estorno: "Estorno",
  estorno_taxa: "Estorno de taxa",
  estorno_pedido: "Estorno de pedido",
  sangria: "Sangria de caixa",
  suprimento: "Suprimento de caixa",
  quebra_caixa: "Quebra de caixa",
  sobra_caixa: "Sobra de caixa",
  insumo: "Insumo",
  energia: "Energia",
  aluguel: "Aluguel",
  salario: "Salário",
  imposto: "Imposto",
  geral: "Geral",
};

/** Normaliza qualquer texto de categoria para o slug canônico. */
export function normalizeCategory(raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (!text) return "geral";
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) return "geral";
  const aliases: Record<string, string> = {
    vendas: "venda",
    servicos: "servico",
    insumos: "insumo",
    pedidos: "pedido",
    compras: "compra",
    cartao: "taxa_cartao",
    taxa: "taxa_cartao",
    luz: "energia",
    salarios: "salario",
    impostos: "imposto",
  };
  return aliases[slug] || slug;
}

export function categoryLabel(slug: unknown): string {
  const key = normalizeCategory(slug);
  return CATEGORY_LABELS[key] || key.replace(/_/g, " ");
}

/* ==================================================================
 *  VALIDAÇÃO
 * ================================================================== */

/**
 * Aceita o que o operador brasileiro realmente digita ("1.234,56",
 * "R$ 10,50") e rejeita o que não é número. Nunca deixa NaN passar
 * para o PostgreSQL.
 */
const moneyInput = z
  .union([z.string(), z.number()])
  .transform((v) => toNumber(v, Number.NaN))
  .refine((n) => Number.isFinite(n), { message: "Valor inválido — use por exemplo 1.234,56" })
  .refine((n) => n >= 0, { message: "Valor não pode ser negativo" })
  .refine((n) => n <= 100_000_000, { message: "Valor acima do limite permitido" })
  .transform((n) => round2(n));

const dateInput = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const text = String(v ?? "").trim();
    if (!text) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return text;
  });

export const transactionInputSchema = z.object({
  type: z.enum(["receita", "despesa"], { message: "Tipo deve ser receita ou despesa" }),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().min(2, "Descrição obrigatória").max(240),
  amount: moneyInput,
  dueDate: dateInput,
  paidDate: dateInput,
  status: z.enum(["pendente", "pago", "atrasado"]).default("pendente"),
  method: z.string().trim().max(60).nullable().optional(),
  customerId: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;

function zodError(error: z.ZodError): FinanceError {
  const first = error.issues[0];
  return {
    error: first ? `${first.path.join(".") || "dados"}: ${first.message}` : "Dados inválidos",
    status: 400,
    details: error.flatten(),
  };
}

function parseFull(raw: unknown) {
  const parsed = transactionInputSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  return { ok: true as const, data: parsed.data };
}

const partialSchema = transactionInputSchema.partial();

function parsePartial(raw: unknown) {
  const parsed = partialSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  return { ok: true as const, data: parsed.data };
}

/* ==================================================================
 *  COERÊNCIA STATUS × DATAS
 *
 *  Regras:
 *   • pago     → exige paidDate (default hoje)
 *   • pendente → paidDate deve ser null
 *   • vencido e não pago → vira "atrasado" automaticamente
 * ================================================================== */

export function resolveStatus(
  status: string,
  dueDate: string | null,
  paidDate: string | null,
  today = todayISO()
): { status: "pendente" | "pago" | "atrasado"; paidDate: string | null } {
  if (status === "pago") {
    return { status: "pago", paidDate: paidDate || today };
  }
  if (dueDate && dueDate < today) {
    return { status: "atrasado", paidDate: null };
  }
  return { status: "pendente", paidDate: null };
}

/* ==================================================================
 *  CRUD MANUAL (usado pela tela do Financeiro)
 * ================================================================== */

export async function createTransaction(raw: unknown) {
  const parsed = parseFull(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;

  const resolved = resolveStatus(d.status, d.dueDate ?? null, d.paidDate ?? null);

  const [row] = await db
    .insert(transactions)
    .values({
      type: d.type,
      category: normalizeCategory(d.category),
      description: d.description,
      amount: toDecimalString(d.amount, 2),
      dueDate: d.dueDate ?? todayISO(),
      paidDate: resolved.paidDate,
      status: resolved.status,
      method: d.method?.trim() || null,
      customerId: d.customerId ?? null,
      notes: d.notes?.trim() || null,
      automatic: false,
    })
    .returning();

  return { ok: true as const, row };
}

export async function updateTransaction(id: number, raw: unknown) {
  const [current] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!current) return { error: "Lançamento não encontrado", status: 404 } satisfies FinanceError;

  /* Lançamento automático é espelho de um documento (venda, pedido,
     compra, caixa). Editar o valor à mão quebra a reconciliação. */
  if (current.automatic) {
    return {
      error:
        "Lançamento gerado automaticamente pelo sistema. Ajuste o documento de origem (venda, pedido ou compra) — apenas a baixa é permitida aqui.",
      status: 409,
      details: { code: "AUTOMATIC_LOCKED", origin: originOf(current) },
    } satisfies FinanceError;
  }

  const parsed = parsePartial(raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;

  const dueDate = d.dueDate !== undefined ? d.dueDate : current.dueDate;
  const nextStatus = d.status ?? current.status;
  const paidDate = d.paidDate !== undefined ? d.paidDate : current.paidDate;
  const resolved = resolveStatus(nextStatus, dueDate, paidDate);

  const patch: Record<string, unknown> = {
    status: resolved.status,
    paidDate: resolved.paidDate,
    dueDate,
  };
  if (d.type !== undefined) patch.type = d.type;
  if (d.category !== undefined) patch.category = normalizeCategory(d.category);
  if (d.description !== undefined) patch.description = d.description;
  if (d.amount !== undefined) patch.amount = toDecimalString(d.amount, 2);
  if (d.method !== undefined) patch.method = d.method?.trim() || null;
  if (d.customerId !== undefined) patch.customerId = d.customerId ?? null;
  if (d.notes !== undefined) patch.notes = d.notes?.trim() || null;

  const [row] = await db
    .update(transactions)
    .set(patch)
    .where(eq(transactions.id, id))
    .returning();

  return { ok: true as const, row };
}

/** Baixa (marcar como pago) — permitida inclusive em lançamento automático. */
export async function settleTransaction(id: number, paidDate?: string | null) {
  const [current] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!current) return { error: "Lançamento não encontrado", status: 404 } satisfies FinanceError;
  if (current.archivedAt) {
    return { error: "Lançamento arquivado não pode receber baixa", status: 409 } satisfies FinanceError;
  }
  if (current.status === "pago") {
    return { ok: true as const, row: current, alreadySettled: true };
  }

  const clean = String(paidDate ?? "").trim();
  const when = /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : todayISO();

  const [row] = await db
    .update(transactions)
    .set({ status: "pago", paidDate: when })
    .where(eq(transactions.id, id))
    .returning();

  return { ok: true as const, row };
}

/** Reabre um lançamento pago (estorna a baixa). */
export async function reopenTransaction(id: number) {
  const [current] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!current) return { error: "Lançamento não encontrado", status: 404 } satisfies FinanceError;

  const resolved = resolveStatus("pendente", current.dueDate, null);
  const [row] = await db
    .update(transactions)
    .set({ status: resolved.status, paidDate: null })
    .where(eq(transactions.id, id))
    .returning();

  return { ok: true as const, row };
}

/**
 * Exclusão = arquivamento (padrão adotado desde a v3.0.4).
 * Lançamento automático nunca é removido: some do caixa e a
 * reconciliação com o PDV fica impossível de refazer.
 */
export async function archiveTransaction(id: number, reason?: string) {
  const [current] = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  if (!current) return { error: "Lançamento não encontrado", status: 404 } satisfies FinanceError;

  if (current.automatic) {
    return {
      error:
        "Lançamento automático não pode ser excluído. Cancele o documento de origem (venda, pedido ou compra) para gerar o estorno correto.",
      status: 409,
      details: { code: "AUTOMATIC_LOCKED", origin: originOf(current) },
    } satisfies FinanceError;
  }

  if (current.archivedAt) return { ok: true as const, row: current, alreadyArchived: true };

  const [row] = await db
    .update(transactions)
    .set({
      archivedAt: new Date(),
      archiveReason: String(reason || "").trim() || "Arquivado pelo operador",
    })
    .where(eq(transactions.id, id))
    .returning();

  return { ok: true as const, row };
}

export async function restoreTransaction(id: number) {
  const [row] = await db
    .update(transactions)
    .set({ archivedAt: null, archiveReason: null })
    .where(eq(transactions.id, id))
    .returning();
  if (!row) return { error: "Lançamento não encontrado", status: 404 } satisfies FinanceError;
  return { ok: true as const, row };
}

function originOf(row: typeof transactions.$inferSelect): string | null {
  if (row.saleId) return `venda #${row.saleId}`;
  if (row.orderId) return `pedido #${row.orderId}`;
  if (row.purchaseId) return `compra #${row.purchaseId}`;
  if (row.cashSessionId) return `caixa #${row.cashSessionId}`;
  return null;
}

/* ==================================================================
 *  LANÇAMENTO AUTOMÁTICO (usado por sales / orders / stock / caixa)
 *
 *  Idempotente por (categoria + documento de origem): rodar duas
 *  vezes atualiza, não duplica.
 * ================================================================== */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AutoEntry = {
  type: "receita" | "despesa";
  category: string;
  description: string;
  amount: number;
  dueDate?: string | null;
  paidDate?: string | null;
  status?: "pendente" | "pago" | "atrasado";
  method?: string | null;
  customerId?: number | null;
  saleId?: number | null;
  orderId?: number | null;
  purchaseId?: number | null;
  cashSessionId?: number | null;
  notes?: string | null;
  /**
   * Por padrão o lançamento é idempotente pelo documento de origem
   * (receber a mesma compra duas vezes atualiza, não duplica).
   *
   * Movimentos de caixa são a exceção: várias sangrias na mesma
   * sessão são eventos distintos e cada uma vira o seu lançamento.
   */
  dedupe?: boolean;
};

function originFilter(entry: AutoEntry): SQL | undefined {
  if (entry.dedupe === false) return undefined;
  const category = normalizeCategory(entry.category);
  if (entry.saleId) {
    return and(eq(transactions.saleId, entry.saleId), eq(transactions.category, category));
  }
  if (entry.orderId) {
    return and(eq(transactions.orderId, entry.orderId), eq(transactions.category, category));
  }
  if (entry.purchaseId) {
    return and(eq(transactions.purchaseId, entry.purchaseId), eq(transactions.category, category));
  }
  if (entry.cashSessionId) {
    return and(
      eq(transactions.cashSessionId, entry.cashSessionId),
      eq(transactions.category, category)
    );
  }
  return undefined;
}

/**
 * Grava (ou atualiza) o lançamento espelho de um documento.
 * Substitui o antigo casamento por `ilike` na descrição, que casava
 * PED-2026-001 com PED-2026-0010.
 */
export async function upsertAutoTransaction(tx: Tx, entry: AutoEntry) {
  const today = todayISO();
  const category = normalizeCategory(entry.category);
  const dueDate = entry.dueDate ?? today;
  const resolved = resolveStatus(
    entry.status ?? "pendente",
    dueDate,
    entry.paidDate ?? null,
    today
  );

  const data = {
    type: entry.type,
    category,
    description: entry.description,
    amount: toDecimalString(entry.amount, 2),
    dueDate,
    paidDate: resolved.paidDate,
    status: resolved.status,
    method: entry.method ?? null,
    customerId: entry.customerId ?? null,
    saleId: entry.saleId ?? null,
    orderId: entry.orderId ?? null,
    purchaseId: entry.purchaseId ?? null,
    cashSessionId: entry.cashSessionId ?? null,
    notes: entry.notes ?? null,
    automatic: true,
  };

  const filter = originFilter(entry);
  if (filter) {
    const [existing] = await tx.select().from(transactions).where(filter).limit(1);
    if (existing) {
      /* preserva baixa já dada manualmente pelo caixa */
      const keepPaid = existing.status === "pago" && resolved.status !== "pago";
      const [row] = await tx
        .update(transactions)
        .set(
          keepPaid
            ? { ...data, status: "pago" as const, paidDate: existing.paidDate || today }
            : data
        )
        .where(eq(transactions.id, existing.id))
        .returning();
      return row;
    }
  }

  const [row] = await tx.insert(transactions).values(data).returning();
  return row;
}

/* ==================================================================
 *  CONSULTAS COM PERÍODO (agregação em SQL, não em JavaScript)
 * ================================================================== */

export type PeriodInput = { from?: string | null; to?: string | null };

export function resolvePeriod(input?: PeriodInput) {
  const fallback = monthRange();
  const from =
    input?.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from) ? input.from : fallback.from;
  const to = input?.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to) ? input.to : fallback.to;
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * O lançamento entra no período pela data que importa para o caixa:
 * pago → data de pagamento; em aberto → vencimento.
 */
const effectiveDate = sql`coalesce(${transactions.paidDate}, ${transactions.dueDate})`;

export function periodFilter(from: string, to: string): SQL {
  return and(
    isNull(transactions.archivedAt),
    gte(effectiveDate, from),
    lte(effectiveDate, to)
  ) as SQL;
}

export async function listTransactions(period: { from: string; to: string }, includeArchived = false) {
  const where = includeArchived
    ? (and(gte(effectiveDate, period.from), lte(effectiveDate, period.to)) as SQL)
    : periodFilter(period.from, period.to);

  return db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(desc(effectiveDate), desc(transactions.id));
}

export type FinanceSummary = {
  received: number;
  toReceive: number;
  overdueReceivable: number;
  expensesPaid: number;
  expensesOpen: number;
  overduePayable: number;
  balance: number;
  result: number;
  lateCount: number;
};

/** Resumo do período agregado no banco. */
export async function getFinanceSummary(period: { from: string; to: string }): Promise<FinanceSummary> {
  const [row] = await db
    .select({
      received: sql<string>`coalesce(sum(case when ${transactions.type}='receita' and ${transactions.status}='pago' then ${transactions.amount} else 0 end),0)`,
      toReceive: sql<string>`coalesce(sum(case when ${transactions.type}='receita' and ${transactions.status}<>'pago' then ${transactions.amount} else 0 end),0)`,
      overdueReceivable: sql<string>`coalesce(sum(case when ${transactions.type}='receita' and ${transactions.status}='atrasado' then ${transactions.amount} else 0 end),0)`,
      expensesPaid: sql<string>`coalesce(sum(case when ${transactions.type}='despesa' and ${transactions.status}='pago' then ${transactions.amount} else 0 end),0)`,
      expensesOpen: sql<string>`coalesce(sum(case when ${transactions.type}='despesa' and ${transactions.status}<>'pago' then ${transactions.amount} else 0 end),0)`,
      overduePayable: sql<string>`coalesce(sum(case when ${transactions.type}='despesa' and ${transactions.status}='atrasado' then ${transactions.amount} else 0 end),0)`,
      lateCount: sql<number>`count(*) filter (where ${transactions.status}='atrasado')::int`,
    })
    .from(transactions)
    .where(periodFilter(period.from, period.to));

  const received = toNumber(row?.received, 0);
  const toReceive = toNumber(row?.toReceive, 0);
  const expensesPaid = toNumber(row?.expensesPaid, 0);
  const expensesOpen = toNumber(row?.expensesOpen, 0);

  return {
    received: round2(received),
    toReceive: round2(toReceive),
    overdueReceivable: round2(toNumber(row?.overdueReceivable, 0)),
    expensesPaid: round2(expensesPaid),
    expensesOpen: round2(expensesOpen),
    overduePayable: round2(toNumber(row?.overduePayable, 0)),
    /* caixa realizado: só o que entrou e saiu de fato */
    balance: round2(received - expensesPaid),
    /* regime de competência: tudo do período, pago ou não */
    result: round2(received + toReceive - expensesPaid - expensesOpen),
    lateCount: Number(row?.lateCount || 0),
  };
}

/** DRE simplificado por categoria — alimenta os Relatórios. */
export async function getCategoryBreakdown(period: { from: string; to: string }) {
  const rows = await db
    .select({
      type: transactions.type,
      category: transactions.category,
      total: sql<string>`coalesce(sum(${transactions.amount}),0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(periodFilter(period.from, period.to))
    .groupBy(transactions.type, transactions.category)
    .orderBy(desc(sql`sum(${transactions.amount})`));

  return rows.map((r) => ({
    type: r.type as "receita" | "despesa",
    category: normalizeCategory(r.category),
    label: categoryLabel(r.category),
    total: round2(toNumber(r.total, 0)),
    count: Number(r.count || 0),
  }));
}

/** Contas a vencer nos próximos N dias (agenda financeira). */
export async function getUpcoming(days = 30) {
  const today = todayISO();
  const limit = new Date(`${today}T12:00:00`);
  limit.setDate(limit.getDate() + days);
  const to = limit.toISOString().slice(0, 10);

  return db
    .select()
    .from(transactions)
    .where(
      and(
        isNull(transactions.archivedAt),
        sql`${transactions.status} <> 'pago'`,
        gte(transactions.dueDate, today),
        lte(transactions.dueDate, to)
      )
    )
    .orderBy(asc(transactions.dueDate))
    .limit(50);
}

/**
 * Marca como "atrasado" todo lançamento vencido e não pago.
 * O enum previa esse status desde o início, mas nada o atribuía.
 */
export async function refreshOverdue() {
  const today = todayISO();
  const result = await db
    .update(transactions)
    .set({ status: "atrasado" })
    .where(
      and(
        isNull(transactions.archivedAt),
        eq(transactions.status, "pendente"),
        sql`${transactions.dueDate} is not null`,
        sql`${transactions.dueDate} < ${today}`
      )
    )
    .returning({ id: transactions.id });
  return result.length;
}
