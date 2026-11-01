/**
 * Persistent SQLite-backed job queue. Jobs survive restarts; stale running
 * jobs are recovered; duplicate requests are collapsed by `dedupeKey`.
 */
import { and, asc, desc, eq, inArray, lt, lte, or, isNull } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";

export type JobType = "initial_program" | "nutrition_plan" | "revise_workout" | "revise_nutrition" | "next_cycle" | "coach" | "analyze_progress" | "pdf_export" | "ai_diagnostic";
export type Lane = "ai" | "pdf" | "system";
export type Job = typeof t.aiJobs.$inferSelect;

export const LANE_OF: Record<JobType, Lane> = {
  initial_program: "ai", nutrition_plan: "ai", revise_workout: "ai", revise_nutrition: "ai", next_cycle: "ai", coach: "ai", analyze_progress: "ai",
  pdf_export: "pdf", ai_diagnostic: "system",
};
const ACTIVE = ["queued", "running", "validating"] as const;

export function enqueueJob(db: DB, input: { userId: string; type: JobType; payload: Record<string, unknown>; dedupeKey?: string | null; maxAttempts?: number }) {
  return db.transaction((tx) => {
    if (input.dedupeKey) {
      const dup = tx.select().from(t.aiJobs).where(and(eq(t.aiJobs.userId, input.userId), eq(t.aiJobs.dedupeKey, input.dedupeKey), inArray(t.aiJobs.status, [...ACTIVE]))).get();
      if (dup) return { job: dup, duplicate: true };
    }
    const id = newId();
    tx.insert(t.aiJobs).values({
      id, userId: input.userId, type: input.type, lane: LANE_OF[input.type], status: "queued", dedupeKey: input.dedupeKey ?? null,
      input: input.payload, maxAttempts: input.maxAttempts ?? 3, runAfter: Date.now(), progressMessage: "در صف پردازش",
    }).run();
    return { job: tx.select().from(t.aiJobs).where(eq(t.aiJobs.id, id)).get()!, duplicate: false };
  }, { behavior: "immediate" });
}

export function getJob(db: DB, userId: string, id: string) {
  const j = db.select().from(t.aiJobs).where(and(eq(t.aiJobs.id, id), eq(t.aiJobs.userId, userId))).get();
  if (!j) throw notFound("کار");
  return j;
}

export function listJobs(db: DB, userId: string, limit = 20) {
  return db.select().from(t.aiJobs).where(eq(t.aiJobs.userId, userId)).orderBy(desc(t.aiJobs.createdAt)).limit(limit).all();
}

export function activeJobs(db: DB, userId: string, types?: JobType[]) {
  const cond = types?.length ? and(eq(t.aiJobs.userId, userId), inArray(t.aiJobs.status, [...ACTIVE]), inArray(t.aiJobs.type, types)) : and(eq(t.aiJobs.userId, userId), inArray(t.aiJobs.status, [...ACTIVE]));
  return db.select().from(t.aiJobs).where(cond).orderBy(asc(t.aiJobs.createdAt)).all();
}

export function cancelJob(db: DB, userId: string, id: string) {
  const j = getJob(db, userId, id);
  if (j.status === "queued") {
    db.update(t.aiJobs).set({ status: "cancelled", finishedAt: Date.now(), errorCode: "cancelled", errorMessage: "لغو شده توسط کاربر" }).where(eq(t.aiJobs.id, id)).run();
  } else if (j.status === "running" || j.status === "validating") {
    db.update(t.aiJobs).set({ cancelRequested: true }).where(eq(t.aiJobs.id, id)).run();
  } else {
    throw new AppError("not_cancellable", "این کار قابل لغو نیست.", 409);
  }
  return getJob(db, userId, id);
}

/** Atomically claim the next runnable job of a lane. */
export function claimNext(db: DB, lane: Lane): Job | null {
  return db.transaction((tx) => {
    const now = Date.now();
    const j = tx.select().from(t.aiJobs).where(and(eq(t.aiJobs.lane, lane), eq(t.aiJobs.status, "queued"), lte(t.aiJobs.runAfter, now)))
      .orderBy(asc(t.aiJobs.runAfter), asc(t.aiJobs.createdAt)).get();
    if (!j) return null;
    tx.update(t.aiJobs).set({ status: "running", attempts: j.attempts + 1, startedAt: now, heartbeatAt: now, progressMessage: "در حال پردازش" }).where(eq(t.aiJobs.id, j.id)).run();
    return tx.select().from(t.aiJobs).where(eq(t.aiJobs.id, j.id)).get()!;
  }, { behavior: "immediate" });
}

export function heartbeat(db: DB, id: string, progress?: string, status?: "running" | "validating") {
  db.update(t.aiJobs).set({ heartbeatAt: Date.now(), ...(progress ? { progressMessage: progress } : {}), ...(status ? { status } : {}) }).where(eq(t.aiJobs.id, id)).run();
  return db.select({ c: t.aiJobs.cancelRequested }).from(t.aiJobs).where(eq(t.aiJobs.id, id)).get()?.c ?? false;
}

export function completeJob(db: DB, id: string, result: unknown) {
  db.update(t.aiJobs).set({ status: "completed", result: result as object, finishedAt: Date.now(), progressMessage: "انجام شد", errorCode: null, errorMessage: null }).where(eq(t.aiJobs.id, id)).run();
}

export function failJob(db: DB, job: Job, err: { code: string; message: string; retryable: boolean; retryDelayMs?: number }) {
  const now = Date.now();
  if (err.code === "cancelled") {
    db.update(t.aiJobs).set({ status: "cancelled", finishedAt: now, errorCode: "cancelled", errorMessage: err.message }).where(eq(t.aiJobs.id, job.id)).run();
    return "cancelled";
  }
  if (err.retryable && job.attempts < job.maxAttempts) {
    const delay = err.retryDelayMs ?? Math.min(15 * 60_000, 30_000 * 2 ** (job.attempts - 1));
    db.update(t.aiJobs).set({ status: "queued", runAfter: now + delay, errorCode: err.code, errorMessage: err.message, progressMessage: "تلاش مجدد خودکار به‌زودی" }).where(eq(t.aiJobs.id, job.id)).run();
    return "requeued";
  }
  db.update(t.aiJobs).set({ status: "failed", finishedAt: now, errorCode: err.code, errorMessage: err.message, progressMessage: null }).where(eq(t.aiJobs.id, job.id)).run();
  return "failed";
}

/** Re-queue jobs whose worker died (no heartbeat for `staleMs`). */
export function recoverStaleJobs(db: DB, staleMs: number) {
  const cutoff = Date.now() - staleMs;
  const stale = db.select().from(t.aiJobs).where(and(inArray(t.aiJobs.status, ["running", "validating"]), or(lt(t.aiJobs.heartbeatAt, cutoff), isNull(t.aiJobs.heartbeatAt)))).all();
  for (const j of stale) failJob(db, j, { code: "worker_crash", message: "worker stopped while processing", retryable: true, retryDelayMs: 1000 });
  return stale.length;
}

export function retryJob(db: DB, userId: string, id: string) {
  const j = getJob(db, userId, id);
  if (j.status !== "failed" && j.status !== "cancelled") throw new AppError("not_retryable", "فقط کارهای ناموفق قابل تکرار هستند.", 409);
  if (j.dedupeKey && activeJobs(db, userId).some((x) => x.dedupeKey === j.dedupeKey)) throw new AppError("duplicate", "درخواست مشابهی در حال پردازش است.", 409);
  db.update(t.aiJobs).set({ status: "queued", attempts: 0, runAfter: Date.now(), cancelRequested: false, errorCode: null, errorMessage: null, finishedAt: null, progressMessage: "در صف پردازش" }).where(eq(t.aiJobs.id, id)).run();
  return getJob(db, userId, id);
}

/** Public, sanitized view of a job for the UI. */
export function jobView(j: Job) {
  return {
    id: j.id, type: j.type, status: j.status, progress: j.progressMessage, attempts: j.attempts, maxAttempts: j.maxAttempts,
    errorCode: j.errorCode, error: j.errorMessage && (j.status === "failed" || j.status === "queued") ? j.errorMessage : null,
    retryAt: j.status === "queued" && j.runAfter > Date.now() ? j.runAfter : null, result: j.status === "completed" ? j.result : null,
    createdAt: j.createdAt, finishedAt: j.finishedAt,
  };
}
