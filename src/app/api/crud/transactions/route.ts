import {
  archiveTransaction,
  createTransaction,
  getFinanceSummary,
  listTransactions,
  reopenTransaction,
  resolvePeriod,
  restoreTransaction,
  settleTransaction,
  updateTransaction,
} from "@/lib/finance";

export const dynamic = "force-dynamic";

/**
 * GET /api/crud/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   → lançamentos do período + resumo agregado no banco
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const period = resolvePeriod({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const includeArchived = url.searchParams.get("archived") === "1";
    const [rows, summary] = await Promise.all([
      listTransactions(period, includeArchived),
      getFinanceSummary(period),
    ]);
    return Response.json({ ok: true, period, summary, rows });
  } catch (e) {
    console.error("[transactions:GET]", e);
    return Response.json({ error: "Não foi possível carregar o financeiro" }, { status: 500 });
  }
}

/**
 * POST /api/crud/transactions
 *   { op: "create",  data }
 *   { op: "update",  id, data }
 *   { op: "settle",  id, paidDate? }   baixa
 *   { op: "reopen",  id }              estorna a baixa
 *   { op: "delete",  id, reason? }     arquiva (não destrói)
 *   { op: "restore", id }
 *
 * Toda a regra vive em `@/lib/finance` (Zod, valores em padrão BR,
 * coerência status × datas, proteção de lançamento automático).
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "");
  const id = Number(body.id);
  const needsId = ["update", "settle", "reopen", "delete", "restore"];
  if (needsId.includes(op) && !Number.isFinite(id)) {
    return Response.json({ error: "id obrigatório" }, { status: 400 });
  }

  try {
    let result:
      | { ok: true; row?: unknown }
      | { error: string; status: number; details?: unknown };

    switch (op) {
      case "create":
        result = await createTransaction(body.data ?? {});
        break;
      case "update":
        result = await updateTransaction(id, body.data ?? {});
        break;
      case "settle":
        result = await settleTransaction(id, body.paidDate as string | null | undefined);
        break;
      case "reopen":
        result = await reopenTransaction(id);
        break;
      case "delete":
        result = await archiveTransaction(id, body.reason as string | undefined);
        break;
      case "restore":
        result = await restoreTransaction(id);
        break;
      default:
        return Response.json({ error: "op inválido" }, { status: 400 });
    }

    if ("error" in result) {
      return Response.json(
        { error: result.error, details: result.details },
        { status: result.status }
      );
    }
    return Response.json(result);
  } catch (e) {
    /* Nunca devolver a query ao navegador: o handler antigo vazava o
       SQL inteiro com nomes de colunas na mensagem de erro. */
    console.error("[transactions:POST]", e);
    return Response.json(
      { error: "Não foi possível salvar o lançamento. Tente novamente." },
      { status: 500 }
    );
  }
}
