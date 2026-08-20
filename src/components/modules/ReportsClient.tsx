"use client";

import { BarChart, Donut, HBars } from "@/components/charts";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/format";
import { PeriodPicker } from "@/components/modules/PeriodPicker";

type Totals = {
  salesCount: number;
  salesTotal: number;
  ordersCount: number;
  ordersTotal: number;
  quotesCount: number;
  approvedQuotes: number;
  avgTicket: number;
  revenue: number;
  conversion: number;
  canceledCount: number;
  canceledTotal: number;
};

type DreLine = { type: "receita" | "despesa"; category: string; label: string; total: number; count: number };

type Dre = {
  summary: {
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
  revenues: DreLine[];
  expenses: DreLine[];
  grossRevenue: number;
  totalExpenses: number;
  result: number;
  cashResult: number;
  margin: number;
};

type Props = {
  months: { key: string; label: string; value: number; pdv: number; orders: number }[];
  payments: { label: string; value: number }[];
  topCustomers: { label: string; value: number }[];
  margins: { label: string; value: number; sub?: string; negative?: boolean }[];
  funnel: { label: string; value: number }[];
  totals: Totals;
  dre: Dre;
  period: { from: string; to: string };
  periodLabel: string;
};

const PAY_COLORS: Record<string, string> = {
  PIX: "var(--color-proc-c)",
  Dinheiro: "#10b981",
  "Débito": "var(--color-proc-y)",
  "Crédito": "var(--color-proc-m)",
  Boleto: "#8b5cf6",
  "Transferência": "#0ea5e9",
};

const FUNNEL_COLORS: Record<string, "neutral" | "blue" | "green" | "red" | "amber"> = {
  rascunho: "neutral",
  enviado: "blue",
  aprovado: "green",
  recusado: "red",
  expirado: "amber",
};

export function ReportsClient({
  months,
  payments,
  topCustomers,
  margins,
  funnel,
  totals,
  dre,
  period,
  periodLabel,
}: Props) {
  const marginColors = (v: number) =>
    v < 0 ? "#dc2626" : v >= 45 ? "#10b981" : v >= 30 ? "var(--color-proc-c)" : v >= 20 ? "#d97706" : "#dc2626";

  /** Exportação CSV com BOM, para o Excel abrir com acento correto. */
  function exportCsv() {
    const rows: string[][] = [
      ["VTDIGITAL — Relatório", periodLabel],
      [],
      ["Indicador", "Valor"],
      ["Receita total (PDV + Pedidos)", totals.revenue.toFixed(2)],
      ["Vendas PDV (qtd)", String(totals.salesCount)],
      ["Vendas PDV (R$)", totals.salesTotal.toFixed(2)],
      ["Pedidos/OS (qtd)", String(totals.ordersCount)],
      ["Pedidos/OS (R$)", totals.ordersTotal.toFixed(2)],
      ["Ticket médio PDV", totals.avgTicket.toFixed(2)],
      ["Orçamentos", String(totals.quotesCount)],
      ["Conversão (%)", String(totals.conversion)],
      ["Vendas canceladas (qtd)", String(totals.canceledCount)],
      ["Vendas canceladas (R$)", totals.canceledTotal.toFixed(2)],
      [],
      ["Resultado do período", "Valor"],
      ["Receita bruta", dre.grossRevenue.toFixed(2)],
      ["Recebido", dre.summary.received.toFixed(2)],
      ["A receber", dre.summary.toReceive.toFixed(2)],
      ["Despesas totais", dre.totalExpenses.toFixed(2)],
      ["Despesas pagas", dre.summary.expensesPaid.toFixed(2)],
      ["Despesas em aberto", dre.summary.expensesOpen.toFixed(2)],
      ["Resultado (competência)", dre.result.toFixed(2)],
      ["Saldo em caixa (realizado)", dre.cashResult.toFixed(2)],
      ["Margem (%)", dre.margin.toFixed(2)],
      [],
      ["Receitas por categoria", "Valor", "Lançamentos"],
      ...dre.revenues.map((r) => [r.label, r.total.toFixed(2), String(r.count)]),
      [],
      ["Despesas por categoria", "Valor", "Lançamentos"],
      ...dre.expenses.map((r) => [r.label, r.total.toFixed(2), String(r.count)]),
      [],
      ["Faturamento por mês", "PDV", "Pedidos", "Total"],
      ...months.map((m) => [m.key, m.pdv.toFixed(2), m.orders.toFixed(2), m.value.toFixed(2)]),
      [],
      ["Mix de pagamento", "Valor"],
      ...payments.map((p) => [p.label, p.value.toFixed(2)]),
      [],
      ["Top clientes", "Valor"],
      ...topCustomers.map((c) => [c.label, c.value.toFixed(2)]),
    ];

    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `printflow-relatorio-${period.from}_a_${period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const resultPositive = dre.result >= 0;

  return (
    <div>
      <PageHeader
        eyebrow="Inteligência do negócio"
        title="Relatórios"
        icon="chart"
        description="Faturamento, resultado do período, mix de pagamento, clientes que mais compram e a margem real de cada produto."
        actions={
          <>
            <Button variant="ghost" icon="download" onClick={exportCsv}>CSV</Button>
            <Button variant="ghost" icon="printer" onClick={() => window.print()}>Imprimir</Button>
          </>
        }
      />

      <PeriodPicker period={period} label={periodLabel} />

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

      {totals.canceledCount > 0 && (
        <p className="reveal mb-4 flex items-center gap-2 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 font-mono text-[10.5px] text-ink-500">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          {totals.canceledCount} venda(s) cancelada(s) somando {formatMoney(totals.canceledTotal)} — excluídas de
          todos os números acima.
        </p>
      )}

      {/* ---------- RESULTADO DO PERÍODO (DRE) ---------- */}
      <Card className="reveal mb-4">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="display-expanded text-[15px] font-bold text-ink-900">Resultado do período</h3>
            <p className="text-[11.5px] text-ink-500">
              Receitas menos despesas lançadas no Financeiro · {periodLabel}
            </p>
          </div>
          <div className="text-right">
            <p
              className={cn(
                "font-mono text-[24px] leading-none font-semibold tnum",
                resultPositive ? "text-emerald-700" : "text-red-600"
              )}
            >
              {formatMoney(dre.result)}
            </p>
            <p className="mt-1 font-mono text-[10px] text-ink-400 uppercase">
              margem {dre.margin.toFixed(1)}% · caixa {formatMoney(dre.cashResult)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-[10px] font-semibold tracking-[0.14em] text-emerald-700 uppercase">
              Receitas · {formatMoney(dre.grossRevenue)}
            </p>
            {dre.revenues.length === 0 ? (
              <p className="py-4 text-[12px] text-ink-400">Nenhuma receita no período.</p>
            ) : (
              <HBars
                data={dre.revenues.map((r) => ({
                  label: r.label,
                  value: r.total,
                  sub: `${r.count} lançamento(s)`,
                  color: "#10b981",
                }))}
                format={(v) => formatMoney(v)}
              />
            )}
          </div>
          <div>
            <p className="mb-2 font-mono text-[10px] font-semibold tracking-[0.14em] text-proc-m uppercase">
              Despesas · {formatMoney(dre.totalExpenses)}
            </p>
            {dre.expenses.length === 0 ? (
              <p className="py-4 text-[12px] text-ink-400">Nenhuma despesa no período.</p>
            ) : (
              <HBars
                data={dre.expenses.map((r) => ({
                  label: r.label,
                  value: r.total,
                  sub: `${r.count} lançamento(s)`,
                  color: "var(--color-proc-m)",
                }))}
                format={(v) => formatMoney(v)}
              />
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-paper-200 pt-3 md:grid-cols-4">
          {[
            { k: "Recebido", v: dre.summary.received, tone: "text-emerald-700" },
            { k: "A receber", v: dre.summary.toReceive, tone: "text-yellow-700" },
            { k: "Despesas pagas", v: dre.summary.expensesPaid, tone: "text-proc-m" },
            { k: "Despesas em aberto", v: dre.summary.expensesOpen, tone: "text-ink-600" },
          ].map((x) => (
            <div key={x.k}>
              <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">{x.k}</p>
              <p className={cn("mt-1 font-mono text-[14px] font-semibold tnum", x.tone)}>{formatMoney(x.v)}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="reveal reveal-1">
          <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Faturamento por mês</h3>
          <p className="mb-4 text-[11.5px] text-ink-500">PDV + pedidos · últimos 6 meses · sem cancelados</p>
          <BarChart
            data={months.map((m) => ({
              label: m.label,
              value: m.value,
              hint: `${formatMoney(m.value)} · PDV ${formatMoney(m.pdv)} + OS ${formatMoney(m.orders)}`,
            }))}
            height={200}
            formatValue={(v) => formatMoney(v)}
          />
        </Card>

        <Card className="reveal reveal-2">
          <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Mix de pagamento</h3>
          <p className="mb-4 text-[11.5px] text-ink-500">Cada forma pelo valor real, inclusive em pagamento dividido</p>
          {payments.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-400">Sem vendas no período.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <Donut
                data={payments.map((p) => ({
                  label: p.label,
                  value: p.value,
                  color: PAY_COLORS[p.label] ?? "#64748b",
                }))}
                centerValue={formatMoney(payments.reduce((s, p) => s + p.value, 0))}
                centerLabel="no caixa"
              />
              <div className="min-w-[160px] flex-1 space-y-2.5">
                {payments.map((p) => (
                  <div key={p.label} className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                      style={{ background: PAY_COLORS[p.label] ?? "#64748b" }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-700">{p.label}</span>
                    <span className="font-mono text-[12px] font-semibold text-ink-900 tnum">
                      {formatMoney(p.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="reveal reveal-2">
          <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Top clientes</h3>
          <p className="mb-4 text-[11.5px] text-ink-500">Quem mais gera receita no período</p>
          {topCustomers.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-400">
              Vincule vendas e pedidos a clientes para ver o ranking.
            </p>
          ) : (
            <HBars
              data={topCustomers.map((c, i) => ({
                ...c,
                color: i === 0 ? "var(--color-proc-m)" : "var(--color-proc-c)",
              }))}
              format={(v) => formatMoney(v)}
            />
          )}
        </Card>

        <Card className="reveal reveal-3">
          <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Margem por produto</h3>
          <p className="mb-4 text-[11.5px] text-ink-500">% do preço final que sobra depois do custo direto</p>
          {margins.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-ink-400">Cadastre produtos com o motor para medir margem.</p>
          ) : (
            <HBars
              data={margins.map((m) => ({ ...m, color: marginColors(m.value) }))}
              format={(v) => `${v.toFixed(0)}%`}
            />
          )}
          {margins.some((m) => m.negative) && (
            <p className="mt-3 font-mono text-[10px] text-red-600 uppercase">
              ⚠ produto(s) com custo acima do preço de venda
            </p>
          )}
        </Card>
      </div>

      {/* funil */}
      <Card className="reveal reveal-4 mt-4">
        <h3 className="display-expanded mb-1 text-[15px] font-bold text-ink-900">Funil de orçamentos</h3>
        <p className="mb-4 text-[11.5px] text-ink-500">
          Onde as propostas param — conversão atual de {totals.conversion}%
        </p>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          {funnel.map((f, i) => {
            const max = Math.max(...funnel.map((x) => x.value), 1);
            return (
              <div key={f.label} className="relative overflow-hidden rounded-lg border border-paper-200 bg-white px-4 py-3.5">
                <div
                  className="absolute bottom-0 left-0 h-1 bg-ink-900/70 transition-all duration-700"
                  style={{ width: `${Math.max(0, (f.value / max) * 100)}%` }}
                />
                <p className="font-mono text-[22px] leading-none font-semibold text-ink-900 tnum">{f.value}</p>
                <div className="mt-1.5">
                  <Badge tone={FUNNEL_COLORS[f.label] ?? "neutral"}>{f.label}</Badge>
                </div>
                {i === 1 && <p className="mt-1 font-mono text-[9px] text-ink-400 uppercase">envie mais rápido ↗</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
