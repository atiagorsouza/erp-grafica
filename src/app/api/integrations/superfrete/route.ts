import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getSetting(key: string): Promise<string> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value || "";
}

/**
 * POST /api/integrations/superfrete
 * Calcula frete via SuperFrete API (sandbox ou produção)
 * Body: { cepDestino, peso, altura, largura, comprimento, valorDeclarado? }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = process.env.SUPERFRETE_TOKEN || await getSetting("superfrete_token");
  const sandbox = (await getSetting("superfrete_sandbox")) !== "false" && (await getSetting("superfrete_sandbox")) !== "nao";
  const cepOrigem = await getSetting("company_cep") || await getSetting("superfrete_cep_origem");

  if (!token) {
    return Response.json({ error: "Token SuperFrete não configurado. Configure em Painel de Controle → SuperFrete ou env SUPERFRETE_TOKEN." }, { status: 503 });
  }

  const cepDest = String(body.cepDestino || body.cep_destino || "").replace(/\D/g, "");
  const cepOrig = String(cepOrigem).replace(/\D/g, "");
  if (!cepDest || cepDest.length !== 8) {
    return Response.json({ error: "CEP destino inválido" }, { status: 400 });
  }

  const baseUrl = sandbox
    ? "https://sandbox.superfrete.com"
    : "https://api.superfrete.com";

  try {
    const res = await fetch(`${baseUrl}/api/v0/calculator`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "PrintFlow ERP (contato.vt@vtdigital.com)",
        "accept": "application/json",
      },
      body: JSON.stringify({
        from: { postal_code: cepOrig },
        to: { postal_code: cepDest },
        services: body.services || "1,2,17", // PAC, SEDEX, Mini Envios
        package: {
          height: Number(body.altura || body.height || 4),
          width: Number(body.largura || body.width || 12),
          length: Number(body.comprimento || body.length || 17),
          weight: Number(body.peso || body.weight || 0.3),
        },
        options: {
          insurance_value: Number(body.valorDeclarado || body.insurance_value || 0),
          receipt: false,
          own_hand: false,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data.message || "Erro SuperFrete", details: data }, { status: res.status });
    }

    // Normaliza resposta
    const quotes = Array.isArray(data) ? data : (data.dispatchers || data.services || [data]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const normalized = quotes.map((q: any) => ({
      id: q.id || q.service_id,
      name: String(q.name || q.service_name || ""),
      company: String(q.company?.name || q.carrier || ""),
      price: Number(q.price || q.custom_price || 0),
      discount: Number(q.discount || 0),
      deliveryDays: Number(q.delivery_time || q.delivery_range?.max || q.days || 0),
      deliveryRange: q.delivery_range || { min: q.delivery_time, max: q.delivery_time },
      error: q.error || null,
    }));

    return Response.json({ ok: true, cepOrigem: cepOrig, cepDestino: cepDest, quotes: normalized });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha na requisição SuperFrete" }, { status: 500 });
  }
}

/** GET — status da integração */
export async function GET() {
  const token = process.env.SUPERFRETE_TOKEN || await getSetting("superfrete_token");
  const sandbox = (await getSetting("superfrete_sandbox")) !== "false" && (await getSetting("superfrete_sandbox")) !== "nao";
  const cepOrigem = await getSetting("company_cep") || await getSetting("superfrete_cep_origem");

  return Response.json({
    module: "superfrete",
    configured: !!token,
    sandbox,
    cepOrigem,
    docs: "https://superfrete.readme.io/reference/primeiros-passos",
  });
}
