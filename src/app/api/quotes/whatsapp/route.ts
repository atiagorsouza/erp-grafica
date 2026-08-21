/* ──────────────────────────────────────────────────────────────────
   Texto do orçamento para WhatsApp.

   Por que uma rota, e não montar na tela: o texto sai do catálogo
   editável (`lib/mensagens.ts`), que é `server-only` — o navegador não
   pode lê-lo. Mesmo caminho já usado pelo pedido de cadastro.

   A tela recebe o texto pronto e só decide o que fazer com ele
   (mostrar na prévia, deixar editar, abrir o WhatsApp).
   ────────────────────────────────────────────────────────────────── */
import { db } from "@/db";
import { quotes, quoteItems, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mensagem } from "@/lib/mensagens";
import { getPricingDefaults } from "@/lib/settings";
import { formatBRL } from "@/lib/money";
import { idValido } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** "15/09/2026" a partir de "2026-09-15", sem passar pelo fuso do servidor. */
function dataBR(iso: unknown): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Quantidade sem casas inúteis: 2 em vez de 2,000. */
function qtdCurta(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "1";
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });

  const [orc] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!orc) return Response.json({ error: "Orçamento não encontrado" }, { status: 404 });

  const [itens, defaults] = await Promise.all([
    db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)),
    getPricingDefaults(),
  ]);

  const cliente = orc.customerId
    ? (await db.select().from(customers).where(eq(customers.id, Number(orc.customerId))).limit(1))[0]
    : null;

  /* A lista chega ao texto como UMA variável: o preenchimento de
     mensagens é troca simples de {chave} e não sabe montar lista.

     Formato pedido pelo dono: sem preço unitário item a item, só a
     descrição com a quantidade e o valor da linha. */
  const linhas = itens.map((i) => {
    const q = qtdCurta(i.quantity);
    const desc = String(i.description || "Item");
    const total = formatBRL(Number(i.total || 0));
    return `• ${q}× ${desc} — ${total}`;
  });

  const empresa = defaults.company_trade_name || defaults.company_name || "";
  const primeiroNome = String(cliente?.name || "").trim().split(/\s+/)[0] || "";

  const m = await mensagem("orcamento.enviar", {
    nome: primeiroNome,
    empresa,
    numero: String(orc.number || ""),
    itens: linhas.join("\n"),
    total: formatBRL(Number(orc.total || 0)),
    validade: dataBR(orc.validUntil) || "consultar",
  });

  return Response.json({
    ok: true,
    texto: m.texto,
    /* A tela precisa saber para quem mandar e se pode mandar. */
    cliente: cliente
      ? {
          nome: cliente.name,
          phone: cliente.phone,
          whatsapp: cliente.whatsapp,
          whatsappOptOut: cliente.whatsappOptOut,
        }
      : null,
  });
}
