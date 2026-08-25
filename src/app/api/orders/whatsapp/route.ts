/* ──────────────────────────────────────────────────────────────────
   Texto de andamento do pedido para WhatsApp.

   Igual ao de orçamento: o texto sai do catálogo editável
   (`lib/mensagens.ts`), que é `server-only`. A tela recebe pronto e
   só decide o que fazer com ele.

   O botão da tela de Pedidos mandava a ORDEM DE PRODUÇÃO para o
   cliente — status cru ("aguardando", "em_producao"), que é papel
   interno. Quem comprou quer saber outra coisa: em que pé está,
   quando fica pronto, quanto é.
   ────────────────────────────────────────────────────────────────── */
import { db } from "@/db";
import { orders, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mensagem } from "@/lib/mensagens";
import { getPricingDefaults } from "@/lib/settings";
import { formatBRL } from "@/lib/money";
import { idValido } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** "15/09/2026" a partir de "2026-09-15", sem passar pelo fuso. */
function dataBR(iso: unknown): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/* Status técnico → frase que o cliente entende. "em_producao" no
   WhatsApp de alguém que não trabalha na gráfica não diz nada. */
const SITUACAO: Record<string, string> = {
  aguardando: "na fila de produção",
  aguardando_arte: "aguardando a aprovação da arte",
  em_producao: "em produção",
  em_acabamento: "em acabamento",
  pronto: "pronto para retirada",
  entregue: "entregue",
  concluido: "concluído",
  cancelado: "cancelado",
};

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!idValido(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });

  const [ped] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!ped) return Response.json({ error: "Pedido não encontrado" }, { status: 404 });

  const defaults = await getPricingDefaults();

  const cliente = ped.customerId
    ? (await db.select().from(customers).where(eq(customers.id, Number(ped.customerId))).limit(1))[0]
    : null;

  const primeiro = String(cliente?.name || "").trim().split(/\s+/)[0] || "";
  const producao = String(ped.productionStatus || "");
  const situacao =
    ped.status === "cancelado"
      ? "cancelado"
      : SITUACAO[producao] || SITUACAO[String(ped.status)] || "em andamento";

  /* Pedido pronto tem mensagem própria: é a notícia que o cliente
     mais espera e merece um texto de comemoração, não de relatório. */
  const slug = producao === "pronto" ? "pedido.pronto" : "pedido.andamento";

  const m = await mensagem(slug, {
    nome: primeiro,
    empresa: defaults.company_trade_name || defaults.company_legal_name || "",
    numero: String(ped.number || ""),
    situacao,
    total: formatBRL(Number(ped.total || 0)),
    prazo: dataBR(ped.dueDate) || "a combinar",
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
