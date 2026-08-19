import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { crmActivities, crmLeads, customers } from "@/db/schema";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import {
  formatCEP,
  formatCNPJ,
  formatCPF,
  formatPhone,
  isValidCEP,
  isValidDocument,
  isValidEmail,
  onlyDigits,
} from "@/lib/validators";
import { phoneKey } from "@/lib/phone";
import { todayISO } from "@/lib/period";

export type CrmError = { error: string; status: number; details?: unknown };

const customerSchema = z.object({
  type: z.enum(["pf", "pj"]).default("pf"),
  name: z.string().trim().min(2, "Nome obrigatório").max(180),
  tradeName: z.string().trim().max(180).nullable().optional(),
  document: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().max(180).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  secondaryPhone: z.string().trim().max(40).nullable().optional(),
  website: z.string().trim().max(180).nullable().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactRole: z.string().trim().max(80).nullable().optional(),
  cep: z.string().trim().max(12).nullable().optional(),
  street: z.string().trim().max(180).nullable().optional(),
  number: z.string().trim().max(30).nullable().optional(),
  complement: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(2).nullable().optional(),
  rg: z.string().trim().max(40).nullable().optional(),
  rgIssuer: z.string().trim().max(40).nullable().optional(),
  birthDate: z.string().trim().nullable().optional(),
  gender: z.string().trim().max(40).nullable().optional(),
  maritalStatus: z.string().trim().max(40).nullable().optional(),
  stateRegistration: z.string().trim().max(60).nullable().optional(),
  municipalRegistration: z.string().trim().max(60).nullable().optional(),
  legalNature: z.string().trim().max(100).nullable().optional(),
  taxRegime: z.string().trim().max(100).nullable().optional(),
  companySize: z.string().trim().max(40).nullable().optional(),
  foundedAt: z.string().trim().nullable().optional(),
  origin: z.string().trim().max(60).nullable().optional(),
  whatsappOptOut: z.coerce.boolean().optional(),
  /* Marketing tem consentimento próprio (v3.54.0): quem aceita receber
     "seu pedido está pronto" não aceitou receber promoção. */
  marketingOptIn: z.coerce.boolean().optional(),
  status: z.enum(["lead", "ativo", "inativo", "bloqueado"]).default("lead"),
  creditLimit: z.coerce.number().finite().min(0).max(999999999).optional(),
  tags: z.string().trim().max(300).nullable().optional(),
  notes: z.string().trim().max(1500).nullable().optional(),
  /* Cadastro rápido do PDV (F8) grava só nome e telefone no meio da
     venda: exigir documento ali travaria a fila do balcão. A tela de
     Clientes & CRM não envia esta flag, então lá o documento é
     obrigatório. */
  quickEntry: z.coerce.boolean().optional(),
});

const leadSchema = z.object({
  customerId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().trim().min(2, "Título obrigatório").max(180),
  column: z.enum(["novo", "qualificacao", "orcamento", "negociacao", "ganho", "perdido"]).default("novo"),
  source: z.enum(["balcao", "instagram", "site", "indicacao", "google", "facebook", "marketplace", "outro"]).default("balcao"),
  owner: z.string().trim().max(100).nullable().optional(),
  expectedValue: z.coerce.number().finite().min(0).max(999999999).optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
  lastContactAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(1500).nullable().optional(),
  lostReason: z.string().trim().max(500).nullable().optional(),
});

const activitySchema = z.object({
  customerId: z.coerce.number().int().positive().nullable().optional(),
  leadId: z.coerce.number().int().positive().nullable().optional(),
  type: z.enum(["nota", "ligacao", "reuniao", "tarefa", "visita", "proposta"]).default("nota"),
  title: z.string().trim().min(2, "Título obrigatório").max(180),
  description: z.string().trim().max(1500).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
});

function parse<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | CrmError {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first ? `${first.path.join(".") || "dados"}: ${first.message}` : "Dados inválidos",
      status: 400,
      details: parsed.error.flatten(),
    };
  }
  return { ok: true, data: parsed.data };
}

function nullable(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function normalizeCustomer(data: z.infer<typeof customerSchema>) {
  const docDigits = onlyDigits(data.document || "");
  const phone = data.phone ? formatPhone(data.phone) : null;
  const whatsapp = data.whatsapp ? formatPhone(data.whatsapp) : null;
  const secondaryPhone = data.secondaryPhone ? formatPhone(data.secondaryPhone) : null;
  const cep = data.cep ? formatCEP(data.cep) : null;

  return {
    type: data.type,
    name: data.name.trim(),
    tradeName: nullable(data.tradeName),
    document: docDigits ? (data.type === "pj" ? formatCNPJ(docDigits) : formatCPF(docDigits)) : null,
    email: data.email ? data.email.trim().toLowerCase() : null,
    phone,
    whatsapp,
    secondaryPhone,
    /* Chave canônica para o WhatsApp encontrar este cliente. O campo
       whatsapp tem prioridade — é o número que a pessoa realmente usa.
       Se não der para reconhecer, fica null: melhor sem chave do que
       com chave errada apontando para outra pessoa. */
    phoneE164: phoneKey(data.whatsapp || data.phone || data.secondaryPhone || ""),
    website: nullable(data.website),
    contactName: nullable(data.contactName),
    contactRole: nullable(data.contactRole),
    cep,
    street: nullable(data.street),
    number: nullable(data.number),
    complement: nullable(data.complement),
    district: nullable(data.district),
    city: nullable(data.city),
    state: data.state ? data.state.trim().toUpperCase().slice(0, 2) : null,
    rg: nullable(data.rg),
    rgIssuer: nullable(data.rgIssuer),
    birthDate: nullable(data.birthDate),
    gender: nullable(data.gender),
    maritalStatus: nullable(data.maritalStatus),
    stateRegistration: nullable(data.stateRegistration),
    municipalRegistration: nullable(data.municipalRegistration),
    legalNature: nullable(data.legalNature),
    taxRegime: nullable(data.taxRegime),
    companySize: nullable(data.companySize),
    foundedAt: nullable(data.foundedAt),
    origin: nullable(data.origin),
    whatsappOptOut: data.whatsappOptOut ?? false,
    marketingOptIn: data.marketingOptIn ?? false,
    /* Carimba quando o consentimento é dado, não a cada salvamento. */
    ...(data.marketingOptIn
      ? { marketingOptInAt: new Date(), marketingOptInSource: "cadastro" }
      : { marketingOptInAt: null, marketingOptInSource: null }),
    status: data.status,
    creditLimit: String(data.creditLimit ?? 0),
    tags: nullable(data.tags),
    notes: nullable(data.notes),
    updatedAt: new Date(),
  };
}

async function validateCustomer(data: z.infer<typeof customerSchema>, ignoreId?: number) {
  /* O tipo (pf/pj) tem default "pf". Um CNPJ correto enviado sem marcar
     PJ era validado como CPF e recusado com "CPF inválido" — mensagem
     que não ajuda quem digitou o documento certo. A contagem de dígitos
     é uma evidência melhor que o seletor: 14 = CNPJ, 11 = CPF. */
  if (data.document) {
    const len = onlyDigits(data.document).length;
    if (len === 14 && data.type !== "pj") data.type = "pj";
    else if (len === 11 && data.type !== "pf") data.type = "pf";
  }

  /* Documento obrigatório no cadastro completo. O cadastro rápido do
     PDV (quickEntry) segue liberado: exigir CPF no balcão travaria a
     venda. Clientes antigos sem documento continuam válidos — a regra
     só vale para o que passa por aqui. */
  if (!data.quickEntry && !onlyDigits(data.document || "")) {
    return {
      error: data.type === "pj" ? "CNPJ é obrigatório" : "CPF é obrigatório",
      status: 422,
    } satisfies CrmError;
  }

  if (data.document && !isValidDocument(data.document, data.type)) {
    return { error: data.type === "pj" ? "CNPJ inválido" : "CPF inválido", status: 422 } satisfies CrmError;
  }
  if (data.email && !isValidEmail(data.email)) {
    return { error: "E-mail inválido", status: 422 } satisfies CrmError;
  }
  /* Datas em branco chegam como "" e o Postgres recusa: normalizamos
     para null. Também barramos nascimento/fundação no futuro. */
  for (const [campo, rotulo] of [
    ["birthDate", "Data de nascimento"],
    ["foundedAt", "Data de fundação"],
  ] as const) {
    const v = (data as Record<string, unknown>)[campo];
    if (typeof v === "string" && v.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
        return { error: `${rotulo} inválida`, status: 422 } satisfies CrmError;
      }
      if (v.trim() > todayISO()) {
        return { error: `${rotulo} não pode ser no futuro`, status: 422 } satisfies CrmError;
      }
    }
  }
  if (data.cep && onlyDigits(data.cep).length > 0 && !isValidCEP(data.cep)) {
    return { error: "CEP inválido", status: 422 } satisfies CrmError;
  }

  const docDigits = onlyDigits(data.document || "");
  if (docDigits) {
    const [dupe] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(sql`regexp_replace(coalesce(${customers.document}, ''), '\\D', '', 'g') = ${docDigits}`)
      .limit(1);
    if (dupe && dupe.id !== ignoreId) {
      return { error: `Documento já cadastrado para ${dupe.name}`, status: 409 } satisfies CrmError;
    }
  }

  if (data.email) {
    const [dupe] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(ilike(customers.email, data.email.trim()))
      .limit(1);
    if (dupe && dupe.id !== ignoreId) {
      return { error: `E-mail já cadastrado para ${dupe.name}`, status: 409 } satisfies CrmError;
    }
  }

  /* Telefone duplicado: compara pela forma canônica, então
     "(21) 98888-7777", "21988887777" e "+5521988887777" colidem entre
     si. Diz QUEM já tem o número — quem está no balcão precisa saber
     se é o mesmo cliente voltando ou um homônimo. O índice único cobre
     a corrida; isto aqui cobre a clareza. */
  const chave = phoneKey(data.whatsapp || data.phone || data.secondaryPhone || "");
  if (chave) {
    const [dupe] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.phoneE164, chave))
      .limit(1);
    if (dupe && dupe.id !== ignoreId) {
      return { error: `Telefone já cadastrado para ${dupe.name}`, status: 409 } satisfies CrmError;
    }
  }

  return null;
}

export async function createCustomer(raw: unknown) {
  const parsed = parse(customerSchema, raw);
  if ("error" in parsed) return parsed;
  const validation = await validateCustomer(parsed.data);
  if (validation) return validation;
  try {
    const [row] = await db.insert(customers).values(normalizeCustomer(parsed.data)).returning();
    return { ok: true as const, row };
  } catch (e) {
    return duplicataOuErro(e);
  }
}

/* Os índices únicos são a última linha de defesa contra duplicata: a
   validação anterior é SELECT-depois-INSERT, e duas requisições
   simultâneas passam as duas. Quando o banco recusa, devolvemos 409
   com uma frase que o operador entende — sem isso vira 500 e parece
   que o sistema quebrou. */
function duplicataOuErro(e: unknown): CrmError {
  const err = e as { code?: string; constraint?: string };
  if (err?.code === "23505") {
    if (err.constraint === "customers_phone_e164_unique_idx") {
      return {
        error: "Já existe um cliente com este telefone.",
        status: 409,
      } satisfies CrmError;
    }
    if (err.constraint === "customers_document_unique_idx") {
      return {
        error: "Já existe um cliente com este CPF/CNPJ.",
        status: 409,
      } satisfies CrmError;
    }
    return { error: "Registro duplicado.", status: 409 } satisfies CrmError;
  }
  throw e;
}

export async function updateCustomer(id: number, raw: unknown) {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) return { error: "Cliente não encontrado", status: 404 } satisfies CrmError;

  const merged = { ...existing, ...(raw as object) };
  const parsed = parse(customerSchema, merged);
  if ("error" in parsed) return parsed;
  const validation = await validateCustomer(parsed.data, id);
  if (validation) return validation;

  try {
    const [row] = await db
      .update(customers)
      .set(normalizeCustomer(parsed.data))
      .where(eq(customers.id, id))
      .returning();
    return { ok: true as const, row };
  } catch (e) {
    return duplicataOuErro(e);
  }
}

export async function archiveCustomer(id: number, reason = "Arquivado pelo CRM") {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) return { error: "Cliente não encontrado", status: 404 } satisfies CrmError;
  const notes = [existing.notes, `ARQUIVADO: ${reason}`].filter(Boolean).join("\n");
  const [row] = await db
    .update(customers)
    .set({ status: "inativo", notes, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning();
  return { ok: true as const, row };
}

export async function createLead(raw: unknown) {
  const parsed = parse(leadSchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  if (d.customerId) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, d.customerId)).limit(1);
    if (!customer) return { error: "Cliente vinculado não encontrado", status: 422 } satisfies CrmError;
  }
  const [row] = await db
    .insert(crmLeads)
    .values({
      customerId: d.customerId || null,
      title: d.title,
      column: d.column,
      source: d.source,
      owner: nullable(d.owner),
      expectedValue: String(d.expectedValue ?? 0),
      probability: d.probability ?? 10,
      nextActionAt: d.nextActionAt ? new Date(d.nextActionAt) : null,
      lastContactAt: d.lastContactAt ? new Date(d.lastContactAt) : null,
      notes: nullable(d.notes),
      lostReason: nullable(d.lostReason),
    })
    .returning();
  return { ok: true as const, row };
}

export async function updateLead(id: number, raw: unknown) {
  const [existing] = await db.select().from(crmLeads).where(eq(crmLeads.id, id)).limit(1);
  if (!existing) return { error: "Oportunidade não encontrada", status: 404 } satisfies CrmError;
  const merged = { ...existing, ...(raw as object) };
  const parsed = parse(leadSchema, merged);
  if ("error" in parsed) return parsed;
  const d = parsed.data;

  const [row] = await db
    .update(crmLeads)
    .set({
      customerId: d.customerId || null,
      title: d.title,
      column: d.column,
      source: d.source,
      owner: nullable(d.owner),
      expectedValue: String(d.expectedValue ?? 0),
      probability: d.probability ?? 10,
      nextActionAt: d.nextActionAt ? new Date(d.nextActionAt) : null,
      lastContactAt: d.lastContactAt ? new Date(d.lastContactAt) : new Date(),
      notes: nullable(d.notes),
      lostReason: d.column === "perdido" ? nullable(d.lostReason) || "Marcado como perdido" : nullable(d.lostReason),
      updatedAt: new Date(),
    })
    .where(eq(crmLeads.id, id))
    .returning();

  if (row.customerId && row.column === "ganho") {
    await db.update(customers).set({ status: "ativo", updatedAt: new Date() }).where(eq(customers.id, row.customerId));
  }

  return { ok: true as const, row };
}

export async function archiveLead(id: number, reason = "Arquivado") {
  return updateLead(id, { column: "perdido", lostReason: reason });
}

export async function createActivity(raw: unknown) {
  const parsed = parse(activitySchema, raw);
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  if (!d.customerId && !d.leadId) {
    return { error: "Informe cliente ou oportunidade", status: 422 } satisfies CrmError;
  }

  const [row] = await db
    .insert(crmActivities)
    .values({
      customerId: d.customerId || null,
      leadId: d.leadId || null,
      type: d.type,
      title: d.title,
      description: nullable(d.description),
      dueAt: d.dueAt ? new Date(d.dueAt) : null,
      completedAt: d.completedAt ? new Date(d.completedAt) : null,
    })
    .returning();

  if (row.leadId) {
    await db.update(crmLeads).set({ lastContactAt: new Date(), updatedAt: new Date() }).where(eq(crmLeads.id, row.leadId));
  }

  return { ok: true as const, row };
}

export async function updateActivity(id: number, raw: unknown) {
  const [existing] = await db.select().from(crmActivities).where(eq(crmActivities.id, id)).limit(1);
  if (!existing) return { error: "Atividade não encontrada", status: 404 } satisfies CrmError;
  const parsed = parse(activitySchema, { ...existing, ...(raw as object) });
  if ("error" in parsed) return parsed;
  const d = parsed.data;
  const [row] = await db
    .update(crmActivities)
    .set({
      customerId: d.customerId || null,
      leadId: d.leadId || null,
      type: d.type,
      title: d.title,
      description: nullable(d.description),
      dueAt: d.dueAt ? new Date(d.dueAt) : null,
      completedAt: d.completedAt ? new Date(d.completedAt) : null,
    })
    .where(eq(crmActivities.id, id))
    .returning();
  return { ok: true as const, row };
}
