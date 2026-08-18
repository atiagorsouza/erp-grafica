import "server-only";
import { db } from "@/db";
import { services } from "@/db/schema";
import { asc, isNull } from "drizzle-orm";

/** Serviços disponíveis para seleção — arquivados ficam de fora (v3.46.1). */
export async function getServices() {
  return db
    .select()
    .from(services)
    .where(isNull(services.archivedAt))
    .orderBy(asc(services.name));
}
