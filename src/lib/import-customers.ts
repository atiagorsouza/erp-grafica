import "server-only";

import { extractText, getDocumentProxy } from "unpdf";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { sql } from "drizzle-orm";
import { isValidDocument, onlyDigits } from "@/lib/validators";

/**
 * Importação de clientes a partir das FICHAS DO CLIENTE em PDF exportadas
 * pelo sistema legado.
 *
 * O layout tem rótulos fixos ("Nome/Razão:", "Bairro..:", "Nº do CPF:"),
 * então a extração é por rótulo, não por posição — o que sobrevive a
 * variação de espaçamento entre fichas. O extrator de PDF colapsa
 * espaços múltiplos, por isso todo padrão aceita `\s+`.
 *
 * Uma ficha por página é o caso comum, mas o mesmo texto pode trazer
 * várias: o corte é feito pelo cabeçalho "FICHA DO CLIENTE".
 */

export type ParsedCustomer = {
  /** código do cadastro no sistema antigo — usado para rastrear a origem */
  legacyCode: string | null;
  name: string;
  tradeName: string | null;
  document: string | null;
  type: "pf" | "pj";
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  /* PF */
  rg: string | null;
  rgIssuer: string | null;
  birthDate: string | null;
  maritalStatus: string | null;
  /* PJ */
  stateRegistration: string | null;
  municipalRegistration: string | null;
  contactName: string | null;
  /* comercial */
  origin: string | null;
  notes: string | null;
};

export type ImportIssue = {
  /** 1-based, para o usuário localizar a ficha no PDF */
  index: number;
  name: string;
  reason: string;
};

export type ImportReport = {
  totalFichas: number;
  imported: number;
  updated: number;
  skipped: number;
  issues: ImportIssue[];
  preview: ParsedCustomer[];
};

/** Campo vazio no legado vira uma sequência de pontos, traços ou nada. */
function clean(v: string | undefined | null): string | null {
  if (!v) return null;
  const t = v
    .replace(/[_.]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  /* "(  )     -" e "  .   .   /    -  " são máscaras vazias do legado */
  if (/^[()\s.\-/]*$/.test(t)) return null;
  /* Campo em branco faz o regex avançar até o próximo rótulo: sem isto,
     uma ficha sem cidade capturava literalmente "UF:" como cidade. */
  if (/^(UF|CEP|CPL|IE|IM|RG|ORGAO|Sexo|Cidade|Bairro|Tipo Cadastro|Rede Social|Celular|Telefone|Whatsapp|Contato|Data Nascimento|Estado Civil|C[ôo]njuge|Escolaridade|Nome Pai|Nome M[âa]e|Natural|Nacionalidade|Profiss[ãa]o|Local Trabalho|Vendedor|Skype|Email)\b\.*:?.*$/i.test(t)) {
    return null;
  }
  return t;
}

function grab(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m ? clean(m[1]) : null;
}

/**
 * Telefone do legado vem como "(61)98313-7802" ou vazio "(  )     -".
 * Devolve apenas o que tiver dígitos suficientes para ser um telefone.
 */
function phone(v: string | null): string | null {
  if (!v) return null;
  const d = onlyDigits(v);
  if (d.length < 10 || d.length > 13) return null;
  return v.trim();
}

/** Divide o texto do PDF em fichas individuais. */
export function splitFichas(text: string): string[] {
  const marker = /C[óo]digo\s+Cadastro:/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = marker.exec(text)) !== null) starts.push(m.index);
  if (starts.length === 0) return [];
  return starts.map((s, i) => text.slice(s, starts[i + 1] ?? text.length));
}

/** Extrai os campos de UMA ficha. */
export function parseFicha(bloco: string): ParsedCustomer | null {
  const name = grab(bloco, /Nome\/Raz[ãa]o:\s*(.+?)(?:\s{2,}|\s*Tipo Cadastro|\n)/i);
  if (!name) return null;

  const cpf = grab(bloco, /N[ºo°]?\s*do\s*CPF:\s*([\d.\-\s]+?)(?:\s*RG|\n)/i);
  const cnpj = grab(bloco, /CNPJ\.?:?\s*([\d./\-\s]+?)(?:\s*IE|\n)/i);

  const cpfDigits = cpf ? onlyDigits(cpf) : "";
  const cnpjDigits = cnpj ? onlyDigits(cnpj) : "";

  /* O tipo vem dos dígitos, não do rótulo: no legado o campo "Tipo
     Cadastro" costuma estar em branco. */
  const isPJ = cnpjDigits.length === 14;
  const document = isPJ ? cnpj : cpfDigits.length === 11 ? cpf : null;

  const legacyCode = grab(bloco, /C[óo]digo\s+Cadastro:\s*(\d+)/i);
  const cadastro = grab(bloco, /Data\s+Cadastro:\s*([\d/]+)/i);

  const tradeName = grab(bloco, /Fantasia\.*:?\s*(.+?)(?:\s{2,}|\s*Sexo|\n)/i);

  const notesParts = [
    legacyCode ? `Importado do sistema antigo · código ${legacyCode}` : null,
    cadastro ? `Cadastro original: ${cadastro}` : null,
  ].filter(Boolean);

  /* Data do legado vem como dd/mm/aaaa (ou máscara vazia "  /  /    ") */
  const brDate = (v: string | null): string | null => {
    if (!v) return null;
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };

  /* O legado escreve por extenso; normalizamos para os valores do
     seletor. Qualquer coisa fora da lista fica nula em vez de sujar. */
  const civil = (v: string | null): string | null => {
    const t = String(v || "").toLowerCase();
    if (/solteir/.test(t)) return "solteiro";
    if (/casad/.test(t)) return "casado";
    if (/divorciad|separad/.test(t)) return "divorciado";
    if (/vi[úu]v/.test(t)) return "viuvo";
    if (/uni[ãa]o/.test(t)) return "uniao_estavel";
    return null;
  };

  return {
    legacyCode,
    name,
    tradeName: tradeName && tradeName !== name ? tradeName : null,
    document,
    type: isPJ ? "pj" : "pf",
    email: grab(bloco, /Email:\s*(\S+@\S+?)(?:\s|$)/i),
    phone: phone(grab(bloco, /Telefone:\s*(\([\d\s]*\)[\d\s\-]*)/i)),
    whatsapp: phone(grab(bloco, /Whatsapp:\s*(\([\d\s]*\)[\d\s\-]*)/i)),
    street: grab(bloco, /Endere[çc]o:\s*(.+?)(?:\s{2,}|\s*CPL|\n)/i),
    number: null, // o legado grava número junto do logradouro
    complement: grab(bloco, /CPL:\s*(.+?)(?:\s{2,}|\s*Bairro|\n)/i),
    district: grab(bloco, /Bairro\.*:?\s*(.+?)(?:\s{2,}|\s*Cidade|\n)/i),
    city: grab(bloco, /Cidade\.*:?\s*(.+?)(?:\s{2,}|\s*UF|\n)/i),
    state: grab(bloco, /\bUF:\s*([A-Za-z]{2})\b/i),
    cep: grab(bloco, /CEP:\s*([\d.\-]+)/i),
    rg: grab(bloco, /\bRG\.*:?\s*(.+?)(?:\s{2,}|\s*ORGAO|\n)/i),
    rgIssuer: grab(bloco, /ORGAO\.*:?\s*(.+?)(?:\s{2,}|\s*Data Nascimento|\n)/i),
    birthDate: brDate(grab(bloco, /Data\s+Nascimento:\s*([\d/\s]+)/i)),
    maritalStatus: civil(grab(bloco, /Estado Civil:\s*(.+?)(?:\s{2,}|\n)/i)),
    stateRegistration: grab(bloco, /\bIE\.*:?\s*(.+?)(?:\s{2,}|\s*IM|\n)/i),
    municipalRegistration: grab(bloco, /\bIM\.*:?\s*(.+?)(?:\s{2,}|\n)/i),
    contactName: isPJ ? grab(bloco, /Contato:\s*(.+?)(?:\s{2,}|\n)/i) : null,
    origin: "importacao",
    notes: notesParts.length ? notesParts.join("\n") : null,
  };
}

/** Lê o PDF e devolve todas as fichas reconhecidas. */
export async function parseCustomersPdf(buffer: ArrayBuffer): Promise<ParsedCustomer[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const raw = Array.isArray(text) ? text.join("\n") : text;

  return splitFichas(raw)
    .map(parseFicha)
    .filter((c): c is ParsedCustomer => c !== null);
}

/**
 * Grava as fichas no CRM.
 *
 * `dryRun` devolve o relatório sem tocar no banco — a tela sempre chama
 * assim primeiro, para o usuário conferir antes de confirmar.
 *
 * Deduplicação por documento (ignorando máscara). Cliente já existente
 * é ATUALIZADO apenas nos campos vazios: dado digitado no VTDIGITAL tem
 * precedência sobre o que veio do sistema antigo.
 */
export async function importCustomers(
  parsed: ParsedCustomer[],
  { dryRun = true }: { dryRun?: boolean } = {}
): Promise<ImportReport> {
  const issues: ImportIssue[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  /* documentos já cadastrados, normalizados */
  const existing = await db
    .select({ id: customers.id, name: customers.name, document: customers.document })
    .from(customers);
  const byDoc = new Map<string, { id: number; name: string }>();
  for (const c of existing) {
    const d = onlyDigits(c.document || "");
    if (d) byDoc.set(d, { id: c.id, name: c.name });
  }

  /* duplicatas dentro do próprio PDF */
  const seenInFile = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const c = parsed[i];
    const idx = i + 1;
    const docDigits = c.document ? onlyDigits(c.document) : "";

    if (!c.name || c.name.length < 2) {
      issues.push({ index: idx, name: c.name || "(sem nome)", reason: "Nome ausente ou muito curto" });
      skipped++;
      continue;
    }

    if (docDigits && !isValidDocument(c.document!, c.type)) {
      issues.push({
        index: idx,
        name: c.name,
        reason: `${c.type === "pj" ? "CNPJ" : "CPF"} inválido (${c.document}) — importado sem documento`,
      });
      c.document = null;
    }

    const validDoc = c.document ? onlyDigits(c.document) : "";

    if (validDoc && seenInFile.has(validDoc)) {
      issues.push({ index: idx, name: c.name, reason: "Ficha repetida no próprio PDF" });
      skipped++;
      continue;
    }
    if (validDoc) seenInFile.add(validDoc);

    const already = validDoc ? byDoc.get(validDoc) : undefined;

    if (dryRun) {
      if (already) updated++;
      else imported++;
      continue;
    }

    if (already) {
      /* completa só o que está em branco — nunca sobrescreve o CRM */
      await db.execute(sql`
        update customers set
          trade_name             = coalesce(nullif(trade_name, ''),             ${c.tradeName}),
          email                  = coalesce(nullif(email, ''),                  ${c.email}),
          phone                  = coalesce(nullif(phone, ''),                  ${c.phone}),
          whatsapp               = coalesce(nullif(whatsapp, ''),               ${c.whatsapp}),
          street                 = coalesce(nullif(street, ''),                 ${c.street}),
          complement             = coalesce(nullif(complement, ''),             ${c.complement}),
          district               = coalesce(nullif(district, ''),               ${c.district}),
          city                   = coalesce(nullif(city, ''),                   ${c.city}),
          state                  = coalesce(nullif(state, ''),                  ${c.state}),
          cep                    = coalesce(nullif(cep, ''),                    ${c.cep}),
          rg                     = coalesce(nullif(rg, ''),                     ${c.rg}),
          rg_issuer              = coalesce(nullif(rg_issuer, ''),              ${c.rgIssuer}),
          birth_date             = coalesce(birth_date,                         ${c.birthDate}::date),
          marital_status         = coalesce(nullif(marital_status, ''),         ${c.maritalStatus}),
          state_registration     = coalesce(nullif(state_registration, ''),     ${c.stateRegistration}),
          municipal_registration = coalesce(nullif(municipal_registration, ''), ${c.municipalRegistration}),
          contact_name           = coalesce(nullif(contact_name, ''),           ${c.contactName}),
          origin                 = coalesce(nullif(origin, ''),                 ${c.origin}),
          updated_at = now()
        where id = ${already.id}
      `);
      updated++;
      continue;
    }

    await db.insert(customers).values({
      type: c.type,
      name: c.name,
      tradeName: c.tradeName,
      document: c.document,
      email: c.email,
      phone: c.phone,
      whatsapp: c.whatsapp,
      street: c.street,
      number: c.number,
      complement: c.complement,
      district: c.district,
      city: c.city,
      state: c.state,
      cep: c.cep,
      rg: c.rg,
      rgIssuer: c.rgIssuer,
      birthDate: c.birthDate,
      maritalStatus: c.maritalStatus,
      stateRegistration: c.stateRegistration,
      municipalRegistration: c.municipalRegistration,
      contactName: c.contactName,
      origin: c.origin,
      notes: c.notes,
      status: "ativo",
    });
    imported++;
  }

  return {
    totalFichas: parsed.length,
    imported,
    updated,
    skipped,
    issues,
    preview: parsed.slice(0, 10),
  };
}
