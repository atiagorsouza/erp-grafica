"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { BarChart, Donut, Sparkline } from "@/components/charts";
import { Badge, Card, StatusBadge } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/format";

type Props = {
  kpis: {
    revenue14: number;
    todayRevenue: number;
    avgTicket: number;
    totalSales: number;
    pendingReceivable: number;
    customers: number;
    activeCustomers: number;
    products: number;
    openQuotes: number;
    conversion: number;
    inProduction: number;
    lowStockCount: number;
    pipelineValue: number;
    totalRevenue: number;
  };
  series14: { label: string; value: number; hint?: string }[];
  production: { label: string; value: number }[];
  pipeline: { label: string; value: number }[];
  fleet: { id: number; name: string; brand: string | null; status: string; category: string; color: string; icon: string }[];
  lowStock: { id: number; name: string; stock: number; min: number; unit: string }[];
  recentQuotes: { id: number; number: string; status: string; total: number; createdAt: string }[];
  birthdays?: { id: number; name: string; day: string; isToday: boolean; contact: string | null }[];
  recentOrders: { id: number; number: string; status: string; productionStatus: string; total: number; dueDate: string | null; priority: string }[];
  agendaToday: { id: number; title: string; startTime: string; estimatedMinutes: number; status: string; printer?: string }[];
};

const prodColors: Record<string, string> = {
  aguardando: "var(--color-proc-y)",
  em_producao: "var(--color-proc-c)",
  concluido: "#10b981",
  pausado: "#94a3b8",
};

const pipeOrder = ["novo", "qualificacao", "orcamento", "negociacao", "ganho", "perdido"];
const pipeLabel: Record<string, string> = {
  novo: "Novo",
  qualificacao: "Qualificação",
  orcamento: "Orçamento",
  negociacao: "Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
};

function Kpi({
  label,
  value,
  sub,
  icon,
  spark,
  tone = "cyan",
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: IconName;
  spark?: number[];
  tone?: "cyan" | "magenta" | "yellow" | "green";
  href?: string;
}) {
  const toneBg = {
    cyan: "bg-proc-c-soft text-proc-c-strong",
    magenta: "bg-proc-m-soft text-proc-m",
    yellow: "bg-proc-y-soft text-yellow-700",
    green: "bg-emerald-50 text-emerald-700",
  }[tone];
  const sparkColor = {
    cyan: "var(--color-proc-c)",
    magenta: "var(--color-proc-m)",
    yellow: "#ca8a04",
    green: "#059669",
  }[tone];
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">{label}</p>
          <p className="mt-2 font-mono text-[24px] leading-none font-semibold text-ink-900 tnum">{value}</p>
          {sub && <p className="mt-1.5 text-[11.5px] text-ink-500">{sub}</p>}
        </div>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneBg)}>
          <Icon name={icon} size={17} />
        </span>
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline data={spark} width={230} height={30} stroke={sparkColor} />
        </div>
      )}
    </>
  );
  const cls =
    "reveal block rounded-xl border border-paper-200 bg-paper-50 p-4.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-pop";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function SectionTitle({ title, href, hrefLabel }: { title: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <h3 className="display-expanded text-[14.5px] font-bold text-ink-900">{title}</h3>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-[11.5px] font-semibold text-proc-c-strong transition-colors hover:text-cyan-800"
        >
          {hrefLabel ?? "Ver tudo"}
          <Icon name="arrow-right" size={12} />
        </Link>
      )}
    </div>
  );
}

export function DashboardClient(p: Props) {
  const sparkVals = p.series14.map((s) => s.value);
  const prodData = p.production
    .filter((x) => x.value > 0)
    .map((x) => ({ label: x.label.replace(/_/g, " "), value: x.value, color: prodColors[x.label] ?? "#64748b" }));
  const prodTotal = prodData.reduce((s, d) => s + d.value, 0);
  const pipeTotal = p.pipeline.reduce((s, x) => s + x.value, 0) || 1;

  return (
    <div>
      {/* Cabeçalho do dia */}
      <div className="reveal mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10.5px] font-medium tracking-[0.18em] text-proc-c-strong uppercase">
            Visão geral · operação do dia
          </p>
          <h1 className="display-expanded mt-0.5 text-[28px] leading-tight font-bold text-ink-900">
            Chão de fábrica & balcão
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            Faturamento, produção e carteira em tempo real — do orçamento à entrega.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/pdv"
            className="focus-ring flex h-9.5 items-center gap-2 rounded-lg bg-ink-900 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-ink-800"
          >
            <Icon name="receipt" size={15} />
            Abrir PDV
          </Link>
          <Link
            href="/orcamentos?novo=1"
            className="focus-ring flex h-9.5 items-center gap-2 rounded-lg bg-proc-c-strong px-4 text-[13px] font-semibold text-white transition-colors hover:bg-cyan-800"
          >
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Novo orçamento
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Faturamento · 14 dias"
          value={formatMoney(p.kpis.revenue14)}
          sub={`${p.kpis.totalSales} vendas no período`}
          icon="chart"
          tone="cyan"
          spark={sparkVals}
          href="/financeiro"
        />
        <Kpi
          label="Hoje no caixa"
          value={formatMoney(p.kpis.todayRevenue)}
          sub={`Ticket médio ${formatMoney(p.kpis.avgTicket)}`}
          icon="wallet"
          tone="green"
          href="/financeiro"
        />
        <Kpi
          label="A receber"
          value={formatMoney(p.kpis.pendingReceivable)}
          sub={`${p.kpis.openQuotes} orçamentos em aberto`}
          icon="clock"
          tone="yellow"
          href="/financeiro"
        />
        <Kpi
          label="Pipeline comercial"
          value={formatMoney(p.kpis.pipelineValue)}
          sub={`Conversão de orçamentos: ${p.kpis.conversion}%`}
          icon="users"
          tone="magenta"
          href="/clientes"
        />
      </div>

      {/* Linha principal */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Faturamento */}
        <Card className="reveal reveal-1 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="display-expanded text-[15px] font-bold text-ink-900">Faturamento diário</h3>
              <p className="text-[11.5px] text-ink-500">Últimos 14 dias · vendas PDV</p>
            </div>
            <Badge tone="cyan">{formatMoney(p.kpis.revenue14)} acumulados</Badge>
          </div>
          <BarChart data={p.series14} height={190} formatValue={(v) => formatMoney(v)} />
        </Card>

        {/* Produção */}
        <Card className="reveal reveal-2">
          <SectionTitle title="Ordens em produção" href="/pedidos" />
          {prodTotal === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-ink-400">Nenhuma ordem de produção ainda.</p>
          ) : (
            <div className="flex items-center gap-5">
              <Donut
                data={prodData}
                centerValue={String(prodTotal)}
                centerLabel="ordens"
              />
              <div className="min-w-0 flex-1 space-y-2.5">
                {prodData.map((d) => (
                  <div key={d.label} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-600 capitalize">
                      {d.label}
                    </span>
                    <span className="font-mono text-[12px] font-semibold text-ink-900 tnum">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 border-t border-dashed border-paper-300 pt-4">
            <p className="mb-2.5 font-mono text-[10px] font-semibold tracking-[0.16em] text-ink-500 uppercase">
              Pipeline CRM
            </p>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-paper-200">
              {pipeOrder.map((col) => {
                const v = p.pipeline.find((x) => x.label === col)?.value || 0;
                if (!v) return null;
                const colors: Record<string, string> = {
                  novo: "#0891b2",
                  qualificacao: "#0e7490",
                  orcamento: "#d6246e",
                  negociacao: "#eab308",
                  ganho: "#10b981",
                  perdido: "#94a3b8",
                };
                return (
                  <div
                    key={col}
                    title={`${pipeLabel[col]}: ${v}`}
                    className="h-full transition-all duration-500"
                    style={{ width: `${(v / pipeTotal) * 100}%`, background: colors[col] }}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {pipeOrder.map((col) => {
                const v = p.pipeline.find((x) => x.label === col)?.value || 0;
                if (!v) return null;
                return (
                  <span key={col} className="text-[10.5px] text-ink-500">
                    <span className="font-mono font-semibold text-ink-800 tnum">{v}</span> {pipeLabel[col]}
                  </span>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Linha inferior */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {/* Parque gráfico */}
        <Card className="reveal reveal-2" pad={false}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="display-expanded text-[14.5px] font-bold text-ink-900">Parque gráfico</h3>
            <Link
              href="/impressoras"
              className="flex items-center gap-1 text-[11.5px] font-semibold text-proc-c-strong hover:text-cyan-800"
            >
              Motor de custos
              <Icon name="arrow-right" size={12} />
            </Link>
          </div>
          <div className="px-2 pb-2">
            {p.fleet.slice(0, 6).map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-paper-100"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[15px]"
                  style={{ background: `${m.color}1a` }}
                >
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold text-ink-800">{m.name}</p>
                  <p className="truncate text-[10.5px] text-ink-400">
                    {m.category}
                    {m.brand ? ` · ${m.brand}` : ""}
                  </p>
                </div>
                <StatusBadge value={m.status} />
              </div>
            ))}
            {p.fleet.length === 0 && (
              <p className="px-3 py-8 text-center text-[12px] text-ink-400">Cadastre impressoras no motor.</p>
            )}
          </div>
        </Card>

        {/* Agenda de hoje */}
        <Card className="reveal reveal-3">
          <SectionTitle title="Agenda de produção · hoje" href="/pedidos" />
          {p.agendaToday.length === 0 ? (
            <div className="halftone-cyan flex flex-col items-center rounded-lg border border-dashed border-paper-300 py-8 text-center">
              <Icon name="calendar" size={22} className="mb-2 text-ink-300" />
              <p className="text-[12.5px] font-medium text-ink-500">Nada agendado para hoje.</p>
              <p className="text-[11px] text-ink-400">Agende impressões na aba de pedidos.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {p.agendaToday.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-paper-200 bg-white px-3 py-2.5">
                  <div className="flex h-9 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-ink-900 font-mono text-paper-50">
                    <span className="text-[11px] leading-none font-semibold tnum">{s.startTime}</span>
                    <span className="mt-0.5 text-[8px] leading-none text-ink-400">{s.estimatedMinutes}min</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink-800">{s.title}</p>
                    {s.printer && <p className="truncate text-[10.5px] text-ink-400">🖨 {s.printer}</p>}
                  </div>
                  <StatusBadge value={s.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Alertas de estoque + orçamentos recentes */}
        <div className="space-y-4">
          <Card className="reveal reveal-3">
            <SectionTitle title="Estoque crítico" href="/estoque" />
            {p.lowStock.length === 0 ? (
              <p className="flex items-center gap-2 text-[12.5px] text-emerald-700">
                <Icon name="circle-check" size={16} />
                Nenhum material abaixo do mínimo.
              </p>
            ) : (
              <div className="space-y-2.5">
                {p.lowStock.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-ink-700">{m.name}</p>
                      <div className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-paper-200">
                        <div
                          className="h-full rounded-full bg-red-500"
                          style={{ width: `${Math.min((m.stock / Math.max(m.min, 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-semibold text-red-700 tnum">
                      {m.stock} {m.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Aniversariantes: a data já era coletada e só existia na
              ficha individual. Aqui vira ação comercial do dia. */}
          {(p.birthdays?.length ?? 0) > 0 && (
            <Card className="reveal reveal-4">
              <SectionTitle title="Aniversariantes da semana" href="/clientes" />
              <div className="space-y-1.5">
                {p.birthdays!.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-ink-700">{b.name}</p>
                      {!b.contact && (
                        <p className="font-mono text-[9px] tracking-wide text-ink-400 uppercase">
                          sem contato para envio
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 font-mono text-[10.5px] font-semibold tnum",
                        b.isToday ? "bg-emerald-50 text-emerald-700" : "text-ink-500"
                      )}
                    >
                      {b.isToday ? "hoje" : b.day}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="reveal reveal-4">
            <SectionTitle title="Últimos orçamentos" href="/orcamentos" />
            <div className="space-y-1">
              {p.recentQuotes.map((q) => (
                <Link
                  key={q.id}
                  href="/orcamentos"
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-paper-100"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-[11.5px] font-semibold text-ink-800">{q.number}</span>
                    <span className="block text-[10.5px] text-ink-400">
                      {new Date(q.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="font-mono text-[12px] font-semibold text-ink-900 tnum">{formatMoney(q.total)}</span>
                    <StatusBadge value={q.status} />
                  </span>
                </Link>
              ))}
              {p.recentQuotes.length === 0 && (
                <p className="py-4 text-center text-[12px] text-ink-400">Nenhum orçamento ainda.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Pedidos recentes — faixa */}
      <Card className="reveal reveal-4 mt-4" pad={false}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="display-expanded text-[14.5px] font-bold text-ink-900">Pedidos recentes</h3>
          <Link href="/pedidos" className="flex items-center gap-1 text-[11.5px] font-semibold text-proc-c-strong hover:text-cyan-800">
            Todas as ordens
            <Icon name="arrow-right" size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr>
                {["Número", "Total", "Vencimento", "Prioridade", "Produção", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-paper-200/70 transition-colors hover:bg-proc-c-soft/30">
                  <td className="px-3 py-2.5 font-mono text-[12px] font-semibold text-ink-900">{o.number}</td>
                  <td className="px-3 py-2.5 font-mono text-[12.5px] text-ink-800 tnum">{formatMoney(o.total)}</td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-ink-500 tnum">
                    {o.dueDate ? new Date(`${o.dueDate}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={o.priority === "urgente" ? "red" : o.priority === "alta" ? "amber" : "neutral"}>
                      {o.priority}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge value={o.productionStatus} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge value={o.status} />
                  </td>
                </tr>
              ))}
              {p.recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-ink-400">
                    Nenhum pedido registrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
