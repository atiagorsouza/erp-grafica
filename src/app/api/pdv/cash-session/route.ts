import { db } from "@/db";
import { cashSessions, cashMovements, sales } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { round2, toDecimalString, toNumber, toPositive } from "@/lib/money";

export const dynamic = "force-dynamic";

type PaymentSlice = { method?: string; amount?: number | string };

/**
 * Soma o que deveria estar na gaveta:
 * abertura + (parcelas em dinheiro das vendas) + suprimentos − sangrias.
 *
 * Usa o JSON `payments` quando existe; fallback para payment_method + total
 * em vendas legadas. Não conta taxa de cartão nem PIX/débito/crédito.
 */
async function expectedInDrawer(sessionId: number, openingAmount: number) {
  const cashSales = await db
    .select({
      total: sales.total,
      paymentMethod: sales.paymentMethod,
      payments: sales.payments,
      receivedAmount: sales.receivedAmount,
      changeAmount: sales.changeAmount,
    })
    .from(sales)
    .where(and(eq(sales.cashSessionId, sessionId), eq(sales.status, "concluida")));

  let cashFromSales = 0;
  for (const sale of cashSales) {
    const slices = Array.isArray(sale.payments) ? (sale.payments as PaymentSlice[]) : [];
    if (slices.length > 0) {
      for (const p of slices) {
        if (String(p.method || "").toLowerCase().includes("dinheiro")) {
          cashFromSales += toNumber(p.amount, 0);
        }
      }
      continue;
    }

    const method = String(sale.paymentMethod || "");
    if (method.toLowerCase().includes("dinheiro")) {
      // legado: valor que entrou na gaveta = recebido − troco (ou total se não houver recebido)
      const received = sale.receivedAmount != null ? toNumber(sale.receivedAmount, 0) : null;
      const change = toNumber(sale.changeAmount, 0);
      if (received != null && received > 0) {
        cashFromSales += Math.max(0, received - change);
      } else {
        cashFromSales += toNumber(sale.total, 0);
      }
    }
  }

  const movements = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, sessionId));
  const supply = movements
    .filter((m) => m.kind === "suprimento")
    .reduce((s, m) => s + toNumber(m.amount, 0), 0);
  const withdraw = movements
    .filter((m) => m.kind === "sangria")
    .reduce((s, m) => s + toNumber(m.amount, 0), 0);

  return round2(openingAmount + cashFromSales + supply - withdraw);
}

/** GET → sessão aberta (se houver) com movimentos e esperado. */
export async function GET() {
  const [open] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.status, "aberto"), isNull(cashSessions.closedAt)))
    .limit(1);

  if (!open) return Response.json({ session: null, movements: [], expected: 0 });

  const movements = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, open.id));

  const [salesAgg] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${sales.total}), 0)`,
    })
    .from(sales)
    .where(and(eq(sales.cashSessionId, open.id), eq(sales.status, "concluida")));

  return Response.json({
    session: open,
    movements,
    expected: await expectedInDrawer(open.id, toNumber(open.openingAmount, 0)),
    salesCount: Number(salesAgg?.count || 0),
    salesTotal: toNumber(salesAgg?.total, 0),
  });
}

/**
 * POST
 *   { op: "open",  openingAmount, operator }
 *   { op: "move",  kind: "sangria"|"suprimento", amount, reason }
 *   { op: "close", countedAmount, notes }
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "");

  try {
    if (op === "open") {
      const [already] = await db
        .select()
        .from(cashSessions)
        .where(and(eq(cashSessions.status, "aberto"), isNull(cashSessions.closedAt)))
        .limit(1);
      if (already) {
        return Response.json({ error: "Já existe um caixa aberto", session: already }, { status: 409 });
      }

      const [row] = await db
        .insert(cashSessions)
        .values({
          status: "aberto",
          operator: String(body.operator || "").trim() || null,
          openingAmount: toDecimalString(toPositive(body.openingAmount), 2),
        })
        .returning();
      return Response.json({ ok: true, session: row });
    }

    const [session] = await db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.status, "aberto"), isNull(cashSessions.closedAt)))
      .limit(1);
    if (!session) return Response.json({ error: "Nenhum caixa aberto" }, { status: 409 });

    if (op === "move") {
      const kind = String(body.kind || "");
      if (kind !== "sangria" && kind !== "suprimento") {
        return Response.json({ error: "kind deve ser sangria ou suprimento" }, { status: 400 });
      }
      const amount = toPositive(body.amount);
      if (amount <= 0) {
        return Response.json({ error: "Valor deve ser maior que zero" }, { status: 400 });
      }

      if (kind === "sangria") {
        const expected = await expectedInDrawer(session.id, toNumber(session.openingAmount, 0));
        if (amount > expected + 0.001) {
          return Response.json(
            {
              error: `Sangria (${amount.toFixed(2)}) maior que o esperado em gaveta (${expected.toFixed(2)})`,
            },
            { status: 422 }
          );
        }
      }

      const [row] = await db
        .insert(cashMovements)
        .values({
          sessionId: session.id,
          kind,
          amount: toDecimalString(amount, 2),
          reason: String(body.reason || "").trim() || null,
        })
        .returning();
      return Response.json({
        ok: true,
        movement: row,
        expected: await expectedInDrawer(session.id, toNumber(session.openingAmount, 0)),
      });
    }

    if (op === "close") {
      if (body.countedAmount === undefined || body.countedAmount === null || body.countedAmount === "") {
        return Response.json({ error: "Informe o valor contado na gaveta" }, { status: 400 });
      }
      const counted = toPositive(body.countedAmount);
      const expected = await expectedInDrawer(session.id, toNumber(session.openingAmount, 0));
      const [row] = await db
        .update(cashSessions)
        .set({
          status: "fechado",
          countedAmount: toDecimalString(counted, 2),
          expectedAmount: toDecimalString(expected, 2),
          differenceAmount: toDecimalString(round2(counted - expected), 2),
          notes: String(body.notes || "").trim() || null,
          closedAt: new Date(),
        })
        .where(eq(cashSessions.id, session.id))
        .returning();
      return Response.json({
        ok: true,
        session: row,
        expected,
        counted,
        difference: round2(counted - expected),
      });
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[cash-session]", e);
    return Response.json({ error: e instanceof Error ? e.message : "erro interno" }, { status: 500 });
  }
}
