import type { Metadata } from "next";
import { FinanceClient } from "@/components/modules/FinanceClient";
import {
  getFinanceSummary,
  getUpcoming,
  listTransactions,
  refreshOverdue,
  resolvePeriod,
} from "@/lib/finance";
import { describeRange } from "@/lib/period";

export const metadata: Metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string; archived?: string }>;

export default async function FinanceiroPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = resolvePeriod({ from: params.from, to: params.to });
  const includeArchived = params.archived === "1";

  /* status "atrasado" existia no enum mas nunca era atribuído:
     todo vencido em aberto é marcado ao abrir a tela */
  await refreshOverdue();

  const [rows, summary, upcoming] = await Promise.all([
    listTransactions(period, includeArchived),
    getFinanceSummary(period),
    getUpcoming(30),
  ]);

  return (
    <FinanceClient
      transactions={rows}
      summary={summary}
      upcoming={upcoming}
      period={period}
      periodLabel={describeRange(period.from, period.to)}
      includeArchived={includeArchived}
    />
  );
}
