import { db } from "@/db";
import { cashSessions, cashMovements, sales } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { round2, toDecimalString, toNumber, toPositive } from "@/lib/money";
import { upsertAutoTransaction } from "@/lib/finance";
import { todayISO } from "@/lib/period";

export const dynamic = "force-dynamic";

type PaymentSlice = { method?: string; amount?: number | string };

/**
 * Soma o que deveria estar na gaveta:
 * abertura + (parcelas em dinheiro das vendas) + suprimentos − sangrias.
 *
 * Usa o JSON `payments` quando existe; fallback para payment_method + total
 * em vendas legadas. Não conta taxa de cartão nem PIX/débito/crédito.
 */
type Executor = typeof db;

/**
 * Saldo esperado na gaveta.
 *
 * Aceita `db` (leitura avulsa) ou a `tx` de uma transação. Na sangria
 * PRECISA receber a tx: calcular fora da transação permitia que cinco
 * pedidos simultâneos lessem o mesmo saldo e todos passassem — um caixa
 * com R$ 100 chegou a liberar R$ 160 em sangrias, deixando a gaveta em
 * -59,99 e R$ 160 de despesa falsa no Financeiro.
 */
async function expectedInDrawer(
  sessionId: number,
  openingAmount: number,
  exec: Executor = db
) {
  const cashSales = await exec
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

  const movements = await exec
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

      try {
        const [row] = await db
          .insert(cashSessions)
          .values({
            status: "aberto",
            operator: String(body.operator || "").trim() || null,
            openingAmount: toDecimalString(toPositive(body.openingAmount), 2),
          })
          .returning();
        return Response.json({ ok: true, session: row });
      } catch (e) {
        /* Índice único parcial `cash_sessions_one_open_idx`: duas
           requisições simultâneas de abertura chegaram juntas e o
           banco barrou a segunda. Devolve a sessão que venceu. */
        const detail = `${String(e)} ${String((e as { cause?: unknown })?.cause ?? "")}`;
        if (detail.includes("cash_sessions_one_open_idx") || detail.includes("duplicate key")) {
          const [existing] = await db
            .select()
            .from(cashSessions)
            .where(and(eq(cashSessions.status, "aberto"), isNull(cashSessions.closedAt)))
            .limit(1);
          return Response.json(
            { error: "Já existe um caixa aberto", session: existing || null },
            { status: 409 }
          );
        }
        throw e;
      }
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

      const reason = String(body.reason || "").trim() || null;

      /* A conferência do saldo acontece DENTRO da transação, sobre a
         sessão travada com FOR UPDATE. Fora dela, sangrias concorrentes
         liam o mesmo saldo e todas passavam. */
      let saldoInsuficiente: { pedido: number; disponivel: number } | null = null;

      const row = await db.transaction(async (tx) => {
        await tx
          .select({ id: cashSessions.id })
          .from(cashSessions)
          .where(eq(cashSessions.id, session.id))
          .limit(1)
          .for("update");

        if (kind === "sangria") {
          const expected = await expectedInDrawer(
            session.id,
            toNumber(session.openingAmount, 0),
            tx as unknown as Executor
          );
          if (amount > expected + 0.001) {
            saldoInsuficiente = { pedido: amount, disponivel: expected };
            return null;
          }
        }

        const [movement] = await tx
          .insert(cashMovements)
          .values({
            sessionId: session.id,
            kind,
            amount: toDecimalString(amount, 2),
            reason,
          })
          .returning();

        /* ----------------------------------------------------------
         * v3.11.0 — o caixa físico agora conversa com o Financeiro.
         * Sangria é saída de dinheiro da gaveta; suprimento é aporte.
         * Antes nada disso existia para o módulo Financeiro.
         * --------------------------------------------------------- */
        const today = todayISO();
        await upsertAutoTransaction(tx, {
          type: kind === "sangria" ? "despesa" : "receita",
          category: kind,
          description:
            kind === "sangria"
              ? `Sangria de caixa #${session.id}${reason ? ` — ${reason}` : ""}`
              : `Suprimento de caixa #${session.id}${reason ? ` — ${reason}` : ""}`,
          amount,
          dueDate: today,
          paidDate: today,
          status: "pago",
          method: "Dinheiro",
          cashSessionId: session.id,
          notes: `Movimento de caixa #${movement.id}.`,
          dedupe: false,
        });

        return movement;
      });

      if (saldoInsuficiente) {
        const { pedido, disponivel } = saldoInsuficiente as { pedido: number; disponivel: number };
        return Response.json(
          {
            error: `Sangria (${pedido.toFixed(2)}) maior que o esperado em gaveta (${disponivel.toFixed(2)})`,
          },
          { status: 422 }
        );
      }

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
      /* `toPositive` transformaria -500 em 0 silenciosamente: o caixa
         fecharia com quebra inventada e ninguém saberia que foi erro de
         digitação. Melhor recusar e deixar o operador corrigir. */
      const countedRaw = Number(String(body.countedAmount).replace(",", "."));
      if (!Number.isFinite(countedRaw) || countedRaw < 0) {
        return Response.json(
          { error: "Valor contado inválido — informe um número igual ou maior que zero" },
          { status: 422 }
        );
      }
      const counted = toPositive(countedRaw);
      const expected = await expectedInDrawer(session.id, toNumber(session.openingAmount, 0));
      const difference = round2(counted - expected);

      const row = await db.transaction(async (tx) => {
        const [closed] = await tx
          .update(cashSessions)
          .set({
            status: "fechado",
            countedAmount: toDecimalString(counted, 2),
            expectedAmount: toDecimalString(expected, 2),
            differenceAmount: toDecimalString(difference, 2),
            notes: String(body.notes || "").trim() || null,
            closedAt: new Date(),
          })
          .where(eq(cashSessions.id, session.id))
          .returning();

        /* ----------------------------------------------------------
         * v3.11.0 — quebra/sobra do fechamento cego vira lançamento.
         * Antes a diferença era só registrada na sessão e o dinheiro
         * que faltava (ou sobrava) nunca aparecia no resultado.
         * --------------------------------------------------------- */
        if (Math.abs(difference) >= 0.01) {
          const today = todayISO();
          const isShortage = difference < 0;
          await upsertAutoTransaction(tx, {
            type: isShortage ? "despesa" : "receita",
            category: isShortage ? "quebra_caixa" : "sobra_caixa",
            description: `${isShortage ? "Quebra" : "Sobra"} de caixa · fechamento #${session.id}`,
            amount: Math.abs(difference),
            dueDate: today,
            paidDate: today,
            status: "pago",
            method: "Dinheiro",
            cashSessionId: session.id,
            notes: `Esperado ${expected.toFixed(2)} · contado ${counted.toFixed(2)}.`,
          });
        }

        return closed;
      });
      return Response.json({ ok: true, session: row, expected, counted, difference });
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    /* Nunca devolver a query ao navegador. */
    console.error("[cash-session]", e);
    const detail = `${String(e)} ${String((e as { cause?: unknown })?.cause ?? "")}`;
    if (detail.includes("cash_sessions_one_open_idx") || detail.includes("duplicate key")) {
      return Response.json({ error: "Já existe um caixa aberto" }, { status: 409 });
    }
    return Response.json(
      { error: "Não foi possível concluir a operação de caixa. Tente novamente." },
      { status: 500 }
    );
  }
}
