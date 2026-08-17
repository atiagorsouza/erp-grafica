"use client";

import { BarChart, Donut, HBars } from "@/components/charts";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";

type Props = {
  months: { key: string; label: string; value: number }[];
  payments: { label: string; value: number }[];
  topCustomers: { label: string; value: number }[];
  margins: { label: string; value: number; sub?: string }[];
  funnel: { label: string; value: number }[];
  totals: {
    salesCount: number;
    ordersCount: number;
    quotesCount: number;
    avgTicket: number;
    revenue: number;
    conversion: number;
  };
};

const PAY_COLORS: Record<string, string> = {
  PIX: "var(--color-proc-c)",
  Dinheiro: "#10b981",
  "Débito": "var(--color-proc-y)",
  "Crédito": "var(--color-proc-m)",
};

const FUNNEL_COLORS: Record<string, "neutral" | "blue" | "green" | "red" | "amber"> = {
  rascunho: "neutral",
  enviado: "blue",
  aprovado: "green",
  recusado: "red",
  expirado: "amber",
};

export function ReportsClient({ months, payments, topCustomers, margins, funnel, totals }: Props) {
  const marginColors = (v: number) => (v >= 45 ? "#10b981" : v >= 30 ? "var(--color-proc-c)" : v >= 20 ? "#d97706" : "#dc2626");

  return (
    <div>
      <PageHeader
        eyebrow="Inteligência do negócio"
        title="Relatórios"
        icon="chart"
        description="Faturamento por mês, mix de pagamento, clientes que mais compram e a margem real de cada produto calculada pelo motor."
      />

      {/* faixa de números */}
      <div className="reveal mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { k: "Receita total", v: formatMoney(totals.revenue) },
          { k: "Ticket médio PDV", v: formatMoney(totals.avgTicket) },
          { k: "Vendas PDV", v: String(totals.salesCount) },
          { k: "Pedidos/OS", v: String(totals.ordersCount) },
          { k: "Orçamentos", v: String(totals.quotesCount) },
          { k: "Conversão", v: `${totals.conversion}%` },
        ].map((x) => (
          <div key={x.k} className="rounded-xl border border-paper-200 bg-paper-50 px-4 py-3.5 shadow-card">
            <p className="font-mono text-[9.5px] font-semibold tracking-[0.14em] text-ink-400 uppercase">{x.k}</p>
            <p className="mt-1.5 font-mono text-[18px] leading-none font-semibold text-ink-900 tnum">{x.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="reveal reveal-1">
          <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Faturamento por mês</h3>
          <p className="mb-4 text-[11.5px] text-ink-500">PDV + pedidos · últimos 6 meses</p>
          <BarChart data={months.map((m) => ({ label: m.label, value: m.value, hint: formatMoney(m.value) }))} height={200} formatValue={(v) => formatMoney(v)} />
        </Card>

        <Card className="reveal reveal-2">
          <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Mix de pagamento</h3>
          <p className="mb-4 text-[11.5px] text-ink-500">Participação de cada forma no caixa</p>
          {payments.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-400">Sem vendas registradas ainda.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <Donut
                data={payments.map((p) => ({ label: p.label, value: p.value, color: PAY_COLORS[p.label] ?? "#64748b" }))}
                centerValue={formatMoney(payments.reduce((s, p) => s + p.value, 0))}
                centerLabel="no caixa"
              />
              <div className="min-w-[160px] flex-1 space-y-2.5">
                {payments.map((p) => (
                  <div key={p.label} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: PAY_COLORS[p.label] ?? "#64748b" }} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-700">{p.label}</span>
                    <span className="font-mono text-[12px] font-semibold text-ink-900 tnum">{formatMoney(p.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="reveal reveal-2">
          <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Top clientes</h3>
          <p className="mb-4 text-[11.5px] text-ink-500">Quem mais gera receita</p>
          {topCustomers.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-400">Vincule vendas e pedidos a clientes para ver o ranking.</p>
          ) : (
            <HBars data={topCustomers.map((c, i) => ({ ...c, color: i === 0 ? "var(--color-proc-m)" : "var(--color-proc-c)" }))} format={(v) => formatMoney(v)} />
          )}
        </Card>

        <Card className="reveal reveal-3">
          <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Margem por produto</h3>
          <p className="mb-4 text-[11.5px] text-ink-500">% do preço final que sobra depois do custo direto</p>
          {margins.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-400">Cadastre produtos com o motor para medir margem.</p>
          ) : (
            <HBars data={margins.map((m) => ({ ...m, color: marginColors(m.value) }))} format={(v) => `${v.toFixed(0)}%`} />
          )}
        </Card>
      </div>

      {/* funil */}
      <Card className="reveal reveal-4 mt-4">
        <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Funil de orçamentos</h3>
        <p className="mb-4 text-[11.5px] text-ink-500">Onde as propostas param — conversão atual de {totals.conversion}%</p>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          {funnel.map((f, i) => {
            const max = Math.max(...funnel.map((x) => x.value), 1);
            return (
              <div key={f.label} className="relative overflow-hidden rounded-lg border border-paper-200 bg-white px-4 py-3.5">
                <div className="absolute bottom-0 left-0 h-1 bg-ink-900/70 transition-all duration-700" style={{ width: `${(f.value / max) * 100}%` }} />
                <p className="font-mono text-[22px] leading-none font-semibold text-ink-900 tnum">{f.value}</p>
                <div className="mt-1.5"><Badge tone={FUNNEL_COLORS[f.label] ?? "neutral"}>{f.label}</Badge></div>
                {i === 1 && <p className="mt-1 font-mono text-[9px] text-ink-400 uppercase">envie mais rápido ↗</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
