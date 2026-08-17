/**
 * ====================================================================
 *  MONEY — parsing e aritmética monetária seguras
 * ====================================================================
 *
 *  Origem: no PDV o operador digita no padrão brasileiro ("10,50").
 *  `Number("10,50")` devolve NaN, e o `numeric` do PostgreSQL ACEITA
 *  NaN — então uma venda inteira era gravada com total NaN e
 *  contaminava Dashboard e Relatórios.
 *
 *  Regra deste módulo: nada sai daqui que não seja um número finito.
 * ==================================================================== */

/** Converte qualquer entrada em número finito. Nunca devolve NaN. */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (value === null || value === undefined) return fallback;

  let text = String(value).trim();
  if (!text) return fallback;

  // remove símbolo de moeda, espaços (inclusive NBSP) e sinal de porcentagem
  text = text.replace(/[R$\s\u00a0%]/g, "");

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    // "1.234,56" (BR) vs "1,234.56" (US) — decide pelo separador mais à direita
    text = text.lastIndexOf(",") > text.lastIndexOf(".")
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (hasComma) {
    text = text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Igual a toNumber, mas nunca negativo (descontos, quantidades, valores recebidos). */
export function toPositive(value: unknown, fallback = 0): number {
  return Math.max(0, toNumber(value, fallback));
}

/** Arredonda para centavos evitando erro de ponto flutuante (1.005 → 1.01). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Serializa para o banco garantindo string numérica válida (nunca "NaN"). */
export function toDecimalString(value: unknown, scale = 4): string {
  const n = toNumber(value, 0);
  return (Number.isFinite(n) ? n : 0).toFixed(scale);
}

/**
 * Gross-up da taxa de cartão.
 *
 *  ERRADO : total = base * (1 + taxa)   → a adquirente cobra sobre o
 *           valor cobrado, então sobra menos que a base.
 *  CERTO  : total = base / (1 - taxa)   → após a retenção sobra
 *           exatamente a base.
 *
 *  Base 100 com 4,99%:
 *      errado → cobra 104,99 · retém 5,24 · líquido 99,75  ❌
 *      certo  → cobra 105,25 · retém 5,25 · líquido 100,00 ✅
 */
export function grossUp(base: number, rate: number): number {
  const safeBase = toNumber(base, 0);
  const safeRate = toNumber(rate, 0);
  if (safeRate <= 0 || safeRate >= 1) return round2(safeBase);
  return round2(safeBase / (1 - safeRate));
}

/** Valor da taxa embutida no total (o que a adquirente retém). */
export function cardFeeAmount(base: number, rate: number): number {
  return round2(grossUp(base, rate) - toNumber(base, 0));
}

/** Aplica desconto em R$ ou %, com piso em 0 e teto no subtotal. */
export function applyDiscount(
  subtotal: number,
  rawValue: unknown,
  mode: "value" | "percent"
): number {
  const base = toPositive(subtotal);
  const input = toPositive(rawValue);
  const discount = mode === "percent" ? (base * Math.min(input, 100)) / 100 : input;
  return round2(Math.min(Math.max(0, discount), base));
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Formata em BRL. Entrada inválida vira R$ 0,00 — nunca "R$ NaN". */
export function formatBRL(value: unknown): string {
  return BRL.format(toNumber(value, 0));
}
