/**
 * Periodic reminder generation (run by the worker once a minute) and optional
 * Web Push delivery. Notification text is generic by default.
 */
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import webpush from "web-push";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { addDays, dayOfWeek, todayISO } from "@/lib/dates";
import { cyclePhase, getActiveCycle, getActiveWorkoutVersion } from "@/domain/plans/workout-service";
import { notify } from "./service";

export interface NotificationPrefs { workoutReminders: boolean; workoutTime: string; checkinReminders: boolean; mealReminders: boolean; programReminders: boolean }
export const DEFAULT_PREFS: NotificationPrefs = { workoutReminders: true, workoutTime: "17:00", checkinReminders: true, mealReminders: false, programReminders: true };

export function getPrefs(db: DB, userId: string): NotificationPrefs {
  const row = db.select().from(t.appSettings).where(eq(t.appSettings.key, `notif_prefs:${userId}`)).get();
  return { ...DEFAULT_PREFS, ...((row?.value as Partial<NotificationPrefs>) ?? {}) };
}
export function setPrefs(db: DB, userId: string, prefs: NotificationPrefs) {
  db.insert(t.appSettings).values({ key: `notif_prefs:${userId}`, value: prefs }).onConflictDoUpdate({ target: t.appSettings.key, set: { value: prefs, updatedAt: Date.now() } }).run();
}

function localTime(tz: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

export function runPeriodicTasks(db: DB, now = new Date()) {
  const users = db.select().from(t.users).all();
  for (const u of users) {
    const prefs = getPrefs(db, u.id);
    const today = todayISO(u.timezone, now);
    const hhmm = localTime(u.timezone, now);
    const cycle = getActiveCycle(db, u.id);
    if (cycle && prefs.programReminders) {
      const ph = cyclePhase(cycle, today);
      if (ph.phase === "ending_soon") notify(db, u.id, { kind: "cycle_ending", title: "دوره برنامه رو به پایان است", body: "برای بررسی پیشرفت و برنامه دوره بعد وارد شوید.", url: "/program/renew", dedupeKey: `cycle_ending:${cycle.id}` });
      if (ph.phase === "ended") notify(db, u.id, { kind: "cycle_ended", title: "دوره برنامه به پایان رسید", body: "می‌توانید دوره بعد را بسازید یا برنامه فعلی را تمدید کنید.", url: "/program/renew", dedupeKey: `cycle_ended:${cycle.id}` });
    }
    const v = getActiveWorkoutVersion(db, u.id);
    if (v && prefs.workoutReminders && hhmm >= prefs.workoutTime) {
      const hasSession = db.select().from(t.workoutSessions).where(and(eq(t.workoutSessions.planVersionId, v.id), eq(t.workoutSessions.dayOfWeek, dayOfWeek(today)))).get();
      const logged = db.select().from(t.completedWorkouts).where(and(eq(t.completedWorkouts.userId, u.id), eq(t.completedWorkouts.date, today))).get();
      if (hasSession && !logged) notify(db, u.id, { kind: "workout_reminder", title: "یادآوری تمرین", body: "تمرین امروز شما در انتظار است.", url: "/workouts/today", dedupeKey: `workout:${today}` });
    }
    if (prefs.checkinReminders && dayOfWeek(today) === 5 && hhmm >= "10:00") {
      const recent = db.select().from(t.progressCheckins).where(and(eq(t.progressCheckins.userId, u.id), gte(t.progressCheckins.date, addDays(today, -6)))).get();
      if (!recent && v) notify(db, u.id, { kind: "checkin_reminder", title: "چک‌این هفتگی", body: "چند سؤال کوتاه برای تنظیم بهتر برنامه.", url: "/check-in", dedupeKey: `checkin:${today}` });
    }
    if (prefs.mealReminders) {
      const nv = db.select().from(t.nutritionPlanVersions).where(and(eq(t.nutritionPlanVersions.userId, u.id), eq(t.nutritionPlanVersions.status, "active"))).get();
      if (nv) {
        const meals = db.select().from(t.plannedMeals).where(and(eq(t.plannedMeals.planVersionId, nv.id), eq(t.plannedMeals.dayIndex, dayOfWeek(today)))).all();
        for (const m of meals) if (m.time && m.time <= hhmm && m.time >= localTime(u.timezone, new Date(now.getTime() - 10 * 60000))) {
          notify(db, u.id, { kind: "meal_reminder", title: "یادآوری وعده", body: "زمان وعده بعدی شماست.", url: "/nutrition/log", dedupeKey: `meal:${today}:${m.slot}` });
        }
      }
    }
  }
  void deliverPush(db).catch((err) => logger.warn("push delivery failed", { err }));
}

export function pushConfigured() {
  const e = env();
  return !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT);
}

export async function deliverPush(db: DB) {
  if (!pushConfigured()) return;
  const e = env();
  webpush.setVapidDetails(e.VAPID_SUBJECT!, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  const pending = db.select().from(t.notifications).where(and(isNull(t.notifications.pushedAt), gte(t.notifications.createdAt, Date.now() - 3600_000))).orderBy(desc(t.notifications.createdAt)).limit(50).all();
  for (const n of pending) {
    const subs = db.select().from(t.pushSubscriptions).where(eq(t.pushSubscriptions.userId, n.userId)).all();
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/dashboard" }), { TTL: 3600 });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) db.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.id, s.id)).run();
      }
    }
    db.update(t.notifications).set({ pushedAt: Date.now() }).where(eq(t.notifications.id, n.id)).run();
  }
}
