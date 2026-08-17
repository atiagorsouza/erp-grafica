/**
 * Validadores e máscaras BR — CPF, CNPJ, e-mail, telefone, CEP.
 * Usados no CRM e demais módulos (PDV, fornecedores).
 */

/* ─────────────── CPF ─────────────── */
export function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

export function isValidCPF(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos iguais

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

export function formatCPF(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/* ─────────────── CNPJ ─────────────── */
export function isValidCNPJ(raw: string): boolean {
  const cnpj = onlyDigits(raw);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (base: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += parseInt(base[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(cnpj, w1);
  if (d1 !== parseInt(cnpj[12])) return false;
  const d2 = calc(cnpj, w2);
  return d2 === parseInt(cnpj[13]);
}

export function formatCNPJ(raw: string): string {
  const d = onlyDigits(raw).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

/** Escolhe automaticamente CPF ou CNPJ pelo tamanho */
export function formatDocument(raw: string, type: "pf" | "pj"): string {
  return type === "pj" ? formatCNPJ(raw) : formatCPF(raw);
}

export function isValidDocument(raw: string, type: "pf" | "pj"): boolean {
  if (!onlyDigits(raw)) return true; // vazio é permitido (opcional)
  return type === "pj" ? isValidCNPJ(raw) : isValidCPF(raw);
}

/* ─────────────── E-mail ─────────────── */
export function isValidEmail(raw: string): boolean {
  if (!raw) return true; // vazio permitido
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

/* ─────────────── Telefone ─────────────── */
export function formatPhone(raw: string): string {
  const d = onlyDigits(raw).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* ─────────────── CEP ─────────────── */
export function formatCEP(raw: string): string {
  const d = onlyDigits(raw).slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

export function isValidCEP(raw: string): boolean {
  return onlyDigits(raw).length === 8;
}

/* ─────────────── Data BR dd/mm/aaaa ↔ ISO ─────────────── */
export function brDateToISO(br: string): string | null {
  const m = (br || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return null;
  return iso;
}

export function isoToBRDate(iso?: string | null): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

export function formatBRDateInput(raw: string): string {
  const d = onlyDigits(raw).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/* ─────────────── UFs ─────────────── */
export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const MARITAL_STATUS = [
  "Solteiro(a)",
  "Casado(a)",
  "União estável",
  "Divorciado(a)",
  "Viúvo(a)",
  "Separado(a)",
];

export const COMPANY_SIZES = ["MEI", "ME", "EPP", "Médio", "Grande"];

export const CUSTOMER_SOURCES = [
  "balcao",
  "instagram",
  "facebook",
  "site",
  "indicacao",
  "google",
  "marketplace",
  "outro",
];

export const CUSTOMER_SEGMENTS = [
  "Varejo",
  "Atacado",
  "Corporativo",
  "Órgão público",
  "Revenda",
  "Consumidor final",
  "Escola/Instituição",
  "Outro",
];
