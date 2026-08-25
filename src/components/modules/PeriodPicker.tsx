"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

/**
 * Seletor de período compartilhado por Financeiro e Relatórios.
 *
 * Antes nenhum dos dois tinha filtro de data: o card dizia "Saldo do
 * período" mas somava a base inteira desde a instalação.
 */

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shiftMonth(from: string, delta: number) {
  const [y, m] = from.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

export function PeriodPicker({
  period,
  label,
  extra,
}: {
  period: { from: string; to: string };
  label: string;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  const go = (next: { from: string; to: string }) => {
    startTransition(() => {
      router.push(`${pathname}?from=${next.from}&to=${next.to}`);
      router.refresh();
    });
  };

  const presets = [
    {
      id: "mes",
      label: "Este mês",
      range: () => {
        const now = new Date();
        const first = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        const last = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
        return { from: iso(first), to: iso(last) };
      },
    },
    {
      id: "anterior",
      label: "Mês anterior",
      range: () => shiftMonth(period.from, -1),
    },
    {
      id: "30d",
      label: "Últimos 30 dias",
      range: () => {
        const now = new Date();
        const start = new Date(now.getTime() - 29 * 86400000);
        return { from: iso(start), to: iso(now) };
      },
    },
    {
      id: "ano",
      label: "Este ano",
      range: () => {
        const y = new Date().getFullYear();
        return { from: `${y}-01-01`, to: `${y}-12-31` };
      },
    },
  ];

  return (
    <div className="reveal mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-lg border border-paper-200 bg-white px-1 py-1 shadow-card">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => go(shiftMonth(period.from, -1))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition hover:bg-paper-100 hover:text-ink-900"
        >
          <Icon name="chevron-left" size={14} />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "min-w-[150px] px-2 text-center font-mono text-[11.5px] font-semibold tracking-wide text-ink-800 uppercase transition",
            pending && "opacity-50"
          )}
        >
          {label}
        </button>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => go(shiftMonth(period.from, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition hover:bg-paper-100 hover:text-ink-900"
        >
          <Icon name="chevron-right" size={14} />
        </button>
      </div>

      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => go(p.range())}
          className="rounded-md border border-paper-200 bg-paper-50 px-2.5 py-1.5 font-mono text-[10.5px] font-medium text-ink-600 uppercase transition hover:border-ink-300 hover:text-ink-900"
        >
          {p.label}
        </button>
      ))}

      {extra}

      {open && (
        <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-paper-200 bg-paper-50 p-3 sm:w-auto">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">De</span>
            <Input mono type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9.5px] tracking-[0.14em] text-ink-400 uppercase">Até</span>
            <Input mono type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
          </label>
          <Button
            size="sm"
            icon="check"
            onClick={() => {
              setOpen(false);
              go({ from, to });
            }}
          >
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}
