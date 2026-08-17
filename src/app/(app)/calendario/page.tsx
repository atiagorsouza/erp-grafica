import type { Metadata } from "next";
import { db } from "@/db";
import { commemorativeDates } from "@/db/schema";
import { sql } from "drizzle-orm";
import { CalendarClient } from "@/components/modules/CalendarClient";

export const metadata: Metadata = { title: "Calendário Comemorativo" };
export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const rows = await db.select().from(commemorativeDates).orderBy(sql`${commemorativeDates.month} ASC, ${commemorativeDates.day} ASC`);
  return <CalendarClient dates={rows} />;
}
