import { db } from "@/db";
import {
  notifications,
  materials,
  orders,
  deliveries,
  crmActivities,
  commemorativeDates,
  settings,
} from "@/db/schema";
import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

type AppNotification = {
  id: string | number;
  type: "info" | "success" | "warning" | "danger";
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: Date | null;
  createdAt: Date;
  system?: boolean;
};

export async function GET() {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [stored, lowStock, pendingArts, pendingDeliveries, dueActivities, calendarDates, settingRows] =
      await Promise.all([
        db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(30),
        db
          .select()
          .from(materials)
          .where(lte(materials.stock, materials.minStock))
          .limit(8),
        db
          .select()
          .from(orders)
          .where(or(eq(orders.artStatus, "pendente"), eq(orders.artStatus, "revisao")))
          .limit(8),
        db
          .select()
          .from(deliveries)
          .where(or(eq(deliveries.status, "aguardando"), eq(deliveries.status, "separado")))
          .limit(8),
        db
          .select()
          .from(crmActivities)
          .where(and(isNull(crmActivities.completedAt), lte(crmActivities.dueAt, tomorrow)))
          .orderBy(asc(crmActivities.dueAt))
          .limit(8),
        db.select().from(commemorativeDates).where(eq(commemorativeDates.active, true)),
        db.select().from(settings).where(eq(settings.category, "calendario")),
      ]);

    const settingsMap = new Map(settingRows.map((row) => [row.key, row.value || ""]));
    const alertDays = Math.max(1, Math.min(90, Number(settingsMap.get("calendar_alert_days_before") || 15)));
    const daysUntil = (month: number, day: number) => {
      const y = now.getFullYear();
      const today = new Date(y, now.getMonth(), now.getDate());
      let target = new Date(y, month - 1, day);
      if (target < today) target = new Date(y + 1, month - 1, day);
      return Math.ceil((target.getTime() - today.getTime()) / 86400000);
    };
    const upcomingDates = calendarDates
      .map((d) => ({ ...d, days: daysUntil(Number(d.month), Number(d.day)) }))
      .filter((d) => d.days >= 0 && d.days <= alertDays && (d.relevance === "alta" || d.type === "data_comercial" || d.type === "feriado_nacional"))
      .sort((a, b) => a.days - b.days)
      .slice(0, 8);

    const system: AppNotification[] = [
      ...lowStock.map((m) => ({
        id: `stock-${m.id}`,
        type: "warning" as const,
        title: "Estoque no mínimo",
        body: `${m.name}: ${Number(m.stock)} ${m.unit} (mínimo ${Number(m.minStock)})`,
        href: "/estoque",
        createdAt: now,
        system: true,
      })),
      ...pendingArts.map((order) => ({
        id: `art-${order.id}`,
        type: "warning" as const,
        title: "Arte precisa de atenção",
        body: `${order.number}: status ${order.artStatus}`,
        href: "/pedidos",
        createdAt: now,
        system: true,
      })),
      ...pendingDeliveries.map((delivery) => ({
        id: `delivery-${delivery.id}`,
        type: "info" as const,
        title: "Entrega aguardando andamento",
        body: `${delivery.method} · status ${delivery.status}`,
        href: "/pedidos",
        createdAt: now,
        system: true,
      })),
      ...dueActivities.map((activity) => ({
        id: `activity-${activity.id}`,
        type: "info" as const,
        title: "Próxima ação de CRM",
        body: activity.title,
        href: activity.customerId ? `/clientes?id=${activity.customerId}` : "/clientes",
        createdAt: activity.dueAt || activity.createdAt,
        system: true,
      })),
      ...upcomingDates.map((date) => ({
        id: `calendar-${date.id}`,
        type: date.days <= 3 ? "warning" as const : "info" as const,
        title: `${date.icon || "📅"} Data comercial chegando`,
        body: `${date.title} em ${date.days === 0 ? "hoje" : `${date.days} dia(s)`}${date.actionHint ? ` · ${date.actionHint}` : ""}`,
        href: "/calendario",
        createdAt: now,
        system: true,
      })),
    ];

    const list = [...system, ...stored].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return Response.json({
      ok: true,
      notifications: list,
      unreadCount: system.length + stored.filter((item) => !item.readAt).length,
      refreshedAt: now,
    });
  } catch {
    return Response.json({ ok: false, notifications: [], unreadCount: 0 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body.op === "create") {
      const [row] = await db
        .insert(notifications)
        .values({
          type: body.data?.type || "info",
          title: body.data?.title || "Notificação",
          body: body.data?.body || null,
          href: body.data?.href || null,
        })
        .returning();
      return Response.json({ ok: true, row });
    }
    if (body.op === "read") {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, Number(body.id)));
      return Response.json({ ok: true });
    }
    if (body.op === "read-all") {
      await db.update(notifications).set({ readAt: new Date() }).where(isNull(notifications.readAt));
      return Response.json({ ok: true });
    }
    return Response.json({ error: "op inválido" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "erro" },
      { status: 500 }
    );
  }
}
