import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { commemorativeDateAudit, commemorativeDates } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export type CalendarError = { error: string; status: number; details?: unknown };

export const CALENDAR_TYPES = ["feriado_nacional", "data_comercial", "data_comemorativa", "interno"] as const;
export const CALENDAR_RELEVANCES = ["alta", "media", "baixa"] as const;

const calendarSchema = z.object({
  title: z.string().trim().min(2, "Título obrigatório").max(180),
  month: z.coerce.number().int().min(1).max(12),
  day: z.coerce.number().int().min(1).max(31),
  type: z.enum(CALENDAR_TYPES).default("data_comemorativa"),
  relevance: z.enum(CALENDAR_RELEVANCES).default("media"),
  icon: z.string().trim().max(8).optional().default("📅"),
  actionHint: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(1500).nullable().optional(),
  active: z.boolean().optional().default(true),
  recurring: z.boolean().optional().default(true),
  date: z.string().trim().nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(2, "Título obrigatório").max(180).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  day: z.coerce.number().int().min(1).max(31).optional(),
  type: z.enum(CALENDAR_TYPES).optional(),
  relevance: z.enum(CALENDAR_RELEVANCES).optional(),
  icon: z.string().trim().max(8).optional(),
  actionHint: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(1500).nullable().optional(),
  active: z.boolean().optional(),
  recurring: z.boolean().optional(),
  date: z.string().trim().nullable().optional(),
});

type CalendarPayload = z.infer<typeof calendarSchema>;

type CalendarPatch = z.infer<typeof patchSchema>;

function parse<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | CalendarError {
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

function isValidMonthDay(month: number, day: number) {
  // 2000 é bissexto para permitir 29/02 recorrente.
  const dt = new Date(Date.UTC(2000, month - 1, day));
  return dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function monthDay(month: number, day: number) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function canonicalDate(month: number, day: number, date?: string | null, recurring = true) {
  if (!recurring && date) return date.slice(0, 10);
  return `2000-${monthDay(month, day)}`;
}

function normalizeCreate(data: CalendarPayload) {
  return {
    title: data.title.trim(),
    date: canonicalDate(data.month, data.day, data.date, data.recurring),
    month: data.month,
    day: data.day,
    monthDay: monthDay(data.month, data.day),
    type: data.type,
    relevance: data.relevance,
    icon: data.icon || "📅",
    actionHint: nullable(data.actionHint),
    category: nullable(data.category) || "comercial",
    description: nullable(data.description),
    active: data.active,
    recurring: data.recurring,
    updatedAt: new Date(),
  };
}

function normalizePatch(data: CalendarPatch, current: typeof commemorativeDates.$inferSelect) {
  const month = data.month ?? current.month;
  const day = data.day ?? current.day;
  const recurring = data.recurring ?? current.recurring ?? true;
  const patch: Partial<typeof commemorativeDates.$inferInsert> = { updatedAt: new Date() };

  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.month !== undefined) patch.month = month;
  if (data.day !== undefined) patch.day = day;
  if (data.month !== undefined || data.day !== undefined) patch.monthDay = monthDay(month, day);
  if (data.month !== undefined || data.day !== undefined || data.date !== undefined || data.recurring !== undefined) {
    patch.date = canonicalDate(month, day, data.date ?? current.date, recurring);
  }
  if (data.type !== undefined) patch.type = data.type;
  if (data.relevance !== undefined) patch.relevance = data.relevance;
  if (data.icon !== undefined) patch.icon = data.icon || "📅";
  if (data.actionHint !== undefined) patch.actionHint = nullable(data.actionHint);
  if (data.category !== undefined) patch.category = nullable(data.category) || "comercial";
  if (data.description !== undefined) patch.description = nullable(data.description);
  if (data.active !== undefined) patch.active = data.active;
  if (data.recurring !== undefined) patch.recurring = data.recurring;

  return patch;
}

async function audit(dateId: number, action: string, details: string, field?: string, oldValue?: unknown, newValue?: unknown) {
  await db.insert(commemorativeDateAudit).values({
    dateId,
    action,
    field: field || null,
    oldValue: oldValue == null ? null : String(oldValue),
    newValue: newValue == null ? null : String(newValue),
    performedBy: "system",
    details,
  });
}

async function validateDuplicate(title: string, month: number, day: number, ignoreId?: number) {
  const rows = await db
    .select({ id: commemorativeDates.id })
    .from(commemorativeDates)
    .where(
      and(
        eq(commemorativeDates.month, month),
        eq(commemorativeDates.day, day),
        eq(commemorativeDates.title, title.trim())
      )
    )
    .limit(1);
  const dupe = rows[0];
  if (dupe && dupe.id !== ignoreId) {
    return { error: "Já existe uma data com este título no mesmo dia/mês", status: 409 } satisfies CalendarError;
  }
  return null;
}

export async function listCalendarAudit(dateId: number) {
  const rows = await db
    .select()
    .from(commemorativeDateAudit)
    .where(eq(commemorativeDateAudit.dateId, dateId))
    .orderBy(asc(commemorativeDateAudit.createdAt));
  return { ok: true as const, rows };
}

export async function createCalendarDate(raw: unknown) {
  const parsed = parse(calendarSchema, raw);
  if ("error" in parsed) return parsed;
  const data = parsed.data;
  if (!isValidMonthDay(data.month, data.day)) return { error: "Data inválida para o mês informado", status: 422 } satisfies CalendarError;
  const dupe = await validateDuplicate(data.title, data.month, data.day);
  if (dupe) return dupe;

  const [row] = await db.insert(commemorativeDates).values(normalizeCreate(data)).returning();
  await audit(row.id, "create", `Data criada: ${row.title}`);
  return { ok: true as const, row };
}

export async function updateCalendarDate(id: number, raw: unknown) {
  const [current] = await db.select().from(commemorativeDates).where(eq(commemorativeDates.id, id)).limit(1);
  if (!current) return { error: "Data não encontrada", status: 404 } satisfies CalendarError;

  const parsed = parse(patchSchema, raw);
  if ("error" in parsed) return parsed;
  const data = parsed.data;
  const month = data.month ?? current.month;
  const day = data.day ?? current.day;
  const title = data.title ?? current.title;
  if (!isValidMonthDay(month, day)) return { error: "Data inválida para o mês informado", status: 422 } satisfies CalendarError;
  const dupe = await validateDuplicate(title, month, day, id);
  if (dupe) return dupe;

  const patch = normalizePatch(data, current);
  const [row] = await db.update(commemorativeDates).set(patch).where(eq(commemorativeDates.id, id)).returning();

  for (const [key, newValue] of Object.entries(patch)) {
    if (key === "updatedAt") continue;
    const oldValue = (current as Record<string, unknown>)[key];
    if (String(oldValue ?? "") !== String(newValue ?? "")) {
      await audit(id, "update", `Campo ${key} alterado`, key, oldValue, newValue);
    }
  }

  return { ok: true as const, row };
}

export async function deactivateCalendarDate(id: number, reason = "Desativada pelo calendário") {
  const [current] = await db.select().from(commemorativeDates).where(eq(commemorativeDates.id, id)).limit(1);
  if (!current) return { error: "Data não encontrada", status: 404 } satisfies CalendarError;
  const [row] = await db
    .update(commemorativeDates)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(commemorativeDates.id, id))
    .returning();
  await audit(id, "deactivate", reason, "active", current.active, false);
  return { ok: true as const, row };
}

/* 29 de fevereiro em ano não bissexto (v3.55.0).

   `isValidMonthDay` usa o ano 2000 (bissexto) para PERMITIR cadastrar
   29/02 como data recorrente — o que está certo. Mas o JavaScript
   estoura silenciosamente: `new Date(2027, 1, 29)` devolve 1º de
   março, sem erro.

   Resultado: a data comemorativa aparecia um dia depois em três de
   cada quatro anos, e ninguém desconfiaria — só notaria que o aviso
   chegou "estranho". Em ano não bissexto o correto é 28/02: é o
   último dia de fevereiro, que é o que a data significa. */
function diaSeguroNoAno(ano: number, mes: number, dia: number): Date {
  const d = new Date(ano, mes - 1, dia);
  /* Se o mês mudou, o dia não existe naquele ano: recua para o
     último dia do mês pretendido. O dia 0 do mês seguinte é
     exatamente isso. */
  if (d.getMonth() !== mes - 1) return new Date(ano, mes, 0);
  return d;
}

export function daysUntil(month: number, day: number, now = new Date()) {
  const y = now.getFullYear();
  const today = new Date(y, now.getMonth(), now.getDate());
  let target = diaSeguroNoAno(y, month, day);
  if (target < today) target = diaSeguroNoAno(y + 1, month, day);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}
