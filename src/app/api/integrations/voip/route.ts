import { db } from "@/db";
import { apiIntegrations } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Integração VoIP — sistema separado (PABX/discador).
 * GET  -> status
 * POST -> gera chamada / registra evento (click-to-call)
 */
export async function GET() {
  const [cfg] = await db
    .select()
    .from(apiIntegrations)
    .where(eq(apiIntegrations.type, "voip"));
  return Response.json({
    module: "voip",
    status: "ponte pronta",
    active: cfg?.active ?? false,
    contract: {
      call: "POST { from, to } (click-to-call)",
      events: "webhook recebe status da chamada",
      note: "Credenciais em process.env.VOIP_TOKEN / VOIP_API_URL",
    },
  });
}

export async function POST(req: Request) {
  const token = process.env.VOIP_TOKEN;
  if (!token) {
    return Response.json(
      { ok: false, error: "VOIP_TOKEN não configurado" },
      { status: 503 }
    );
  }
  const body = await req.json().catch(() => ({}));
  return Response.json({
    ok: true,
    call_id: `call_${Date.now()}`,
    from: body.from,
    to: body.to,
  });
}
