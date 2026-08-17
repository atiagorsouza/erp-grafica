import type { Metadata } from "next";
import { db } from "@/db";
import { kanbanCards } from "@/db/schema";
import { asc } from "drizzle-orm";
import { KanbanClient } from "@/components/modules/KanbanClient";

export const metadata: Metadata = { title: "Kanban Produção" };
export const dynamic = "force-dynamic";

export default async function KanbanPage() {
  const cards = await db.select().from(kanbanCards).orderBy(asc(kanbanCards.order), asc(kanbanCards.id));
  return <KanbanClient cards={cards} />;
}
