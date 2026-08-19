/* Chat de acompanhamento — leitura das conversas para a tela do ERP.

   O envio NÃO passa por aqui: quem envia é o serviço do WhatsApp, via
   /api/whatsapp/enviar. Esta rota só lê. */
import { listarConversas, mensagensDe } from "@/lib/chat-whatsapp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fone = String(searchParams.get("fone") || "").trim();

  try {
    if (fone) {
      return Response.json({ ok: true, mensagens: await mensagensDe(fone) });
    }
    return Response.json({ ok: true, conversas: await listarConversas() });
  } catch (e) {
    console.error("[whatsapp-chat]", e);
    return Response.json({ error: "Não foi possível ler as conversas." }, { status: 500 });
  }
}
