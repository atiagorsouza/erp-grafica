/* ──────────────────────────────────────────────────────────────────
   Telefone canônico (E.164) para casar cliente ↔ WhatsApp.

   `formatPhone` em validators.ts é MÁSCARA DE EXIBIÇÃO: devolve
   "(21) 98888-7777". Não serve para comparar. O WhatsApp identifica
   cada contato por um JID numérico ("5521988887777@s.whatsapp.net"),
   então precisamos de uma forma canônica única por pessoa.

   Sem isso o bot cria um cliente novo a cada mensagem, porque
   "(21) 98888-7777", "21988887777" e "+55 21 98888-7777" são strings
   diferentes para o banco.

   ── O problema do nono dígito ──
   Celulares brasileiros ganharam um 9 na frente. Cadastros antigos
   têm 10 dígitos ("2188887777"), novos têm 11 ("21988887777").
   São a MESMA pessoa. Canonizamos sempre para 11 dígitos.

   ── A pegadinha do JID ──
   O WhatsApp NÃO envia o nono dígito para números de DDD 11–30 em
   contas antigas: o JID chega como "552188887777" (12 chars) em vez
   de "5521988887777" (13). Por isso `jidVariants()` devolve as duas
   formas — a busca precisa tentar ambas.
   ────────────────────────────────────────────────────────────────── */

export const BR_COUNTRY = "55";

/** DDDs válidos no Brasil. Evita aceitar lixo como (00) ou (10). */
const DDD_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function onlyDigitsPhone(raw: string): string {
  return (raw || "").replace(/\D+/g, "");
}

export type PhoneKind = "mobile" | "landline";

export interface CanonicalPhone {
  /** "5521988887777" — chave única, é isto que vai no índice. */
  e164: string;
  /** "+55 21 98888-7777" — para mostrar na tela. */
  pretty: string;
  ddd: number;
  kind: PhoneKind;
}

/**
 * Converte qualquer grafia brasileira para E.164.
 * Devolve null se não for um telefone BR plausível — melhor recusar
 * do que gravar lixo que vai virar cliente fantasma.
 */
export function toE164BR(raw: string): CanonicalPhone | null {
  let d = onlyDigitsPhone(raw);
  if (!d) return null;

  // Descarta prefixo internacional já presente.
  if (d.startsWith("00" + BR_COUNTRY)) d = d.slice(4);
  else if (d.startsWith(BR_COUNTRY) && d.length >= 12) d = d.slice(2);

  // Tira o 0 de operadora ("021 9...", "0 21 9...").
  if (d.length > 11 && d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 12 && /^0\d/.test(d)) d = d.slice(1);

  if (d.length < 10 || d.length > 11) return null;

  const ddd = Number(d.slice(0, 2));
  if (!DDD_VALIDOS.has(ddd)) return null;

  let local = d.slice(2);

  if (local.length === 8) {
    // Fixo (2–5) fica como está; celular antigo ganha o nono dígito.
    if (/^[2-5]/.test(local)) {
      return {
        e164: `${BR_COUNTRY}${ddd}${local}`,
        pretty: `+55 ${ddd} ${local.slice(0, 4)}-${local.slice(4)}`,
        ddd,
        kind: "landline",
      };
    }
    if (/^[6-9]/.test(local)) local = "9" + local;
    else return null;
  }

  if (local.length !== 9) return null;
  // Celular brasileiro sempre começa com 9 após a normalização.
  if (!local.startsWith("9")) return null;

  return {
    e164: `${BR_COUNTRY}${ddd}${local}`,
    pretty: `+55 ${ddd} ${local.slice(0, 5)}-${local.slice(5)}`,
    ddd,
    kind: "mobile",
  };
}

/** Só a chave, para gravar/consultar. */
export function phoneKey(raw: string): string | null {
  return toE164BR(raw)?.e164 ?? null;
}

/**
 * Formas possíveis do mesmo número no WhatsApp.
 * Contas antigas de DDD ≤ 30 aparecem SEM o nono dígito.
 * Use no `WHERE ... IN (...)` ao procurar o cliente.
 */
export function jidVariants(raw: string): string[] {
  const c = toE164BR(raw);
  if (!c) return [];
  const out = new Set<string>([c.e164]);
  if (c.kind === "mobile") {
    const local = c.e164.slice(4); // depois de 55 + DDD
    if (local.length === 9 && local.startsWith("9")) {
      out.add(`${BR_COUNTRY}${c.ddd}${local.slice(1)}`);
    }
  }
  return [...out];
}

/** "5521988887777@s.whatsapp.net" → "5521988887777" */
export function fromJid(jid: string): string | null {
  const bare = (jid || "").split(/[@:]/)[0];
  const d = onlyDigitsPhone(bare);
  if (!d) return null;
  // JID já vem com país; normaliza para reaplicar o nono dígito.
  return phoneKey(d.startsWith(BR_COUNTRY) ? d : BR_COUNTRY + d);
}

/** "5521988887777" → "5521988887777@s.whatsapp.net" */
export function toJid(raw: string): string | null {
  const key = phoneKey(raw);
  return key ? `${key}@s.whatsapp.net` : null;
}
