import controlPanelConfig from "../../../../../config/control-panel-settings.json";
import { db, clearSettingsCache } from "@/lib/crud";
import { settings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/* Chaves que o sistema aceita gravar (v3.55.0).

   Antes, qualquer `key` criava linha nova. Um typo no cliente ou uma
   requisição malformada inventava configuração que a tela nunca
   mostra (porque não está no catálogo) e que ninguém consegue apagar
   pela interface — lixo permanente no banco.

   A auditoria dos 3 módulos encontrou 2 dessas órfãs em produção.
   Agora só passa o que o catálogo conhece, mais as chaves que o
   próprio sistema grava por fora dele. */
const CHAVES_INTERNAS = new Set(["app_version", "company_trade_name"]);

function chaveConhecida(key: string): boolean {
  if (CHAVES_INTERNAS.has(key)) return true;
  /* Estado do bot é gravado pelo serviço do WhatsApp, não pelo
     Painel — por isso não está no catálogo. */
  if (/^wa_bot_/.test(key)) return true;
  return (controlPanelConfig as { groups: { fields: { key: string }[] }[] }).groups.some((g) =>
    g.fields.some((f) => f.key === key)
  );
}

async function upsertSetting(data: Record<string, unknown>) {
  const key = String(data.key || "").trim();
  if (!key) throw new Error("key obrigatória");
  const value = data.value == null ? "" : String(data.value);
  const category = String(data.category || "geral");

  const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);

  /* Atualizar chave existente sempre pode; CRIAR uma nova exige que
     ela seja conhecida. Assim nada que já está no banco quebra, mas
     a porta para lixo novo fica fechada. */
  if (!existing[0] && !chaveConhecida(key)) {
    const erro = new Error(`Configuração desconhecida: ${key}`);
    (erro as Error & { code?: string }).code = "UNKNOWN_SETTING";
    throw erro;
  }
  if (existing[0]) {
    const [row] = await db
      .update(settings)
      .set({ value, category, updatedAt: new Date() })
      .where(eq(settings.key, key))
      .returning();
    return row;
  }
  const [row] = await db.insert(settings).values({ key, value, category }).returning();
  return row;
}

/* As logos são data URIs de até 2 MB cada. Devolvê-las aqui fazia
   este endpoint responder 4 MB — o mesmo problema que travou o Painel
   (v3.53.1). Quem precisa da imagem busca em /api/upload/logo?key=...
   Devolvemos só o indicador de que existe. */
const CHAVES_LOGO = new Set(["company_logo", "company_logo_dark", "company_logo_icon"]);

export async function GET() {
  const linhas = await db.select().from(settings).orderBy(asc(settings.category), asc(settings.key));
  const rows = linhas.map((r) =>
    CHAVES_LOGO.has(r.key) && (r.value?.length ?? 0) > 0 ? { ...r, value: "__SET__" } : r
  );
  return Response.json({
    ok: true,
    rows,
    groups: controlPanelConfig.groups,
    version: controlPanelConfig.version,
  });
}

/**
 * POST /api/crud/settings
 *   { op: "save" | "create", data: { key, value, category } }
 *   { op: "update", id, data: { value?, category?, key? } }
 *   { op: "delete", id }
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const op = String(body.op || "");
  const data = (body.data as Record<string, unknown>) || {};

  /* Trava de servidor: "__SET__" é o marcador que a tela recebe no
     lugar do base64 da logo. Se ele voltasse num save, gravaria a
     string por cima da imagem e ela sumiria dos documentos.

     A tela já pula esses campos, mas a regra tem de morar aqui: é o
     servidor que protege o dado, não a interface. */
  if (String(data.value ?? "") === "__SET__") {
    return Response.json(
      {
        error: "Este campo é gravado pelo upload de imagem, não pelo formulário.",
        details: { code: "LOGO_PLACEHOLDER" },
      },
      { status: 422 }
    );
  }

  try {
    if (op === "save" || op === "create") {
      try {
        const row = await upsertSetting(data);
        clearSettingsCache();
        return Response.json({ ok: true, row });
      } catch (e) {
        if ((e as Error & { code?: string }).code === "UNKNOWN_SETTING") {
          return Response.json(
            {
              error: (e as Error).message,
              details: { code: "UNKNOWN_SETTING" },
            },
            { status: 422 }
          );
        }
        throw e;
      }
    }

    if (op === "update") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return Response.json({ error: "id obrigatório" }, { status: 400 });
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (data.value !== undefined) patch.value = String(data.value ?? "");
      if (data.category !== undefined) patch.category = String(data.category || "geral");
      if (data.key !== undefined) patch.key = String(data.key);

      const [row] = await db
        .update(settings)
        .set(patch as never)
        .where(eq(settings.id, id))
        .returning();
      clearSettingsCache();
      return Response.json({ ok: true, row });
    }

    if (op === "delete") {
      const id = Number(body.id);
      if (!Number.isFinite(id)) {
        return Response.json({ error: "id obrigatório" }, { status: 400 });
      }
      await db.delete(settings).where(eq(settings.id, id));
      clearSettingsCache();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (e) {
    console.error("[settings]", e);
    return Response.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
