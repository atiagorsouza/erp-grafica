"use client";

import { cn } from "@/lib/format";

/* Gráficos SVG autorais — leves, sem dependências. */

export function Sparkline({
  data,
  width = 120,
  height = 34,
  stroke = "var(--color-proc-c)",
  fill = true,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  className?: string;
}) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - 3 - ((v - min) / range) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${pts.join(" L")}`;
  return (
    <svg width={width} height={height} className={cn("overflow-visible", className)} aria-hidden="true">
      {fill && (
        <path d={`${path} L${width},${height} L0,${height} Z`} fill={stroke} opacity="0.1" />
      )}
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={width}
        cy={height - 3 - ((data[data.length - 1] - min) / range) * (height - 6)}
        r="2.4"
        fill={stroke}
      />
    </svg>
  );
}

export function BarChart({
  data,
  height = 180,
  color = "var(--color-proc-c)",
  formatValue = (v: number) => String(v),
}: {
  data: { label: string; value: number; hint?: string }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div>
      <div className="flex items-end gap-[5px]" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max((Math.abs(d.value) / max) * (height - 26), d.value > 0 ? 4 : 2);
          return (
            <div key={i} className="group relative flex flex-1 flex-col items-center justify-end self-stretch">
              <div className="pointer-events-none absolute -top-1 z-10 -translate-y-full rounded-md bg-ink-900 px-2 py-1 font-mono text-[10px] whitespace-nowrap text-paper-50 opacity-0 shadow-pop transition-opacity group-hover:opacity-100 tnum">
                {d.hint ?? formatValue(d.value)}
              </div>
              <div
                className="w-full max-w-[34px] rounded-t-[4px] transition-all duration-500 ease-out group-hover:opacity-80"
                style={{
                  height: h,
                  background: d.value > 0 ? color : "var(--color-paper-300)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[5px] border-t border-paper-200 pt-1.5">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center font-mono text-[9.5px] text-ink-400">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Donut({
  data,
  size = 148,
  thickness = 17,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const safe = data.filter((d) => d.value > 0);
  const total = safe.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  /* offsets pré-calculados: mutar um acumulador durante o render
     quebra a regra de imutabilidade do React 19 (react-hooks). */
  const slices = safe.reduce<{ d: (typeof safe)[number]; dash: number; offset: number }[]>(
    (acc, d) => {
      const consumed = acc.reduce((s, x) => s + x.dash, 0);
      acc.push({ d, dash: (d.value / total) * C, offset: -consumed });
      return acc;
    },
    []
  );
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-paper-200)" strokeWidth={thickness} />
        {slices.map(({ d, dash, offset }, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {centerValue && <span className="font-mono text-[17px] font-semibold text-ink-900 tnum">{centerValue}</span>}
        {centerLabel && <span className="text-[10px] tracking-wide text-ink-400 uppercase">{centerLabel}</span>}
      </div>
    </div>
  );
}

/** Lista de barras horizontais — ranking */
export function HBars({
  data,
  color = "var(--color-proc-c)",
  format = (v: number) => String(v),
}: {
  data: { label: string; value: number; sub?: string; color?: string }[];
  color?: string;
  format?: (v: number) => string;
}) {
  /* Escala pelo maior valor ABSOLUTO: margem negativa gerava
     width negativo, o CSS era descartado e a barra aparecia CHEIA —
     mostrando a pior margem como se fosse a melhor. */
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = Math.min(100, Math.max(0, (Math.abs(d.value) / max) * 100));
        const negative = d.value < 0;
        return (
          <div key={i}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px] font-medium text-ink-700">{d.label}</span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[11.5px] font-semibold tnum",
                  negative ? "text-red-600" : "text-ink-900"
                )}
              >
                {format(d.value)}
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded-full bg-paper-200">
              <div
                className={cn("h-full rounded-full transition-all duration-700", negative && "opacity-80")}
                style={{
                  width: `${pct}%`,
                  background: d.color ?? color,
                  backgroundImage: negative
                    ? "repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 3px, transparent 3px 6px)"
                    : undefined,
                }}
              />
            </div>
            {d.sub && <p className="mt-0.5 text-[10.5px] text-ink-400">{d.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}
