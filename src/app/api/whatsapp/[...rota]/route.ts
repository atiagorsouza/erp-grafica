/* ──────────────────────────────────────────────────────────────────
   Ponte entre o ERP e o serviço WhatsApp.

   O serviço roda em processo separado (services/whatsapp) escutando
   só em 127.0.0.1. O navegador do usuário NÃO alcança essa porta —
   nem deve. Este proxy é o único caminho.

   Também é aqui que o token fica: guardado no servidor, nunca
   entregue ao navegador.
   ────────────────────────────────────────────────────────────────── */
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BASE = process.env.WA_SERVICE_URL || "http://127.0.0.1:3101";
const TOKEN = process.env.WA_TOKEN || "";

/* Cada rota com os métodos que o SERVIÇO realmente trata.

   Antes era um Set de nomes e o proxy repassava GET e POST para
   qualquer um deles. O serviço, que só tem POST em /pausar, respondia
   "rota não encontrada" — e o usuário via esse toast vermelho ao
   desligar o bot, mesmo com a ação funcionando.

   A causa: o Next pré-busca rotas com GET. Bastava a tela tocar em
   /pausar fora de um clique para o erro aparecer do nada.

   Agora o proxy sabe o método certo e recusa antes de incomodar o
   serviço — com uma mensagem que diz o que houve. */
const PERMITIDAS: Record<string, ("GET" | "POST")[]> = {
  status:      ["GET"],
  qr:          ["GET"],
  eventos:     ["GET"],
  saude:       ["GET"],
  enviar:      ["POST"],
  assumir:     ["POST"],
  devolver:    ["POST"],
  reiniciar:   ["POST"],
  desconectar: ["POST"],
  /* v3.53.0 — desligar o bot sem derrubar a sessão do WhatsApp. */
  pausar:      ["POST"],
  retomar:     ["POST"],
  ausencia:    ["POST"],
};

function cabecalhos(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { ...extra };
  if (TOKEN) h["x-wa-token"] = TOKEN;
  return h;
}

async function repassar(req: NextRequest, rota: string[]) {
  const caminho = rota.join("/");
  const metodos = PERMITIDAS[rota[0]];
  if (!metodos) {
    return Response.json({ erro: "rota não permitida" }, { status: 404 });
  }
  if (!metodos.includes(req.method as "GET" | "POST")) {
    /* 405 e não 404: a rota existe, o método é que está errado. E o
       Next pré-busca com GET — devolver 404 aqui vira toast de erro
       na cara do usuário sem que ele tenha feito nada. */
    return Response.json(
      { erro: `${rota[0]} aceita apenas ${metodos.join(", ")}` },
      { status: 405, headers: { Allow: metodos.join(", ") } }
    );
  }

  const alvo = `${BASE}/${caminho}`;

  try {
    /* SSE precisa de tratamento próprio: a resposta não termina, é um
       fluxo. Repassamos o corpo direto, sem bufferizar. */
    if (rota[0] === "eventos") {
      const r = await fetch(alvo, { headers: cabecalhos(), signal: req.signal });
      return new Response(r.body, {
        status: r.status,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      });
    }

    const corpo = req.method === "POST" ? await req.text() : undefined;
    const r = await fetch(alvo, {
      method: req.method,
      headers: cabecalhos(corpo ? { "content-type": "application/json" } : {}),
      body: corpo,
      signal: AbortSignal.timeout(20_000),
    });

    const texto = await r.text();
    return new Response(texto, {
      status: r.status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    /* Serviço fora do ar é a situação mais comum — e a mensagem
       precisa dizer o que fazer, não só "erro". */
    const msg = (e as Error).message || "";
    const caiu = msg.includes("ECONNREFUSED") || msg.includes("fetch failed");
    return Response.json(
      {
        erro: caiu
          ? "O serviço do WhatsApp não está rodando."
          : `Falha ao falar com o serviço: ${msg}`,
        dica: caiu
          ? "Inicie com: cd services/whatsapp && npm start (ou pm2 start printflow-whatsapp)"
          : undefined,
        offline: caiu,
      },
      { status: 503 }
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ rota: string[] }> }) {
  const { rota } = await ctx.params;
  return repassar(req, rota);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ rota: string[] }> }) {
  const { rota } = await ctx.params;
  return repassar(req, rota);
}
