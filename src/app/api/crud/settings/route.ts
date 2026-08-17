import controlPanelConfig from "../../../../../config/control-panel-settings.json";
import { db, clearSettingsCache } from "@/lib/crud";
import { settings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function upsertSetting(data: Record<string, unknown>) {
  const key = String(data.key || "").trim();
  if (!key) throw new Error("key obrigatória");
  const value = data.value == null ? "" : String(data.value);
  const category = String(data.category || "geral");

  const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
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

export async function GET() {
  const rows = await db.select().from(settings).orderBy(asc(settings.category), asc(settings.key));
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

  try {
    if (op === "save" || op === "create") {
      const row = await upsertSetting(data);
      clearSettingsCache();
      return Response.json({ ok: true, row });
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
