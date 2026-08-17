import { getSuperfreteConfig, quoteShipping } from "@/lib/superfrete";

export const dynamic = "force-dynamic";

/**
 * COMPATIBILIDADE — rota legada mantida para integrações externas.
 *
 * Até a v3.11.0 este arquivo continha a lógica inteira (um stub que
 * ninguém no sistema chamava). A partir da v3.12.0 a regra vive em
 * `@/lib/superfrete` e esta rota é apenas um adaptador do contrato
 * antigo (`cepDestino`, `peso`, `altura`…).
 *
 * Para novas integrações use `/api/shipping`.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const result = await quoteShipping({
    cepDestination: String(body.cepDestino || body.cep_destino || body.cepDestination || ""),
    cepOrigin: body.cepOrigem || body.cep_origem,
    services: body.services,
    weight: body.peso || body.weight,
    height: body.altura || body.height,
    width: body.largura || body.width,
    length: body.comprimento || body.length,
    insuranceValue: body.valorDeclarado || body.insurance_value,
    items: body.items,
  });

  if ("error" in result) {
    return Response.json({ error: result.error, details: result.details }, { status: result.status });
  }

  /* formato antigo preservado */
  return Response.json({
    ok: true,
    cepOrigem: result.from,
    cepDestino: result.to,
    quotes: result.options.map((o) => ({
      id: o.serviceId,
      name: o.name,
      company: o.carrier,
      price: o.price,
      discount: o.discount,
      deliveryDays: o.deliveryMax,
      deliveryRange: { min: o.deliveryMin, max: o.deliveryMax },
      error: o.error,
    })),
  });
}

/** GET — status da integração */
export async function GET() {
  const cfg = await getSuperfreteConfig();
  return Response.json({
    module: "superfrete",
    configured: Boolean(cfg.token),
    sandbox: cfg.sandbox,
    environment: cfg.environment,
    cepOrigem: cfg.cepOrigin,
    docs: "https://superfrete.readme.io/reference/primeiros-passos",
  });
}
