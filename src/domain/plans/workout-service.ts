/**
 * Workout plan versioning. Published versions are immutable; every revision
 * creates a new version row. Logs reference version/session IDs so history is
 * never lost when a plan changes.
 */
import { and, asc, desc, eq, inArray, max, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { getCatalogExercise } from "./validate-workout";
import type { WorkoutPlan } from "./schemas";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { addDays, diffDays, todayISO } from "@/lib/dates";
import { MUSCLE_FA } from "@/domain/exercises/catalog";

export type CycleTarget = { mode: "new"; startDate: string; weeks: number } | { mode: "existing"; cycleId: string };

export function createWorkoutVersion(db: DB, input: {
  userId: string; plan: WorkoutPlan; reason: string; cycle: CycleTarget; previousVersionId: string | null;
  aiJobId?: string | null; profileSnapshot: unknown; activate: boolean;
}) {
  const res = db.transaction((tx) => {
    let cycleId: string;
    let version = 1;
    if (input.cycle.mode === "new") {
      const n = tx.select({ n: max(t.programCycles.cycleNumber) }).from(t.programCycles).where(eq(t.programCycles.userId, input.userId)).get()?.n ?? 0;
      cycleId = newId();
      const endDate = addDays(input.cycle.startDate, input.cycle.weeks * 7 - 1);
      tx.insert(t.programCycles).values({
        id: cycleId, userId: input.userId, cycleNumber: n + 1, startDate: input.cycle.startDate, endDate, reviewDate: addDays(endDate, -2), status: "draft",
      }).run();
    } else {
      cycleId = input.cycle.cycleId;
      const v = tx.select({ v: max(t.workoutPlanVersions.version) }).from(t.workoutPlanVersions).where(eq(t.workoutPlanVersions.cycleId, cycleId)).get()?.v ?? 0;
      version = v + 1;
    }
    const id = newId();
    tx.insert(t.workoutPlanVersions).values({
      id, userId: input.userId, cycleId, version, status: "draft", revisionReason: input.reason, previousVersionId: input.previousVersionId,
      plan: input.plan, profileSnapshot: (input.profileSnapshot ?? {}) as object, aiJobId: input.aiJobId ?? null,
    }).run();
    input.plan.sessions.forEach((s, si) => {
      const sid = newId();
      tx.insert(t.workoutSessions).values({ id: sid, userId: input.userId, planVersionId: id, sessionKey: s.key, dayOfWeek: s.dayOfWeek, title: s.title, focus: s.focus, estimatedMinutes: s.estimatedMinutes, sortOrder: si }).run();
      s.exercises.forEach((e, ei) => {
        const weId = newId();
        tx.insert(t.workoutExercises).values({ id: weId, sessionId: sid, exerciseId: e.exerciseId, slotKey: `${s.key}:${ei}`, sortOrder: ei, sets: e.sets, repMin: e.repMin, repMax: e.repMax, restSec: e.restSec, targetRir: e.targetRir }).run();
        for (let k = 0; k < e.sets; k++) tx.insert(t.prescribedSets).values({ id: newId(), workoutExerciseId: weId, setIndex: k, repMin: e.repMin, repMax: e.repMax, targetRir: e.targetRir }).run();
      });
    });
    return { versionId: id, cycleId };
  });
  if (input.activate) activateWorkoutVersion(db, input.userId, res.versionId);
  return res;
}

/**
 * Make a draft version the active plan. The previously active version becomes
 * `superseded`; if the draft belongs to a new cycle the old cycle is completed.
 */
export function activateWorkoutVersion(db: DB, userId: string, versionId: string) {
  const v = db.select().from(t.workoutPlanVersions).where(and(eq(t.workoutPlanVersions.id, versionId), eq(t.workoutPlanVersions.userId, userId))).get();
  if (!v) throw notFound("نسخه برنامه");
  if (v.status !== "draft") throw new AppError("not_draft", "فقط پیش‌نویس قابل اعمال است.", 409);
  const prev = getActiveWorkoutVersion(db, userId);
  const now = Date.now();
  db.transaction((tx) => {
    if (prev) {
      tx.update(t.workoutPlanVersions).set({ status: "superseded" }).where(eq(t.workoutPlanVersions.id, prev.id)).run();
      if (prev.cycleId !== v.cycleId) {
        tx.update(t.programCycles).set({ status: "completed", completedAt: now }).where(eq(t.programCycles.id, prev.cycleId)).run();
      }
    }
    tx.update(t.workoutPlanVersions).set({ status: "active", activatedAt: now }).where(eq(t.workoutPlanVersions.id, v.id)).run();
    const cyc = tx.select().from(t.programCycles).where(eq(t.programCycles.id, v.cycleId)).get()!;
    if (cyc.status === "draft") {
      // a new cycle starts on the day it is accepted
      const start = todayISO();
      const end = addDays(start, diffDays(cyc.endDate, cyc.startDate));
      tx.update(t.programCycles).set({ status: "active", startDate: start, endDate: end, reviewDate: addDays(end, -2) }).where(eq(t.programCycles.id, v.cycleId)).run();
    } else {
      tx.update(t.programCycles).set({ status: "active" }).where(eq(t.programCycles.id, v.cycleId)).run();
    }
    // other drafts of the same lineage are now stale
    tx.update(t.workoutPlanVersions).set({ status: "rejected" })
      .where(and(eq(t.workoutPlanVersions.userId, userId), eq(t.workoutPlanVersions.status, "draft"), ne(t.workoutPlanVersions.id, v.id))).run();
    tx.insert(t.planChangeHistory).values({
      id: newId(), userId, domain: "workout", fromVersionId: prev?.id ?? null, toVersionId: v.id,
      summary: v.revisionReason, changes: prev ? diffWorkoutPlans(prev.plan as WorkoutPlan, v.plan as WorkoutPlan) : { created: true },
    }).run();
  });
}

export function rejectWorkoutDraft(db: DB, userId: string, versionId: string) {
  const v = db.select().from(t.workoutPlanVersions).where(and(eq(t.workoutPlanVersions.id, versionId), eq(t.workoutPlanVersions.userId, userId))).get();
  if (!v) throw notFound("نسخه برنامه");
  if (v.status !== "draft") throw new AppError("not_draft", "این نسخه پیش‌نویس نیست.", 409);
  db.transaction((tx) => {
    tx.update(t.workoutPlanVersions).set({ status: "rejected" }).where(eq(t.workoutPlanVersions.id, versionId)).run();
    const c = tx.select().from(t.programCycles).where(eq(t.programCycles.id, v.cycleId)).get();
    if (c?.status === "draft") tx.update(t.programCycles).set({ status: "archived" }).where(eq(t.programCycles.id, c.id)).run();
  });
}

export function getActiveWorkoutVersion(db: DB, userId: string) {
  return db.select().from(t.workoutPlanVersions).where(and(eq(t.workoutPlanVersions.userId, userId), eq(t.workoutPlanVersions.status, "active"))).get() ?? null;
}

export function getWorkoutVersion(db: DB, userId: string, id: string) {
  const v = db.select().from(t.workoutPlanVersions).where(and(eq(t.workoutPlanVersions.id, id), eq(t.workoutPlanVersions.userId, userId))).get();
  if (!v) throw notFound("نسخه برنامه");
  return v;
}

export function getCycle(db: DB, userId: string, id: string) {
  return db.select().from(t.programCycles).where(and(eq(t.programCycles.id, id), eq(t.programCycles.userId, userId))).get() ?? null;
}

export function getActiveCycle(db: DB, userId: string) {
  return db.select().from(t.programCycles).where(and(eq(t.programCycles.userId, userId), eq(t.programCycles.status, "active"))).get() ?? null;
}

export function getSessionsForVersion(db: DB, versionId: string) {
  return db.select().from(t.workoutSessions).where(eq(t.workoutSessions.planVersionId, versionId)).orderBy(asc(t.workoutSessions.sortOrder)).all();
}

export function latestDraft(db: DB, userId: string) {
  return db.select().from(t.workoutPlanVersions).where(and(eq(t.workoutPlanVersions.userId, userId), eq(t.workoutPlanVersions.status, "draft")))
    .orderBy(desc(t.workoutPlanVersions.createdAt)).get() ?? null;
}

export function workoutHistory(db: DB, userId: string) {
  const cycles = db.select().from(t.programCycles).where(eq(t.programCycles.userId, userId)).orderBy(desc(t.programCycles.cycleNumber)).all();
  const versions = cycles.length
    ? db.select({
        id: t.workoutPlanVersions.id, cycleId: t.workoutPlanVersions.cycleId, version: t.workoutPlanVersions.version, status: t.workoutPlanVersions.status,
        revisionReason: t.workoutPlanVersions.revisionReason, createdAt: t.workoutPlanVersions.createdAt, activatedAt: t.workoutPlanVersions.activatedAt,
        previousVersionId: t.workoutPlanVersions.previousVersionId,
      }).from(t.workoutPlanVersions).where(inArray(t.workoutPlanVersions.cycleId, cycles.map((c) => c.id))).orderBy(desc(t.workoutPlanVersions.version)).all()
    : [];
  return cycles.map((c) => ({ ...c, versions: versions.filter((v) => v.cycleId === c.id) }));
}

export type CyclePhase = "active" | "ending_soon" | "ended";
export function cyclePhase(c: { startDate: string; endDate: string }, today = todayISO()) {
  const left = diffDays(c.endDate, today);
  const total = diffDays(c.endDate, c.startDate) + 1;
  const elapsed = Math.min(total, Math.max(0, diffDays(today, c.startDate) + 1));
  const phase: CyclePhase = left < 0 ? "ended" : left <= 5 ? "ending_soon" : "active";
  return { phase, daysLeft: Math.max(0, left + 1), week: Math.min(Math.ceil(total / 7), Math.max(1, Math.ceil(elapsed / 7))), totalWeeks: Math.ceil(total / 7), elapsedDays: elapsed, totalDays: total };
}

/** Extend the active cycle by N weeks (dates only; plan content unchanged). */
export function extendCycle(db: DB, userId: string, weeks: number) {
  if (weeks < 1 || weeks > 4) throw new AppError("invalid_extension", "تمدید باید بین ۱ تا ۴ هفته باشد.");
  const c = getActiveCycle(db, userId);
  if (!c) throw notFound("دوره فعال");
  const endDate = addDays(c.endDate, weeks * 7);
  const active = getActiveWorkoutVersion(db, userId);
  db.transaction((tx) => {
    tx.update(t.programCycles).set({ endDate, reviewDate: addDays(endDate, -2) }).where(eq(t.programCycles.id, c.id)).run();
    if (active) tx.insert(t.planChangeHistory).values({ id: newId(), userId, domain: "workout", fromVersionId: active.id, toVersionId: active.id, summary: `تمدید دوره به مدت ${weeks} هفته`, changes: { extendedWeeks: weeks, newEndDate: endDate } }).run();
  });
  return { endDate };
}

/** Human-readable diff between two workout plans. */
export function diffWorkoutPlans(a: WorkoutPlan, b: WorkoutPlan) {
  const lines: string[] = [];
  if (a.sessions.length !== b.sessions.length) lines.push(`تعداد جلسات: ${a.sessions.length} ← ${b.sessions.length}`);
  if (a.difficulty !== b.difficulty) lines.push(`سطح سختی: ${a.difficulty} ← ${b.difficulty}`);
  if (a.split !== b.split) lines.push(`تقسیم‌بندی: ${a.split} ← ${b.split}`);
  const setsByMuscle = (p: WorkoutPlan) => {
    const m: Record<string, number> = {};
    for (const s of p.sessions) for (const e of s.exercises) {
      const ex = getCatalogExercise(e.exerciseId);
      for (const mu of ex?.primaryMuscles ?? []) m[mu] = (m[mu] ?? 0) + e.sets;
    }
    return m;
  };
  const ma = setsByMuscle(a), mb = setsByMuscle(b);
  const volume: { muscle: string; before: number; after: number }[] = [];
  for (const k of new Set([...Object.keys(ma), ...Object.keys(mb)])) {
    if ((ma[k] ?? 0) !== (mb[k] ?? 0)) {
      volume.push({ muscle: k, before: ma[k] ?? 0, after: mb[k] ?? 0 });
      lines.push(`ست‌های هفتگی ${MUSCLE_FA[k] ?? k}: ${ma[k] ?? 0} ← ${mb[k] ?? 0}`);
    }
  }
  const ids = (p: WorkoutPlan) => new Set(p.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)));
  const ia = ids(a), ib = ids(b);
  const added = [...ib].filter((x) => !ia.has(x));
  const removed = [...ia].filter((x) => !ib.has(x));
  for (const x of added) lines.push(`اضافه شد: ${getCatalogExercise(x)?.nameFa ?? x}`);
  for (const x of removed) lines.push(`حذف شد: ${getCatalogExercise(x)?.nameFa ?? x}`);
  const avg = (p: WorkoutPlan, f: (e: WorkoutPlan["sessions"][0]["exercises"][0]) => number | null) => {
    const xs = p.sessions.flatMap((s) => s.exercises.map(f)).filter((x): x is number => x !== null);
    return xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;
  };
  const rirA = avg(a, (e) => e.targetRir), rirB = avg(b, (e) => e.targetRir);
  if (rirA !== rirB) lines.push(`میانگین RIR (تکرار ذخیره): ${rirA ?? "-"} ← ${rirB ?? "-"}`);
  const minA = a.sessions.reduce((s, x) => s + x.estimatedMinutes, 0) / a.sessions.length;
  const minB = b.sessions.reduce((s, x) => s + x.estimatedMinutes, 0) / b.sessions.length;
  if (Math.round(minA) !== Math.round(minB)) lines.push(`مدت تقریبی هر جلسه: ${Math.round(minA)} ← ${Math.round(minB)} دقیقه`);
  return { lines, added, removed, volume };
}
