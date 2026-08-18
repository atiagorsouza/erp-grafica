import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Junta classes resolvendo CONFLITO entre utilities do Tailwind (v3.46.2).
 *
 * Antes era só `clsx`, que concatena tudo. Quando um componente define
 * `bg-white text-ink-900` na base e quem chama passa
 * `bg-ink-900 text-white`, as quatro classes iam juntas para o HTML.
 * Qual vence não depende da ordem na string — depende da ordem em que o
 * Tailwind gerou cada regra no CSS final.
 *
 * No PDV isso deixava o campo "Recebido R$" com fundo escuro e texto
 * escuro: o troco ficava invisível, tanto no celular quanto no PC. Era
 * o bug de "campo sem cor" — e havia 8 campos no mesmo estado.
 *
 * Com `twMerge`, a última classe da mesma propriedade ganha, que é o
 * comportamento que qualquer um espera ao passar `className`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0
  );

export { money as formatMoney };

export function formatDate(iso?: string | Date | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(iso?: string | Date | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Gera um número sequencial amigável: ORC-2026-0001 */
export function docNumber(prefix: string, seq: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}
