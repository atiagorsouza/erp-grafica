/* ====================================================================
 *  PERIOD — datas no fuso da operação (nunca em UTC)
 * ====================================================================
 *
 *  Bug corrigido na v3.11.0:
 *
 *  `createdAt` é `timestamp without time zone` e os relatórios
 *  agrupavam com `new Date(x).toISOString().slice(0,7)`, que é UTC,
 *  enquanto o rótulo do mês usava `toLocaleDateString("pt-BR")`.
 *
 *      Venda em 31/08/2026 21:30 BRT
 *        toISOString() → "2026-09"   ← mês seguinte
 *        correto       → "2026-08"
 *
 *  Toda venda depois das 21h caía no mês/dia seguinte e o fechamento
 *  mensal da gráfica saía errado. Aqui tudo é resolvido no fuso da
 *  loja (APP_TZ, padrão America/Sao_Paulo).
 * ==================================================================== */

export const APP_TZ = process.env.APP_TZ || "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-08-17" no fuso da operação. */
export function toLocalISODate(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return dateFormatter.format(new Date());
  return dateFormatter.format(date);
}

/** "2026-08" no fuso da operação. */
export function toLocalMonthKey(value: Date | string | number = new Date()): string {
  return toLocalISODate(value).slice(0, 7);
}

export function todayISO(): string {
  return toLocalISODate(new Date());
}

/** Primeiro e último dia do mês (padrão: mês corrente na loja). */
export function monthRange(monthKey?: string): { from: string; to: string } {
  const key = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : todayISO().slice(0, 7);
  const [year, month] = key.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, "0")}` };
}

/** Últimos N meses (mais antigo primeiro), rotulados em pt-BR. */
export function lastMonths(count = 6): { key: string; label: string }[] {
  const today = todayISO();
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const out: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({
      key,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(d),
    });
  }
  return out;
}

/** Intervalo cobrindo os últimos N meses inteiros, incluindo o atual. */
export function lastMonthsRange(count = 6): { from: string; to: string } {
  const months = lastMonths(count);
  return {
    from: monthRange(months[0].key).from,
    to: monthRange(months[months.length - 1].key).to,
  };
}

/** Últimos N dias (mais antigo primeiro), no fuso da loja. */
export function lastDays(count = 14): { key: string; label: string }[] {
  const today = todayISO();
  const base = new Date(`${today}T12:00:00Z`);
  const out: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    out.push({ key, label: key.slice(8, 10) });
  }
  return out;
}

/** Formata "2026-08-17" como "17/08/2026" sem escorregar de fuso. */
export function formatISODate(value: string | null | undefined): string {
  if (!value) return "—";
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "—";
  const [y, m, d] = text.split("-");
  return `${d}/${m}/${y}`;
}

/** Rótulo amigável do intervalo, para cabeçalho de relatório. */
export function describeRange(from: string, to: string): string {
  const range = monthRange(from.slice(0, 7));
  if (range.from === from && range.to === to) {
    const d = new Date(`${from}T12:00:00Z`);
    const label = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return `${formatISODate(from)} a ${formatISODate(to)}`;
}
