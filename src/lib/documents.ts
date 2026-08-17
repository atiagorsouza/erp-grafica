import "server-only";

import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export type DocumentType = "quote" | "order" | "sale" | "purchase";

const DEFAULT_PREFIX: Record<DocumentType, string> = {
  quote: "ORC",
  order: "PED",
  sale: "PDV",
  purchase: "CMP",
};

/**
 * Gera numeração transacional e atômica:
 *  ORC-2026-0001 (anual) ou ORC-000001 (contínua).
 *
 * Não usa count da tabela e não usa Date.now, portanto não colide entre
 * operadores simultâneos ou workers em produção.
 */
export async function nextDocumentNumber(type: DocumentType): Promise<string> {
  const configRows = await db
    .select()
    .from(settings)
    .where(eq(settings.category, "documentos"));
  const map = new Map(configRows.map((row) => [row.key, row.value || ""]));
  const mode = map.get("document_number_mode") || "annual";
  const width = Math.max(3, Math.min(10, Number(map.get("document_number_width") || 4)));
  const prefix = (map.get(`document_prefix_${type}`) || DEFAULT_PREFIX[type])
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10) || DEFAULT_PREFIX[type];
  const year = mode === "annual" ? new Date().getFullYear() : 0;

  const result = await db.execute(sql`
    INSERT INTO document_counters (document_type, year, current, updated_at)
    VALUES (${type}, ${year}, 1, NOW())
    ON CONFLICT (document_type, year)
    DO UPDATE SET current = document_counters.current + 1, updated_at = NOW()
    RETURNING current
  `);
  const row = (result as unknown as { rows?: { current?: number }[] }).rows?.[0];
  const sequence = Number(row?.current || 1);
  const padded = String(sequence).padStart(width, "0");
  return mode === "annual" ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
}
