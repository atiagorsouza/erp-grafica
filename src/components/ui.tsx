"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/format";
import { Icon, type IconName } from "@/components/icons";

/* ════════════════════════════════════════════════════════════════
   BOTÕES
   ════════════════════════════════════════════════════════════════ */
type ButtonVariant = "primary" | "ink" | "outline" | "ghost" | "danger" | "soft" | "magenta";
type ButtonSize = "xs" | "sm" | "md" | "lg";

const btnVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-proc-c-strong text-white hover:bg-cyan-800 active:bg-cyan-900 shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(14_20_32/0.2)]",
  ink: "bg-ink-900 text-paper-50 hover:bg-ink-800 active:bg-ink-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
  outline:
    "border border-paper-300 bg-paper-50 text-ink-800 hover:border-ink-400 hover:bg-white active:bg-paper-100",
  ghost: "text-ink-600 hover:bg-ink-900/5 hover:text-ink-900 active:bg-ink-900/10",
  danger: "bg-red-700 text-white hover:bg-red-800 active:bg-red-900",
  soft: "bg-proc-c-soft text-proc-c-strong hover:bg-cyan-100 active:bg-cyan-200/70",
  magenta: "bg-proc-m text-white hover:bg-pink-700 active:bg-pink-800",
};
const btnSizes: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-[11.5px] gap-1.5",
  sm: "h-8.5 px-3.5 text-[12.5px] gap-1.5",
  md: "h-9.5 px-4 text-[13px] gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg font-semibold transition-all duration-150 select-none disabled:cursor-not-allowed disabled:opacity-50",
        btnVariants[variant],
        btnSizes[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon && <Icon name={icon} size={size === "xs" ? 13 : size === "sm" ? 14 : 16} />
      )}
      {children}
    </button>
  );
}

export function IconButton({
  name,
  label,
  tone = "default",
  size = "md",
  loading,
  disabled,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  name: IconName;
  label: string;
  tone?: "default" | "danger" | "primary";
  size?: "sm" | "md";
  /** trava o botão e mostra spinner enquanto a ação está em voo */
  loading?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled || loading}
      className={cn(
        "focus-ring inline-flex cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-7 w-7" : "h-8.5 w-8.5",
        tone === "danger" && "text-ink-400 hover:bg-red-50 hover:text-red-700",
        tone === "primary" && "text-proc-c-strong hover:bg-proc-c-soft",
        tone === "default" && "text-ink-500 hover:bg-ink-900/5 hover:text-ink-900",
        className
      )}
      {...rest}
    >
      {loading ? (
        <span
          className={cn(
            "animate-spin rounded-full border-2 border-current border-t-transparent",
            size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"
          )}
        />
      ) : (
        <Icon name={name} size={size === "sm" ? 14 : 16} />
      )}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════
   SUPERFÍCIES
   ════════════════════════════════════════════════════════════════ */
export function Card({
  className,
  children,
  pad = true,
}: {
  className?: string;
  children: ReactNode;
  pad?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-paper-200 bg-paper-50 shadow-card",
        pad && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: IconName;
  actions?: ReactNode;
}) {
  return (
    <div className="reveal mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-3.5">
        {icon && (
          <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-lg bg-ink-900 text-paper-50 shadow-pop">
            <div className="cmyk-strip absolute h-11 w-11 rounded-lg opacity-0" />
            <Icon name={icon} size={21} strokeWidth={1.6} />
          </div>
        )}
        <div>
          <p className="font-mono text-[10.5px] font-medium tracking-[0.18em] text-proc-c-strong uppercase">
            {eyebrow}
          </p>
          <h1 className="display-expanded mt-0.5 text-[26px] leading-tight font-bold text-ink-900">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   BADGES & STATUS
   ════════════════════════════════════════════════════════════════ */
type Tone = "neutral" | "cyan" | "magenta" | "yellow" | "green" | "red" | "amber" | "ink" | "blue";
const tones: Record<Tone, string> = {
  neutral: "bg-paper-200/70 text-ink-600 border-paper-300/60",
  cyan: "bg-proc-c-soft text-proc-c-strong border-cyan-200",
  magenta: "bg-proc-m-soft text-proc-m border-pink-200",
  yellow: "bg-proc-y-soft text-yellow-700 border-yellow-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  red: "bg-red-50 text-red-700 border-red-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  ink: "bg-ink-900 text-paper-50 border-ink-900",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-wide uppercase whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const statusToneMap: Record<string, Tone> = {
  // impressoras
  ativa: "green",
  manutencao: "amber",
  inativa: "neutral",
  // clientes
  lead: "yellow",
  ativo: "green",
  bloqueado: "red",
  // orçamentos
  rascunho: "neutral",
  enviado: "blue",
  aprovado: "green",
  recusado: "red",
  expirado: "amber",
  // pedidos
  aberto: "blue",
  confirmado: "cyan",
  concluido: "green",
  concluído: "green",
  cancelado: "red",
  aguardando: "yellow",
  em_producao: "cyan",
  pausado: "amber",
  // arte
  nao_enviada: "neutral",
  revisao: "amber",
  recusada: "red",
  // entrega
  a_definir: "neutral",
  separado: "blue",
  em_rota: "cyan",
  entregue: "green",
  devolvido: "red",
  // financeiro
  pago: "green",
  atrasado: "red",
  // compras
  pedido: "blue",
  parcial: "amber",
  recebido: "green",
  // produção
  planejado: "blue",
  em_andamento: "cyan",
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  const tone = statusToneMap[value] ?? "neutral";
  return (
    <Badge tone={tone} dot>
      {label ?? value.replace(/_/g, " ")}
    </Badge>
  );
}

/* ════════════════════════════════════════════════════════════════
   FORMULÁRIOS
   ════════════════════════════════════════════════════════════════ */
/**
 * Base dos campos, em duas versões (v3.46.3).
 *
 * Antes existia só a versão clara, e telas de fundo escuro — o PDV —
 * mandavam `bg-ink-900 text-white` por cima via `className`. Isso
 * deixava DUAS regras de cor no mesmo elemento, e qual vencia dependia
 * da ordem em que o Tailwind gerou o CSS, não da ordem no código.
 *
 * No CSS gerado a ordem era:
 *     .bg-ink-850   (PDV)
 *     .bg-white     (base)   <- vinha depois, VENCIA
 *     .text-ink-900 (base)
 *     .text-white   (PDV)    <- vinha depois, VENCIA
 *
 * Resultado: fundo branco com texto branco. O campo "Recebido R$"
 * ficava invisível — o valor era digitado e o troco calculava certo,
 * mas não dava para ler o que se digitou.
 *
 * `tailwind-merge` resolve isso removendo a classe perdedora, mas
 * depender dele deixa a legibilidade do PDV refém de uma dependência e
 * da ordem do bundler. Com `tone="dark"` a classe clara simplesmente
 * NÃO É EMITIDA: não há conflito para resolver.
 */
const fieldShared =
  "focus-ring w-full rounded-lg border px-3 text-[13px] transition-colors focus:border-proc-c";

const fieldLight =
  "border-paper-300 bg-white text-ink-900 placeholder:text-ink-300 hover:border-ink-400 disabled:bg-paper-100 disabled:text-ink-400";

const fieldDark =
  "border-ink-700 bg-ink-900 text-white placeholder:text-ink-500 hover:border-ink-600 disabled:bg-ink-850 disabled:text-ink-500";

/** `tone="dark"` para campos sobre fundo escuro (PDV). */
export type FieldTone = "light" | "dark";

const fieldTone = (tone: FieldTone = "light") =>
  cn(fieldShared, tone === "dark" ? fieldDark : fieldLight);

const fieldBase = cn(fieldShared, fieldLight);

export function Input({
  className,
  mono,
  tone,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
  tone?: FieldTone;
  /** React 19 aceita `ref` como prop normal — usado pelo PDV (atalho F2). */
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={ref}
      className={cn(fieldTone(tone), "h-9.5", mono && "font-mono text-[12.5px]", className)}
      {...rest}
    />
  );
}

export function Textarea({ className, tone, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { tone?: FieldTone }) {
  return <textarea className={cn(fieldTone(tone), "min-h-[84px] py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({
  className,
  children,
  tone,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { tone?: FieldTone }) {
  return (
    <select className={cn(fieldTone(tone), "h-9.5 cursor-pointer appearance-none pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold tracking-wide text-ink-600 uppercase">
          {label}
          {required && <span className="ml-0.5 text-proc-m">*</span>}
        </span>
        {hint && <span className="text-[10.5px] text-ink-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="focus-ring inline-flex cursor-pointer items-center gap-2.5"
    >
      <span
        className={cn(
          "relative h-5.5 w-10 rounded-full transition-colors duration-200",
          checked ? "bg-proc-c-strong" : "bg-paper-300"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all duration-200",
            checked ? "left-5" : "left-0.5"
          )}
        />
      </span>
      {label && <span className="text-[13px] font-medium text-ink-700">{label}</span>}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════
   TABS / SEGMENTED
   ════════════════════════════════════════════════════════════════ */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-paper-300 bg-paper-200/60 p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "focus-ring flex cursor-pointer items-center gap-1.5 rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
            value === opt.value
              ? "bg-paper-50 text-ink-900 shadow-card"
              : "text-ink-500 hover:text-ink-800"
          )}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span
              className={cn(
                "rounded px-1.5 font-mono text-[10px] tnum",
                value === opt.value ? "bg-proc-c-soft text-proc-c-strong" : "bg-paper-300/60 text-ink-500"
              )}
            >
              {opt.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MODAL & DRAWER
   ════════════════════════════════════════════════════════════════ */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "animate-pop-in relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl border border-paper-200 bg-paper-50 shadow-pop sm:rounded-xl",
          width
        )}
      >
        <div className="cmyk-strip h-1 shrink-0" />
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-paper-200 px-6 py-4">
          <div>
            <h2 className="display-expanded text-[17px] font-bold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-ink-500">{subtitle}</p>}
          </div>
          <IconButton name="x" label="Fechar" onClick={onClose} />
        </div>
        <div className="grow overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-paper-200 bg-paper-100/60 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={cn(
          "animate-slide-left absolute inset-y-0 right-0 flex w-full flex-col border-l border-paper-200 bg-paper-50 shadow-pop",
          width
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-paper-200 px-6 py-4">
          <div className="min-w-0">
            <div className="display-expanded text-[17px] font-bold text-ink-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-[12px] text-ink-500">{subtitle}</div>}
          </div>
          <IconButton name="x" label="Fechar" onClick={onClose} />
        </div>
        <div className="grow overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-paper-200 bg-paper-100/60 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TABELA
   ════════════════════════════════════════════════════════════════ */
export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-paper-200 bg-paper-50 shadow-card", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left">{children}</table>
    </div>
  );
}

export function Th({ className, children, right }: { className?: string; children?: ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        "sticky top-0 border-b border-paper-200 bg-paper-100/90 px-4 py-2.5 font-mono text-[10.5px] font-semibold tracking-[0.12em] text-ink-500 uppercase backdrop-blur",
        right && "text-right",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  className,
  children,
  right,
  mono,
}: {
  className?: string;
  children?: ReactNode;
  right?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-paper-200/70 px-4 py-3 text-[13px] text-ink-700 last:border-0",
        right && "text-right",
        mono && "font-mono text-[12.5px] tnum",
        className
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  className,
  children,
  onClick,
  active,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-proc-c-soft/40",
        active && "bg-proc-c-soft/50",
        className
      )}
    >
      {children}
    </tr>
  );
}

/* ════════════════════════════════════════════════════════════════
   ESTADOS & DIVERSOS
   ════════════════════════════════════════════════════════════════ */
export function EmptyState({
  icon = "boxes",
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="halftone-cyan flex flex-col items-center justify-center rounded-xl border border-dashed border-paper-300 bg-paper-50/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-paper-50">
        <Icon name={icon} size={22} strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-semibold text-ink-800">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[12.5px] text-ink-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Barra de tinta — nível estilo tanque de impressora */
export function InkBar({
  percent,
  color = "var(--color-proc-c)",
  className,
  height = 6,
}: {
  percent: number;
  color?: string;
  className?: string;
  height?: number;
}) {
  const p = Math.min(Math.max(percent, 0), 100);
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-paper-200", className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${p}%`, background: color }}
      />
    </div>
  );
}

export function KeyVal({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[11.5px] font-medium tracking-wide text-ink-500 uppercase">{k}</span>
      <span className={cn("text-right text-[13px] font-semibold text-ink-900", mono && "font-mono tnum")}>{v}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   COMBOBOX — busca com filtro local
   ════════════════════════════════════════════════════════════════ */
export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  className,
}: {
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q.toLowerCase()) ||
          (o.hint || "").toLowerCase().includes(q.toLowerCase())
      )
    : options;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQ("");
        }}
        className={cn(fieldBase, "flex h-9.5 cursor-pointer items-center justify-between gap-2 text-left")}
      >
        <span className={cn("truncate", !selected && "text-ink-300")}>
          {selected ? selected.label : placeholder ?? "Selecionar…"}
        </span>
        <Icon name="chevron-down" size={14} className={cn("shrink-0 text-ink-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="animate-pop-in absolute z-40 mt-1.5 w-full overflow-hidden rounded-lg border border-paper-200 bg-white shadow-pop">
          <div className="border-b border-paper-200 p-1.5">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="focus-ring w-full rounded-md bg-paper-100 px-2.5 py-1.5 text-[12.5px] outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-[12px] text-ink-400">Nada encontrado.</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors hover:bg-proc-c-soft/60",
                  o.value === value && "bg-proc-c-soft font-semibold"
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 font-mono text-[10.5px] text-ink-400 tnum">{o.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TOASTS
   ════════════════════════════════════════════════════════════════ */
type ToastItem = { id: number; kind: "success" | "error" | "info"; title: string; body?: string };
let toastSeq = 0;
let toastList: ToastItem[] = [];
const toastListeners = new Set<() => void>();

function emitToasts() {
  toastListeners.forEach((l) => l());
}
function pushToast(kind: ToastItem["kind"], title: string, body?: string) {
  const id = ++toastSeq;
  toastList = [...toastList, { id, kind, title, body }];
  emitToasts();
  setTimeout(() => {
    toastList = toastList.filter((t) => t.id !== id);
    emitToasts();
  }, 4500);
}

export const toast = {
  success: (title: string, body?: string) => pushToast("success", title, body),
  error: (title: string, body?: string) => pushToast("error", title, body),
  info: (title: string, body?: string) => pushToast("info", title, body),
};

export function Toaster() {
  const items = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toastList,
    () => []
  );
  return (
    <div className="no-print pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[340px] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-slide-up pointer-events-auto flex items-start gap-3 rounded-lg border bg-ink-900 px-4 py-3 text-paper-50 shadow-pop",
            t.kind === "success" && "border-emerald-500/40",
            t.kind === "error" && "border-red-500/40",
            t.kind === "info" && "border-cyan-500/40"
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              t.kind === "success" && "bg-emerald-500/20 text-emerald-300",
              t.kind === "error" && "bg-red-500/20 text-red-300",
              t.kind === "info" && "bg-cyan-500/20 text-cyan-300"
            )}
          >
            <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"} size={12} strokeWidth={2.4} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] leading-tight font-semibold">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-300">{t.body}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
