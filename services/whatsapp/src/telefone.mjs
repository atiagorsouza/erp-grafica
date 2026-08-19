/* Mesma lógica de src/lib/phone.ts do ERP.
   Duplicada de propósito: este serviço roda em processo separado, sem
   o resolvedor de paths do Next. Se mudar lá, mude aqui. */

const DDD_VALIDOS = new Set([
  11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,
  41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,
  71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99,
]);

export function toE164BR(bruto) {
  let d = String(bruto || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("0055")) d = d.slice(4);
  else if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length > 11 && d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 12 && /^0\d/.test(d)) d = d.slice(1);
  if (d.length < 10 || d.length > 11) return null;

  const ddd = Number(d.slice(0, 2));
  if (!DDD_VALIDOS.has(ddd)) return null;

  let local = d.slice(2);
  if (local.length === 8) {
    if (/^[2-5]/.test(local)) return `55${ddd}${local}`;   // fixo
    if (/^[6-9]/.test(local)) local = "9" + local;
    else return null;
  }
  if (local.length !== 9 || !local.startsWith("9")) return null;
  return `55${ddd}${local}`;
}

/** JID → E.164. O WhatsApp às vezes omite o nono dígito (DDD ≤ 30). */
export function doJid(jid) {
  const cru = String(jid || "").split(/[@:]/)[0].replace(/\D+/g, "");
  if (!cru) return null;
  return toE164BR(cru.startsWith("55") ? cru : "55" + cru);
}

export function paraJid(bruto) {
  const k = toE164BR(bruto);
  return k ? `${k}@s.whatsapp.net` : null;
}

/** "(21) 98888-7777" para exibir na ficha do cliente. */
export function bonito(e164) {
  const d = String(e164 || "").replace(/\D+/g, "");
  const semPais = d.startsWith("55") ? d.slice(2) : d;
  if (semPais.length === 11) return `(${semPais.slice(0,2)}) ${semPais.slice(2,7)}-${semPais.slice(7)}`;
  if (semPais.length === 10) return `(${semPais.slice(0,2)}) ${semPais.slice(2,6)}-${semPais.slice(6)}`;
  return e164;
}
