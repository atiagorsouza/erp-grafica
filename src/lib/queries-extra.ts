import "server-only";
import { db } from "@/db";
import { services } from "@/db/schema";
import { asc } from "drizzle-orm";

export async function getServices() {
  return db.select().from(services).orderBy(asc(services.name));
}
