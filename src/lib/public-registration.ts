import "server-only";

/* ──────────────────────────────────────────────────────────────────
   CADASTRO PÚBLICO — o que o cliente pode escrever sozinho.

   Esta camada existe por uma razão só: a página pública NÃO pode
   chamar `updateCustomer` com o corpo cru da requisição. Se chamasse,
   qualquer um com um link válido poderia mandar `status: "ativo"`,
   `creditLimit: 999999`, `tags`, `notes`, `whatsappOptOut` — campos
   comerciais que só o operador decide.

   Então: lista branca curta, e nada além dela atravessa.
   ────────────────────────────────────────────────────────────────── */

import { z } from "zod";
import { updateCustomer } from "@/lib/crm";

/* Só o que a nota fiscal exige, mais e-mail para mandar o documento.
   Cada campo a mais derruba a taxa de conclusão — decisão registrada
   na prévia aprovada pelo usuário. */
const publicSchema = z.object({
  type: z.enum(["pf", "pj"]),
  name: z.string().trim().min(3, "Escreva seu nome completo").max(180),
  tradeName: z.string().trim().max(180).optional(),
  document: z.string().trim().min(11, "Informe o CPF/CNPJ").max(32),
  email: z.string().trim().max(180).optional(),
  phone: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  cep: z.string().trim().max(12).optional(),
  street: z.string().trim().max(180).optional(),
  number: z.string().trim().max(30).optional(),
  complement: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
  /* PJ */
  stateRegistration: z.string().trim().max(60).optional(),
  /* PF */
  birthDate: z.string().trim().max(10).optional(),
});

export type CadastroPublico = z.infer<typeof publicSchema>;

export const CAMPOS_PUBLICOS = Object.keys(publicSchema.shape) as (keyof CadastroPublico)[];

/**
 * Aplica o formulário público sobre o cadastro existente.
 *
 * Nunca cria cliente: o link já aponta para um id. É isso que garante
 * a promessa de "atualiza o cadastro, não duplica".
 *
 * `status` vira "ativo" aqui e não pelo formulário — quem completou o
 * cadastro deixou de ser lead, e essa é uma decisão do sistema, não
 * um campo que o visitante manda.
 */
export async function salvarCadastroPublico(customerId: number, raw: unknown) {
  const parsed = publicSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: first?.message || "Confira os dados preenchidos",
      campo: first?.path?.[0] ? String(first.path[0]) : undefined,
      status: 400 as const,
    };
  }

  const d = parsed.data;

  /* Campos vazios não devem apagar o que já existe no cadastro. O
     cliente que não digitou complemento não está pedindo para limpar
     o complemento — está só não digitando. */
  const patch: Record<string, unknown> = { status: "ativo" };
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string" && v.trim() === "") continue;
    patch[k] = v;
  }

  /* O telefone do link é a verdade sobre o WhatsApp: veio da conversa
     real. Se o cliente digitou outro, respeitamos — mas garantimos que
     um dos dois exista. */
  if (!patch.whatsapp && patch.phone) patch.whatsapp = patch.phone;

  const result = await updateCustomer(customerId, patch);
  if ("error" in result) {
    return { error: result.error, status: result.status as number };
  }
  return { ok: true as const, row: result.row };
}
