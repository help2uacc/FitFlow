/**
 * Progress analytics. Missing logs are treated as missing data — never as zero
 * activity or zero food intake.
 */
import { and, asc, desc, eq, gte, inArray, lte, isNotNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { addDays, dayOfWeek, diffDays, todayISO, parseISODate } from "@/lib/dates";
import { getCatalogExercise } from "@/domain/plans/validate-workout";

export const e1rm = (w: number, reps: number) => (reps <= 0 ? 0 : reps === 1 ? w : Math.round(w * (1 + reps / 30) * 10) / 10);

export function linearSlope(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const num = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const den = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  return den === 0 ? null : num / den;
}

export function rangeFor(range: string, today = todayISO()) {
  const days = { "7": 7, "14": 14, "30": 30, "90": 90 }[range];
  return { from: days ? addDays(today, -(days - 1)) : "2000-01-01", to: today };
}

/** Planned sessions per date based on which plan version was active at that time. */
export function plannedSessionDates(db: DB, userId: string, from: string, to: string) {
  const versions = db.select({ id: t.workoutPlanVersions.id, activatedAt: t.workoutPlanVersions.activatedAt, cycleId: t.workoutPlanVersions.cycleId })
    .from(t.workoutPlanVersions).where(and(eq(t.workoutPlanVersions.userId, userId), isNotNull(t.workoutPlanVersions.activatedAt)))
    .orderBy(asc(t.workoutPlanVersions.activatedAt)).all();
  if (!versions.length) return [];
  const sessions = db.select({ v: t.workoutSessions.planVersionId, dow: t.workoutSessions.dayOfWeek, id: t.workoutSessions.id }).from(t.workoutSessions)
    .where(inArray(t.workoutSessions.planVersionId, versions.map((v) => v.id))).all();
  const tz = "Asia/Tehran";
  const out: { date: string; sessionId: string; versionId: string }[] = [];
  const firstDay = todayISO(tz, new Date(versions[0].activatedAt!));
  for (let d = from < firstDay ? firstDay : from; d <= to; d = addDays(d, 1)) {
    const endOfDay = parseISODate(addDays(d, 1)).getTime();
    const v = [...versions].reverse().find((x) => x.activatedAt! < endOfDay);
    if (!v) continue;
    for (const s of sessions) if (s.v === v.id && s.dow === dayOfWeek(d)) out.push({ date: d, sessionId: s.id, versionId: v.id });
  }
  return out;
}

export function workoutAdherence(db: DB, userId: string, from: string, to: string) {
  const planned = plannedSessionDates(db, userId, from, to);
  const logs = db.select().from(t.completedWorkouts).where(and(eq(t.completedWorkouts.userId, userId), gte(t.completedWorkouts.date, from), lte(t.completedWorkouts.date, to))).all();
  const completed = logs.filter((l) => l.status === "completed");
  const plannedDone = planned.filter((p) => completed.some((c) => c.workoutSessionId === p.sessionId && c.date === p.date)).length;
  const today = todayISO();
  const pastPlanned = planned.filter((p) => p.date < today || completed.some((c) => c.workoutSessionId === p.sessionId && c.date === p.date));
  return {
    planned: planned.length,
    plannedSoFar: pastPlanned.length,
    completed: completed.length,
    completedPlanned: plannedDone,
    unscheduled: completed.filter((c) => c.unscheduled).length,
    missed: logs.filter((l) => l.status === "missed" || l.status === "skipped").length + Math.max(0, pastPlanned.length - plannedDone - logs.filter((l) => (l.status === "missed" || l.status === "skipped") && !l.unscheduled).length),
    adherencePct: pastPlanned.length ? Math.round((plannedDone / pastPlanned.length) * 100) : null,
    totalVolumeKg: Math.round(completed.reduce((s, c) => s + (c.totalVolumeKg ?? 0), 0)),
    totalMinutes: Math.round(completed.reduce((s, c) => s + (c.durationSec ?? 0), 0) / 60),
  };
}

export function weeklyTraining(db: DB, userId: string, from: string, to: string) {
  const rows = db.select({ date: t.completedWorkouts.date, vol: t.completedWorkouts.totalVolumeKg, status: t.completedWorkouts.status }).from(t.completedWorkouts)
    .where(and(eq(t.completedWorkouts.userId, userId), gte(t.completedWorkouts.date, from), lte(t.completedWorkouts.date, to))).all();
  const planned = plannedSessionDates(db, userId, from, to);
  const weekKey = (d: string) => addDays(d, -((dayOfWeek(d) + 1) % 7)); // weeks start Saturday
  const map = new Map<string, { week: string; volume: number; completed: number; planned: number }>();
  const get = (w: string) => map.get(w) ?? (map.set(w, { week: w, volume: 0, completed: 0, planned: 0 }), map.get(w)!);
  for (const r of rows) if (r.status === "completed") { const x = get(weekKey(r.date)); x.volume += r.vol ?? 0; x.completed++; }
  for (const p of planned) get(weekKey(p.date)).planned++;
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week)).map((x) => ({ ...x, volume: Math.round(x.volume) }));
}

export function exerciseProgress(db: DB, userId: string, exerciseId: string, from: string, to: string) {
  const rows = db.select({ date: t.completedWorkouts.date, w: t.completedSets.weightKg, r: t.completedSets.reps }).from(t.completedSets)
    .innerJoin(t.completedWorkouts, eq(t.completedWorkouts.id, t.completedSets.completedWorkoutId))
    .where(and(eq(t.completedSets.userId, userId), eq(t.completedSets.exerciseId, exerciseId), eq(t.completedSets.status, "done"), gte(t.completedWorkouts.date, from), lte(t.completedWorkouts.date, to)))
    .orderBy(asc(t.completedWorkouts.date)).all();
  const byDate = new Map<string, { date: string; topWeight: number; bestE1rm: number; volume: number; sets: number }>();
  for (const r of rows) {
    const x = byDate.get(r.date) ?? { date: r.date, topWeight: 0, bestE1rm: 0, volume: 0, sets: 0 };
    x.topWeight = Math.max(x.topWeight, r.w ?? 0);
    x.bestE1rm = Math.max(x.bestE1rm, e1rm(r.w ?? 0, r.r ?? 0));
    x.volume += (r.w ?? 0) * (r.r ?? 0);
    x.sets++;
    byDate.set(r.date, x);
  }
  return [...byDate.values()];
}

/** Exercises the user has logged, with personal bests. */
export function personalBests(db: DB, userId: string) {
  const rows = db.select({ ex: t.completedSets.exerciseId, w: t.completedSets.weightKg, r: t.completedSets.reps, date: t.completedWorkouts.date }).from(t.completedSets)
    .innerJoin(t.completedWorkouts, eq(t.completedWorkouts.id, t.completedSets.completedWorkoutId))
    .where(and(eq(t.completedSets.userId, userId), eq(t.completedSets.status, "done"))).all();
  const m = new Map<string, { exerciseId: string; nameFa: string; maxWeight: number; bestE1rm: number; bestDate: string; sessions: Set<string> }>();
  for (const r of rows) {
    const x = m.get(r.ex) ?? { exerciseId: r.ex, nameFa: getCatalogExercise(r.ex)?.nameFa ?? r.ex, maxWeight: 0, bestE1rm: 0, bestDate: r.date, sessions: new Set<string>() };
    x.sessions.add(r.date);
    x.maxWeight = Math.max(x.maxWeight, r.w ?? 0);
    const e = e1rm(r.w ?? 0, r.r ?? 0);
    if (e > x.bestE1rm) { x.bestE1rm = e; x.bestDate = r.date; }
    m.set(r.ex, x);
  }
  return [...m.values()].map(({ sessions, ...x }) => ({ ...x, sessions: sessions.size })).sort((a, b) => b.sessions - a.sessions);
}

export function weightSeries(db: DB, userId: string, from: string, to: string) {
  const rows = db.select().from(t.bodyMeasurements).where(and(eq(t.bodyMeasurements.userId, userId), gte(t.bodyMeasurements.date, from), lte(t.bodyMeasurements.date, to))).orderBy(asc(t.bodyMeasurements.date)).all();
  const weights = rows.filter((r) => r.weightKg != null).map((r) => ({ date: r.date, weightKg: r.weightKg! }));
  const withAvg = weights.map((w) => {
    const win = weights.filter((x) => diffDays(w.date, x.date) >= 0 && diffDays(w.date, x.date) < 7);
    return { ...w, avg7: Math.round((win.reduce((s, x) => s + x.weightKg, 0) / win.length) * 10) / 10 };
  });
  const slope = linearSlope(weights.map((w) => ({ x: diffDays(w.date, weights[0].date), y: w.weightKg })));
  return {
    points: withAvg,
    measurements: rows.filter((r) => r.waistCm || r.chestCm || r.armCm || r.hipCm || r.thighCm),
    trendKgPerWeek: slope === null || weights.length < 3 ? null : Math.round(slope * 7 * 100) / 100,
  };
}

export function nutritionStats(db: DB, userId: string, from: string, to: string) {
  const rows = db.select().from(t.nutritionDailySummaries).where(and(eq(t.nutritionDailySummaries.userId, userId), gte(t.nutritionDailySummaries.date, from), lte(t.nutritionDailySummaries.date, to))).orderBy(asc(t.nutritionDailySummaries.date)).all();
  const logged = rows.filter((r) => r.entries > 0);
  const span = Math.max(1, diffDays(to, from) + 1);
  const avg = (f: (r: (typeof rows)[0]) => number) => (logged.length ? Math.round(logged.reduce((s, r) => s + f(r), 0) / logged.length) : null);
  const onTarget = logged.filter((r) => r.targetKcal && Math.abs(r.kcal - r.targetKcal) / r.targetKcal <= 0.1).length;
  return {
    days: rows,
    loggedDays: logged.length,
    completeDays: logged.filter((r) => r.completeness === "complete").length,
    loggingRatePct: Math.round((logged.length / span) * 100),
    avgKcal: avg((r) => r.kcal),
    avgProteinG: avg((r) => r.proteinG),
    avgTargetKcal: avg((r) => r.targetKcal ?? 0) || null,
    adherencePct: logged.length ? Math.round((onTarget / logged.length) * 100) : null,
    note: logged.length < span ? "روزهای بدون ثبت به عنوان داده ناقص در نظر گرفته شده‌اند، نه مصرف صفر." : null,
  };
}

export function recentFeedback(db: DB, userId: string, from: string) {
  const fb = db.select({ d: t.workoutFeedback, date: t.completedWorkouts.date }).from(t.workoutFeedback)
    .innerJoin(t.completedWorkouts, eq(t.completedWorkouts.id, t.workoutFeedback.completedWorkoutId))
    .where(and(eq(t.workoutFeedback.userId, userId), gte(t.completedWorkouts.date, from))).orderBy(desc(t.completedWorkouts.date)).all();
  const checkins = db.select().from(t.progressCheckins).where(and(eq(t.progressCheckins.userId, userId), gte(t.progressCheckins.date, from))).orderBy(desc(t.progressCheckins.date)).all();
  const diffs = fb.map((f) => f.d.difficulty).filter((x): x is number => x != null);
  return {
    avgDifficulty: diffs.length ? Math.round((diffs.reduce((s, x) => s + x, 0) / diffs.length) * 10) / 10 : null,
    painReports: fb.filter((f) => f.d.pain).map((f) => ({ date: f.date, notes: f.d.painNotes })).concat(checkins.filter((c) => c.pain).map((c) => ({ date: c.date, notes: c.painNotes }))),
    checkins,
    difficultySeries: fb.filter((f) => f.d.difficulty != null).map((f) => ({ date: f.date, difficulty: f.d.difficulty! })).reverse(),
  };
}
