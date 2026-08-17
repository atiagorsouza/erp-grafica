import { sql } from "drizzle-orm";
import { db } from "@/db";
import { APP_VERSION, APP_RELEASE, APP_CHANNEL, APP_REPO, APP_LABEL } from "@/lib/version";

export const dynamic = "force-dynamic";

/** Versão da aplicação + integridade do banco — usado por scripts/update.sh e monitoramento. */
export async function GET() {
  let database = "down";
  let installedVersion: string | null = null;

  try {
    await db.execute(sql`select 1`);
    database = "up";
    const rows = await db.execute<{ value: string | null }>(
      sql`select value from settings where key = 'app_version' limit 1`
    );
    installedVersion = rows.rows?.[0]?.value ?? null;
  } catch {
    database = "down";
  }

  const upToDate = installedVersion === null ? null : installedVersion === APP_VERSION;

  return Response.json({
    app: APP_LABEL,
    version: APP_VERSION,
    release: APP_RELEASE,
    channel: APP_CHANNEL,
    repo: APP_REPO,
    database,
    installedVersion,
    upToDate,
    node: process.version,
    checkedAt: new Date().toISOString(),
  });
}
