/* ──────────────────────────────────────────────────────────────────
   Texto do lembrete de cobrança para WhatsApp.

   Mesma conduta de Pedidos/Orçamentos: o texto sai do catálogo
   editável (`lib/mensagens.ts`), que é server-only. A tela recebe
   pronto, mostra, deixa ajustar e envia pelo número da gráfica
   (com wa.me de reserva se o serviço estiver no chão).

   Só cobrança "pendente" faz sentido lembrar: link pago, cancelado
   ou expirado não tem a quem cobrar — o link expirado nem abre.
   ────────────────────────────────────────────────────────────────── */
import { db } from "@/db";
import { paymentLinks, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mensagem } from "@/lib/mensagens";
import { getPricingDefaults } from "@/lib/settings";
import { formatBRL } from "@/lib/money";
import { idValido } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** "15/09/2026" de um Date (timestamp) ou de "2026-09-15", sem fuso. */
function dataBR(iso: unknown): string {
  if (iso instanceof Date && !Number.isNaN(iso.getTime())) {
    return iso.toISOString().slice(0, 10).split("-").reverse().join("/");
  }
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
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

  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.id, id)).limit(1);
  if (!link) return Response.json({ error: "Cobrança não encontrada" }, { status: 404 });

  if (String(link.status || "") !== "pendente") {
    return Response.json(
      { error: "Só cobrança aguardando pagamento pode ser lembrada" },
      { status: 422 }
    );
  }

  const defaults = await getPricingDefaults();

  const cliente = link.customerId
    ? (await db.select().from(customers).where(eq(customers.id, Number(link.customerId))).limit(1))[0]
    : null;

  const primeiro = String(cliente?.name || "").trim().split(/\s+/)[0] || "";
  const m = await mensagem("cobranca.lembrete", {
    nome: primeiro,
    empresa: defaults.company_trade_name || defaults.company_legal_name || "",
    descricao: String(link.description || "cobrança"),
    valor: formatBRL(Number(link.amount || 0)),
    link: String(link.checkoutUrl || ""),
    validade: dataBR(link.expiresAt) || "confirmar",
  });

  return Response.json({
    ok: true,
    texto: m.texto,
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
