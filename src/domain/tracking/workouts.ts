import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { dayOfWeek, isValidISODate } from "@/lib/dates";
import { getActiveWorkoutVersion } from "@/domain/plans/workout-service";
import type { WorkoutPlan } from "@/domain/plans/schemas";

const isoDate = z.string().refine(isValidISODate, "تاریخ نامعتبر");
const clientId = z.string().min(8).max(80).regex(/^[A-Za-z0-9:_-]+$/);

export const StartWorkoutInput = z.object({
  clientId, date: isoDate,
  sessionId: z.string().max(80).nullable().optional(),
  title: z.string().trim().max(80).optional(),
});
export const LogSetInput = z.object({
  clientId, completedWorkoutId: z.string().max(80),
  workoutExerciseId: z.string().max(80).nullable().optional(),
  exerciseId: z.string().max(120),
  substitutedFromId: z.string().max(120).nullable().optional(),
  setIndex: z.number().int().min(0).max(30),
  weightKg: z.number().min(0).max(700).nullable().optional(),
  reps: z.number().int().min(0).max(500).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  rir: z.number().int().min(0).max(10).nullable().optional(),
  status: z.enum(["done", "skipped"]),
  notes: z.string().max(500).nullable().optional(),
  clientUpdatedAt: z.number().int().optional(),
});
export const WorkoutStatusInput = z.object({
  action: z.enum(["pause", "resume", "complete", "skip", "miss"]),
  notes: z.string().max(1000).optional(),
});
export const FeedbackInput = z.object({
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  pain: z.boolean().default(false),
  painNotes: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

function ownWorkout(db: DB, userId: string, id: string) {
  const w = db.select().from(t.completedWorkouts).where(and(eq(t.completedWorkouts.id, id), eq(t.completedWorkouts.userId, userId))).get();
  if (!w) throw notFound("جلسه تمرین");
  return w;
}

export function startWorkout(db: DB, userId: string, input: z.infer<typeof StartWorkoutInput>) {
  const existing = db.select().from(t.completedWorkouts).where(and(eq(t.completedWorkouts.userId, userId), eq(t.completedWorkouts.clientId, input.clientId))).get();
  if (existing) return existing;
  let title = input.title || "تمرین آزاد";
  let planVersionId: string | null = null;
  if (input.sessionId) {
    const s = db.select().from(t.workoutSessions).where(and(eq(t.workoutSessions.id, input.sessionId), eq(t.workoutSessions.userId, userId))).get();
    if (!s) throw notFound("جلسه برنامه");
    title = s.title;
    planVersionId = s.planVersionId;
    // resume an unfinished workout for the same session/day instead of duplicating
    const open = db.select().from(t.completedWorkouts).where(and(eq(t.completedWorkouts.userId, userId), eq(t.completedWorkouts.workoutSessionId, s.id),
      eq(t.completedWorkouts.date, input.date), inArray(t.completedWorkouts.status, ["in_progress", "paused"]))).get();
    if (open) return open;
  }
  const id = newId();
  db.insert(t.completedWorkouts).values({
    id, userId, clientId: input.clientId, planVersionId, workoutSessionId: input.sessionId ?? null, title, date: input.date,
    status: "in_progress", unscheduled: !input.sessionId, startedAt: Date.now(),
  }).run();
  return ownWorkout(db, userId, id);
}

export function logSet(db: DB, userId: string, input: z.infer<typeof LogSetInput>) {
  const w = ownWorkout(db, userId, input.completedWorkoutId);
  if (!db.select({ id: t.exercises.id }).from(t.exercises).where(eq(t.exercises.id, input.exerciseId)).get()) throw notFound("حرکت");
  const existing = db.select().from(t.completedSets).where(and(eq(t.completedSets.userId, userId), eq(t.completedSets.clientId, input.clientId))).get();
  const values = {
    workoutExerciseId: input.workoutExerciseId ?? null, exerciseId: input.exerciseId, substitutedFromId: input.substitutedFromId ?? null,
    setIndex: input.setIndex, weightKg: input.weightKg ?? null, reps: input.reps ?? null, rpe: input.rpe ?? null, rir: input.rir ?? null,
    status: input.status, notes: input.notes ?? null,
  };
  if (existing) {
    if (input.clientUpdatedAt && existing.updatedAt > input.clientUpdatedAt) {
      return { set: existing, conflict: true }; // server copy is newer → keep it
    }
    db.update(t.completedSets).set({ ...values, updatedAt: Date.now() }).where(eq(t.completedSets.id, existing.id)).run();
    return { set: db.select().from(t.completedSets).where(eq(t.completedSets.id, existing.id)).get()!, conflict: false };
  }
  if (w.status === "completed" || w.status === "skipped" || w.status === "missed") {
    // allow late edits of a finished workout but keep its status
  }
  const id = newId();
  db.insert(t.completedSets).values({ id, userId, clientId: input.clientId, completedWorkoutId: w.id, ...values }).run();
  if (w.status === "completed") recomputeWorkoutTotals(db, w.id);
  return { set: db.select().from(t.completedSets).where(eq(t.completedSets.id, id)).get()!, conflict: false };
}

export function deleteSet(db: DB, userId: string, setId: string) {
  const s = db.select().from(t.completedSets).where(and(eq(t.completedSets.id, setId), eq(t.completedSets.userId, userId))).get();
  if (!s) throw notFound("ست");
  db.delete(t.completedSets).where(eq(t.completedSets.id, setId)).run();
}

export function recomputeWorkoutTotals(db: DB, workoutId: string) {
  const sets = db.select().from(t.completedSets).where(and(eq(t.completedSets.completedWorkoutId, workoutId), eq(t.completedSets.status, "done"))).all();
  const volume = sets.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0);
  db.update(t.completedWorkouts).set({ totalVolumeKg: Math.round(volume * 10) / 10, updatedAt: Date.now() }).where(eq(t.completedWorkouts.id, workoutId)).run();
}

export function updateWorkoutStatus(db: DB, userId: string, id: string, input: z.infer<typeof WorkoutStatusInput>) {
  const w = ownWorkout(db, userId, id);
  const now = Date.now();
  const elapsed = () => (w.durationSec ?? 0) + (w.status === "in_progress" && w.startedAt ? Math.round((now - w.startedAt) / 1000) : 0);
  switch (input.action) {
    case "pause":
      if (w.status !== "in_progress") throw new AppError("bad_state", "این جلسه در حال اجرا نیست.", 409);
      db.update(t.completedWorkouts).set({ status: "paused", durationSec: elapsed(), startedAt: null, updatedAt: now }).where(eq(t.completedWorkouts.id, id)).run();
      break;
    case "resume":
      if (w.status !== "paused") throw new AppError("bad_state", "این جلسه متوقف نیست.", 409);
      db.update(t.completedWorkouts).set({ status: "in_progress", startedAt: now, updatedAt: now }).where(eq(t.completedWorkouts.id, id)).run();
      break;
    case "complete":
      db.update(t.completedWorkouts).set({ status: "completed", durationSec: elapsed(), finishedAt: now, startedAt: w.startedAt, notes: input.notes ?? w.notes, updatedAt: now }).where(eq(t.completedWorkouts.id, id)).run();
      recomputeWorkoutTotals(db, id);
      break;
    case "skip":
    case "miss":
      db.update(t.completedWorkouts).set({ status: input.action === "skip" ? "skipped" : "missed", finishedAt: now, notes: input.notes ?? w.notes, updatedAt: now }).where(eq(t.completedWorkouts.id, id)).run();
      break;
  }
  return ownWorkout(db, userId, id);
}

/** Mark a planned session as missed for a given date without starting it. */
export function markMissed(db: DB, userId: string, sessionId: string, date: string, cid: string) {
  const w = startWorkout(db, userId, { clientId: cid, date, sessionId });
  return updateWorkoutStatus(db, userId, w.id, { action: "miss" });
}

export function saveFeedback(db: DB, userId: string, workoutId: string, input: z.infer<typeof FeedbackInput>) {
  ownWorkout(db, userId, workoutId);
  const values = { difficulty: input.difficulty ?? null, energy: input.energy ?? null, pain: input.pain, painNotes: input.painNotes ?? null, notes: input.notes ?? null };
  db.insert(t.workoutFeedback).values({ id: newId(), userId, completedWorkoutId: workoutId, ...values })
    .onConflictDoUpdate({ target: t.workoutFeedback.completedWorkoutId, set: values }).run();
}

export function getWorkoutDetail(db: DB, userId: string, id: string) {
  const w = ownWorkout(db, userId, id);
  const sets = db.select().from(t.completedSets).where(eq(t.completedSets.completedWorkoutId, id)).orderBy(asc(t.completedSets.createdAt)).all();
  const feedback = db.select().from(t.workoutFeedback).where(eq(t.workoutFeedback.completedWorkoutId, id)).get() ?? null;
  let session: (WorkoutPlan["sessions"][number] & { id: string; exerciseRows: (typeof t.workoutExercises.$inferSelect)[] }) | null = null;
  if (w.workoutSessionId && w.planVersionId) {
    const sRow = db.select().from(t.workoutSessions).where(eq(t.workoutSessions.id, w.workoutSessionId)).get();
    const ver = db.select({ plan: t.workoutPlanVersions.plan }).from(t.workoutPlanVersions).where(eq(t.workoutPlanVersions.id, w.planVersionId)).get();
    const planSession = (ver?.plan as WorkoutPlan | undefined)?.sessions.find((s) => s.key === sRow?.sessionKey);
    if (sRow && planSession) {
      const exerciseRows = db.select().from(t.workoutExercises).where(eq(t.workoutExercises.sessionId, sRow.id)).orderBy(asc(t.workoutExercises.sortOrder)).all();
      session = { ...planSession, id: sRow.id, exerciseRows };
    }
  }
  return { workout: w, sets, feedback, session };
}

/** Most recent completed sets for an exercise (excluding a workout). */
export function previousPerformance(db: DB, userId: string, exerciseId: string, excludeWorkoutId?: string) {
  const last = db.select({ wid: t.completedSets.completedWorkoutId, date: t.completedWorkouts.date }).from(t.completedSets)
    .innerJoin(t.completedWorkouts, eq(t.completedWorkouts.id, t.completedSets.completedWorkoutId))
    .where(and(eq(t.completedSets.userId, userId), eq(t.completedSets.exerciseId, exerciseId), eq(t.completedSets.status, "done"),
      excludeWorkoutId ? sql`${t.completedSets.completedWorkoutId} <> ${excludeWorkoutId}` : sql`1=1`))
    .orderBy(desc(t.completedWorkouts.date), desc(t.completedSets.createdAt)).get();
  if (!last) return null;
  const sets = db.select().from(t.completedSets).where(and(eq(t.completedSets.completedWorkoutId, last.wid), eq(t.completedSets.exerciseId, exerciseId), eq(t.completedSets.status, "done"))).orderBy(asc(t.completedSets.setIndex)).all();
  return { date: last.date, sets: sets.map((s) => ({ setIndex: s.setIndex, weightKg: s.weightKg, reps: s.reps, rir: s.rir, rpe: s.rpe })) };
}

export function listWorkoutLogs(db: DB, userId: string, opts: { before?: string; limit?: number } = {}) {
  const limit = Math.min(50, opts.limit ?? 20);
  // cursor = "<date>_<createdAt>" so rows sharing a date are never skipped
  let cond = eq(t.completedWorkouts.userId, userId);
  if (opts.before) {
    const [d, c] = opts.before.split("_");
    const created = Number(c);
    cond = and(cond, Number.isFinite(created) && c
      ? or(lt(t.completedWorkouts.date, d), and(eq(t.completedWorkouts.date, d), lt(t.completedWorkouts.createdAt, created)))
      : lt(t.completedWorkouts.date, d))!;
  }
  const rows = db.select().from(t.completedWorkouts).where(cond).orderBy(desc(t.completedWorkouts.date), desc(t.completedWorkouts.createdAt)).limit(limit + 1).all();
  const last = rows[limit - 1];
  return { items: rows.slice(0, limit), nextBefore: rows.length > limit && last ? `${last.date}_${last.createdAt}` : null };
}

/** The planned session for a date from the active plan (null on rest days). */
export function plannedSessionFor(db: DB, userId: string, date: string) {
  const v = getActiveWorkoutVersion(db, userId);
  if (!v) return { version: null, session: null, row: null, next: null };
  const plan = v.plan as WorkoutPlan;
  const dow = dayOfWeek(date);
  const rows = db.select().from(t.workoutSessions).where(eq(t.workoutSessions.planVersionId, v.id)).all();
  const row = rows.find((r) => r.dayOfWeek === dow) ?? null;
  const session = row ? plan.sessions.find((s) => s.key === row.sessionKey) ?? null : null;
  let next = null;
  for (let i = 1; i <= 7 && !next; i++) {
    const r = rows.find((x) => x.dayOfWeek === (dow + i) % 7);
    if (r) next = { inDays: i, title: r.title, dayOfWeek: r.dayOfWeek };
  }
  const log = row ? db.select().from(t.completedWorkouts).where(and(eq(t.completedWorkouts.userId, userId), eq(t.completedWorkouts.workoutSessionId, row.id), eq(t.completedWorkouts.date, date))).orderBy(desc(t.completedWorkouts.createdAt)).get() ?? null : null;
  return { version: v, session, row, next, log };
}
