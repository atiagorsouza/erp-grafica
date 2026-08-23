/* Cadastro de vendedores e extrato de comissão. */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sellers } from "@/db/schema";
import { formatCPF, formatPhone, isValidCPF, isValidEmail, onlyDigits } from "@/lib/validators";
import {
  extratoDoVendedor,
  listarVendedores,
  nomesSoltos,
  resumoDeComissoes,
} from "@/lib/comissao";
import { toDecimalString } from "@/lib/money";
import { idValido } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  nickname: z.string().trim().max(40).nullable().optional(),
  document: z.string().trim().max(30).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  /* Teto de 100% é proposital: acima disso é erro de digitação
     (alguém escrevendo 300 achando que são centavos), e comissão maior
     que a margem faz o sistema pagar para vender. */
  commissionRate: z.coerce.number().min(0, "Comissão não pode ser negativa").max(100, "Comissão acima de 100%"),
  active: z.coerce.boolean().default(true),
  notes: z.string().trim().max(500).nullable().optional(),
});

const vazio = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/** GET — lista, extrato de um vendedor, ou resumo de todos. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const extrato = Number(searchParams.get("extrato") || 0);
  const de = String(searchParams.get("de") || "").slice(0, 10);
  const ate = String(searchParams.get("ate") || "").slice(0, 10);
  const periodoOk = /^\d{4}-\d{2}-\d{2}$/.test(de) && /^\d{4}-\d{2}-\d{2}$/.test(ate);

  try {
    if (extrato > 0) {
      if (!periodoOk) {
        return Response.json({ error: "Informe o período (de e até)." }, { status: 400 });
      }
      const r = await extratoDoVendedor(extrato, de, ate);
      if (!r) return Response.json({ error: "Vendedor não encontrado" }, { status: 404 });
      return Response.json({ ok: true, extrato: r });
    }

    if (searchParams.get("resumo")) {
      if (!periodoOk) {
        return Response.json({ error: "Informe o período (de e até)." }, { status: 400 });
      }
      return Response.json({ ok: true, resumo: await resumoDeComissoes(de, ate) });
    }

    return Response.json({
      ok: true,
      vendedores: await listarVendedores(searchParams.get("todos") ? false : true),
      /* Nomes que já existem em pedidos antigos mas nunca foram
         cadastrados — a tela oferece "cadastrar este". */
      soltos: await nomesSoltos(),
    });
  } catch (e) {
    console.error("[sellers:GET]", e);
    return Response.json({ error: "Não foi possível ler os vendedores." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "JSON inválido" }, { status: 400 });

  const op = String(body.op || "");
  const id = Number(body.id);
  const data = body.data || {};

  try {
    if (op === "create" || op === "update") {
      const parsed = schema.safeParse(data);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return Response.json(
          { error: first ? first.message : "Dados inválidos" },
          { status: 400 }
        );
      }
      const d = parsed.data;
      /* A API valida por conta própria: o formulário não é a única
         porta de entrada. Dado sujo aqui contamina o extrato depois. */
      if (d.email && !isValidEmail(d.email)) {
        return Response.json({ error: "E-mail inválido", campo: "email" }, { status: 422 });
      }
      if (d.document && !isValidCPF(onlyDigits(d.document))) {
        return Response.json({ error: "CPF inválido", campo: "document" }, { status: 422 });
      }
      const linha = {
        name: d.name,
        nickname: vazio(d.nickname),
        document: d.document ? formatCPF(d.document) : null,
        phone: d.phone ? formatPhone(d.phone) : null,
        email: d.email ? d.email.trim().toLowerCase() : null,
        commissionRate: toDecimalString(d.commissionRate, 3),
        active: d.active,
        notes: vazio(d.notes),
      };

      if (op === "update") {
        if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
        const [row] = await db.update(sellers).set(linha).where(eq(sellers.id, id)).returning();
        if (!row) return Response.json({ error: "Vendedor não encontrado" }, { status: 404 });
        return Response.json({ ok: true, row });
      }

      const [row] = await db.insert(sellers).values(linha).returning();
      return Response.json({ ok: true, row });
    }

    /* Vendedor não se apaga: os pedidos dele apontam para o cadastro e
       o extrato antigo tem de continuar somando. Desativar tira das
       listas e preserva o histórico. */
    if (op === "delete" || op === "archive") {
      if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const [row] = await db
        .update(sellers)
        .set({ active: false })
        .where(eq(sellers.id, id))
        .returning();
      if (!row) return Response.json({ error: "Vendedor não encontrado" }, { status: 404 });
      return Response.json({ ok: true, row, archived: true });
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[sellers:POST]", e);
    return Response.json({ error: "Não foi possível salvar o vendedor." }, { status: 500 });
  }
}
