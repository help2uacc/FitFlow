import { and, desc, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { newId } from "@/lib/ids";

/**
 * In-app notifications (optionally delivered as Web Push by the worker).
 * Bodies are deliberately generic — no health details on lock screens.
 */
export function notify(db: DB, userId: string, n: { kind: string; title: string; body: string; url?: string; dedupeKey?: string }) {
  db.insert(t.notifications).values({ id: newId(), userId, kind: n.kind, title: n.title, body: n.body, url: n.url ?? null, dedupeKey: n.dedupeKey ?? null })
    .onConflictDoNothing().run();
}

export function listNotifications(db: DB, userId: string, limit = 30) {
  return db.select().from(t.notifications).where(eq(t.notifications.userId, userId)).orderBy(desc(t.notifications.createdAt)).limit(limit).all();
}

export function unreadCount(db: DB, userId: string) {
  return db.select().from(t.notifications).where(and(eq(t.notifications.userId, userId), isNull(t.notifications.readAt))).all().length;
}

export function markAllRead(db: DB, userId: string) {
  db.update(t.notifications).set({ readAt: Date.now() }).where(and(eq(t.notifications.userId, userId), isNull(t.notifications.readAt))).run();
}
