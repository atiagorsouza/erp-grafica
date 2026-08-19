/* ──────────────────────────────────────────────────────────────────
   Rota INTERNA (usada pelo CRM) para gerar / enviar / cancelar o link
   de cadastro público.

   Quem manda é o operador. O bot não gera link sozinho — esta rota só
   existe atrás da tela, e o WhatsApp é acionado por ela, nunca o
   contrário.
   ────────────────────────────────────────────────────────────────── */
import { db } from "@/db";
import { customers, registrationLinks, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { phoneKey } from "@/lib/phone";
import {
  cancelarLink,
  criarLinkCadastro,
  marcarEnviado,
  VALIDADE_DIAS,
} from "@/lib/registration-links";
import { getPricingDefaults } from "@/lib/settings";
import { isWhatsAppBlocked, whatsappNumber } from "@/lib/validators";

export const dynamic = "force-dynamic";

const WA_BASE = process.env.WA_SERVICE_URL || "http://127.0.0.1:3101";
const WA_TOKEN = process.env.WA_TOKEN || "";

/** URL pública do sistema. Sem ela o link gerado não serve para nada,
 *  então falhamos alto em vez de mandar "undefined/cadastro/xxx". */
async function baseUrl(req: Request): Promise<string> {
  /* `getPricingDefaults` não expõe `app_base_url` — a chave existe no
     Painel (grupo InfinitePay) mas não no tipo. Lemos direto. */
  let doPainel = String(process.env.APP_BASE_URL || "").trim();
  if (!doPainel) {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "app_base_url"))
      .limit(1);
    doPainel = String(row?.value || "").trim();
  }
  if (doPainel) return doPainel.replace(/\/+$/, "");
  /* Fallback: o host pelo qual o operador chegou. `req.url` traria o
     bind do servidor ("0.0.0.0:3000"), que não abre em celular nenhum
     — o cabeçalho Host é o endereço que o navegador realmente usou. */
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

function mensagemPadrao(nome: string, url: string, empresa: string) {
  const primeiro = String(nome || "").trim().split(/\s+/)[0] || "";
  return [
    primeiro ? `Oi, ${primeiro}!` : "Oi!",
    "",
    `Para emitir seu orçamento e a nota fiscal, preciso do seu cadastro completo. Leva 1 minuto:`,
    url,
    "",
    `Já deixei seu nome e telefone preenchidos. O link vale ${VALIDADE_DIAS} dias.`,
    "",
    empresa ? `— ${empresa}` : "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "criar");
  const customerId = Number(body.customerId);

  try {
    if (op === "cancelar") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) return Response.json({ error: "id obrigatório" }, { status: 400 });
      const row = await cancelarLink(id);
      if (!row) return Response.json({ error: "Link não encontrado" }, { status: 404 });
      return Response.json({ ok: true, row });
    }

    if (!Number.isFinite(customerId)) {
      return Response.json({ error: "customerId obrigatório" }, { status: 400 });
    }

    const [cliente] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!cliente) return Response.json({ error: "Cliente não encontrado" }, { status: 404 });

    /* Reaproveita o link que a prévia já gerou. Sem isso, "gerar
       prévia + enviar" criaria dois tokens e o primeiro (já visto pelo
       operador na tela) morreria ao ser revogado pelo segundo. */
    let criado: Awaited<ReturnType<typeof criarLinkCadastro>>;
    const linkId = Number(body.linkId);
    if (Number.isFinite(linkId)) {
      const [existente] = await db
        .select()
        .from(registrationLinks)
        .where(eq(registrationLinks.id, linkId))
        .limit(1);
      if (
        existente &&
        existente.customerId === customerId &&
        ["pendente", "aberto"].includes(existente.status) &&
        existente.expiresAt.getTime() > Date.now()
      ) {
        criado = { ok: true as const, row: existente };
      } else {
        criado = await criarLinkCadastro(customerId, { sentVia: "whatsapp" });
      }
    } else {
      criado = await criarLinkCadastro(customerId, {
        createdBy: String(body.createdBy || "").slice(0, 80) || undefined,
        sentVia: op === "enviar" ? "whatsapp" : "copiado",
      });
    }
    if ("error" in criado) {
      return Response.json({ error: criado.error }, { status: criado.status });
    }

    const base = await baseUrl(req);
    const url = `${base}/cadastro/${criado.row.token}`;
    const cfg = await getPricingDefaults().catch(() => null);
    const empresa = cfg?.company_trade_name || cfg?.company_name || "";
    const mensagem = String(body.mensagem || "").trim() || mensagemPadrao(cliente.name, url, empresa);

    /* "criar" apenas devolve link + prévia da mensagem. O envio é um
       segundo clique, depois que o operador leu o texto. */
    if (op !== "enviar") {
      return Response.json({ ok: true, link: criado.row, url, mensagem });
    }

    /* ── envio ── */
    if (isWhatsAppBlocked(cliente)) {
      return Response.json(
        {
          error: "Este cliente pediu para não receber mensagens automáticas.",
          details: { code: "WHATSAPP_OPT_OUT" },
          link: criado.row,
          url,
        },
        { status: 403 }
      );
    }

    /* `whatsappNumber` devolve só dígitos como estão no cadastro —
       pode vir sem o 55. O serviço do WhatsApp precisa de E.164, e
       `phoneKey` é a mesma função que o bot usa para casar cliente. */
    const numero =
      phoneKey(cliente.whatsapp || cliente.phone || "") ||
      (whatsappNumber(cliente) ? `55${whatsappNumber(cliente)}`.slice(-13) : "");
    if (!numero) {
      return Response.json(
        {
          error: "Cliente sem WhatsApp válido no cadastro. Copie o link e envie manualmente.",
          link: criado.row,
          url,
        },
        { status: 422 }
      );
    }

    try {
      const r = await fetch(`${WA_BASE}/enviar`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(WA_TOKEN ? { "x-wa-token": WA_TOKEN } : {}),
        },
        body: JSON.stringify({ para: numero, texto: mensagem }),
        signal: AbortSignal.timeout(20_000),
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) {
        return Response.json(
          {
            error: (payload as { erro?: string }).erro || "O WhatsApp recusou o envio.",
            link: criado.row,
            url,
            mensagem,
          },
          { status: r.status }
        );
      }
      await marcarEnviado(criado.row.id, "whatsapp");
      return Response.json({ ok: true, enviado: true, link: criado.row, url, mensagem });
    } catch {
      /* Serviço fora do ar não pode perder o link já gerado: devolvemos
         para o operador copiar e mandar do celular. */
      return Response.json(
        {
          error: "O serviço do WhatsApp não está rodando. O link foi gerado — copie e envie manualmente.",
          offline: true,
          link: criado.row,
          url,
          mensagem,
        },
        { status: 503 }
      );
    }
  } catch (e) {
    console.error("[registration-link]", e);
    return Response.json({ error: "Não foi possível gerar o link de cadastro." }, { status: 500 });
  }
}
