import type { Metadata } from "next";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { FinanceClient } from "@/components/modules/FinanceClient";

export const metadata: Metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const txRows = await db.select().from(transactions).orderBy(desc(transactions.createdAt));
  return <FinanceClient transactions={txRows} />;
}
