import type { Metadata } from "next";
import { ReportsClient } from "@/components/modules/ReportsClient";
import { getReportData } from "@/lib/reports";
import { resolvePeriod, refreshOverdue } from "@/lib/finance";
import { describeRange } from "@/lib/period";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ from?: string; to?: string }>;

export default async function RelatoriosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = resolvePeriod({ from: params.from, to: params.to });

  await refreshOverdue();
  const data = await getReportData(period);

  return (
    <ReportsClient
      {...data}
      period={period}
      periodLabel={describeRange(period.from, period.to)}
    />
  );
}
