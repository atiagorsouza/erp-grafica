/* Chat de acompanhamento — leitura das conversas para a tela do ERP.

   O envio NÃO passa por aqui: quem envia é o serviço do WhatsApp, via
   /api/whatsapp/enviar. Esta rota só lê. */
import { listarConversas, mensagensDe, fichaDoCliente, cadastrarDoChat } from "@/lib/chat-whatsapp";
import { listarMensagens } from "@/lib/mensagens";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fone = String(searchParams.get("fone") || "").trim();
  const ficha = Number(searchParams.get("ficha") || 0);

  try {
    /* Respostas rápidas do chat: vêm do mesmo catálogo editável das
       outras mensagens, então mudar o texto no Painel muda o atalho. */
    if (searchParams.get("rapidas")) {
      const todas = await listarMensagens();
      return Response.json({
        ok: true,
        rapidas: todas
          .filter((m) => m.grupo === "rapidas" && m.ativa)
          .map((m) => ({ slug: m.slug, titulo: m.titulo, texto: m.texto })),
      });
    }

    /* Ficha do cliente: quem é, quanto já comprou, o que está em
       produção. Pedida à parte para não pesar o polling do chat, que
       roda a cada 6 segundos. */
    if (ficha > 0) {
      const dados = await fichaDoCliente(ficha);
      if (!dados) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });
      return Response.json({ ok: true, ficha: dados });
    }

    if (fone) {
      /* `limite` permite ao botão "ver anteriores" pedir mais fundo no
         histórico sem que a carga inicial traga a conversa inteira. */
      const bruto = Number(searchParams.get("limite") || 30);
      const limite = Number.isFinite(bruto) ? bruto : 30;
      const r = await mensagensDe(fone, limite);
      return Response.json({ ok: true, ...r });
    }

    return Response.json({ ok: true, conversas: await listarConversas() });
  } catch (e) {
    console.error("[whatsapp-chat]", e);
    return Response.json({ error: "Não foi possível ler as conversas." }, { status: 500 });
  }
}

/* Cadastro direto do chat (ficha 360º): conversa "sem cadastro" vira
   cliente sem sair do WhatsApp. Nome da conversa pré-preenche, telefone
   E164 identifica. Cliente já existente não duplica — só vincula. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (String(body.op || "") !== "cadastrar") {
    return Response.json({ error: "op inválida" }, { status: 400 });
  }
  try {
    const r = await cadastrarDoChat(String(body.nome || ""), String(body.phoneE164 || ""));
    if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
    return Response.json(r);
  } catch (e) {
    console.error("[whatsapp-chat:cadastrar]", e);
    return Response.json({ error: "Falha ao cadastrar o cliente." }, { status: 500 });
  }
}
