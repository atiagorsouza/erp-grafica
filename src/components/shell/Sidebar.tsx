import Link from "next/link";
import { db } from "@/db";
import { printers } from "@/db/schema";
import { Icon, RegistrationMark, type IconName } from "@/components/icons";

type NavItem = { href: string; label: string; icon: IconName };
type NavGroup = { label: string; accent: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "Operação",
    accent: "var(--color-proc-c)",
    items: [
      { href: "/", label: "Visão Geral", icon: "gauge" },
      { href: "/pdv", label: "PDV · Frente de Caixa", icon: "receipt" },
      { href: "/orcamentos", label: "Orçamentos", icon: "quote" },
      { href: "/pedidos", label: "Pedidos & OS", icon: "orders" },
      { href: "/clientes", label: "Clientes & CRM", icon: "users" },
      { href: "/whatsapp", label: "WhatsApp", icon: "whatsapp" },
      { href: "/kanban", label: "Kanban Produção", icon: "kanban" },
      { href: "/calendario", label: "Calendário", icon: "calendar" },
    ],
  },
  {
    label: "Motor de Produção",
    accent: "var(--color-proc-m)",
    items: [
      { href: "/impressoras", label: "Impressoras & Tintas", icon: "printer" },
      { href: "/produtos", label: "Produtos & Custos", icon: "tag" },
      { href: "/tabelas-precos", label: "Tabelas de Preços", icon: "sheets" },
      { href: "/servicos", label: "Serviços & Acabamentos", icon: "scissors" },
      { href: "/estoque", label: "Estoque & Compras", icon: "boxes" },
    ],
  },
  {
    label: "Gestão",
    accent: "var(--color-proc-y)",
    items: [
      { href: "/cobrancas", label: "Cobranças", icon: "wallet" },
      { href: "/envios", label: "Envios & Frete", icon: "truck" },
      { href: "/financeiro", label: "Financeiro", icon: "wallet" },
      { href: "/relatorios", label: "Relatórios", icon: "chart" },
      { href: "/configuracoes", label: "Painel de Controle", icon: "gear" },
    ],
  },
];

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {NAV.map((group) => (
        <div key={group.label} className="mb-5">
          <div className="mb-1.5 flex items-center gap-2 px-3">
            <span className="h-[3px] w-3.5 rounded-full" style={{ background: group.accent }} />
            <span className="font-mono text-[9.5px] font-semibold tracking-[0.22em] text-ink-400 uppercase">
              {group.label}
            </span>
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-[7.5px] text-[13px] font-medium transition-all duration-150 ${
                    active
                      ? "bg-white/[0.07] font-semibold text-white shadow-inset-line"
                      : "text-ink-300 hover:bg-white/[0.04] hover:text-paper-50"
                  }`}
                >
                  {active && (
                    <span className="absolute top-1/2 left-0 h-4.5 w-[3px] -translate-y-1/2 rounded-r-full bg-proc-c" />
                  )}
                  <Icon
                    name={item.icon}
                    size={16.5}
                    strokeWidth={active ? 1.9 : 1.6}
                    className={active ? "text-cyan-300" : "text-ink-400 transition-colors group-hover:text-ink-300"}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

export async function Sidebar({ pathname }: { pathname: string }) {
  let total = 0;
  let active = 0;
  try {
    const rows = await db.select({ status: printers.status }).from(printers);
    total = rows.length;
    active = rows.filter((r) => r.status === "ativa").length;
  } catch {
    /* banco ainda sem schema */
  }

  return (
    <aside className="no-print ink-grid sticky top-0 z-30 hidden h-screen w-[264px] shrink-0 flex-col border-r border-ink-800 bg-ink-900 lg:flex">
      {/* Marca */}
      <div className="relative shrink-0 px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-950 ring-1 ring-white/10">
            <RegistrationMark size={24} />
          </div>
          <div className="min-w-0">
            <p className="display-expanded text-[17px] leading-none font-bold tracking-tight text-white">
              PrintFlow
            </p>
            <p className="mt-1 font-mono text-[9px] tracking-[0.18em] text-ink-400 uppercase">
              Gráfica · Papelaria
            </p>
          </div>
        </div>
        <div className="cmyk-strip mt-4 h-[3px] rounded-full opacity-80" />
      </div>

      {/* Navegação */}
      <nav className="dark-scroll grow overflow-y-auto px-3 pt-2 pb-4">
        <NavLinks pathname={pathname} />
      </nav>

      {/* Parque gráfico — resumo vivo */}
      <div className="halftone-light mx-3 mb-4 shrink-0 rounded-lg border border-white/10 bg-ink-850 p-3.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] font-semibold tracking-[0.18em] text-ink-400 uppercase">
            Parque gráfico
          </span>
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse-soft absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        </div>
        <p className="mt-2 font-mono text-[20px] leading-none font-semibold text-white tnum">
          {active}
          <span className="text-[13px] text-ink-400"> / {total} ativas</span>
        </p>
        <div className="mt-2.5 flex gap-1">
          {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i < active ? "bg-emerald-400/80" : "bg-ink-600"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-ink-800 px-5 py-3">
        <span className="font-mono text-[9.5px] tracking-wider text-ink-500">v3.0 · PRINTFLOW</span>
        <div className="flex gap-1">
          <span className="h-2 w-2 rounded-[2px] bg-proc-c" />
          <span className="h-2 w-2 rounded-[2px] bg-proc-m" />
          <span className="h-2 w-2 rounded-[2px] bg-proc-y" />
          <span className="h-2 w-2 rounded-[2px] bg-paper-50" />
        </div>
      </div>
    </aside>
  );
}
