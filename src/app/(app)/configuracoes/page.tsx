import type { Metadata } from "next";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { SettingsClient } from "@/components/modules/SettingsClient";

export const metadata: Metadata = { title: "Painel de Controle" };
export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const rows = await db.select().from(settings);
  return <SettingsClient rows={rows} />;
}
