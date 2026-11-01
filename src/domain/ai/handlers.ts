/**
 * Job handlers executed by the worker. Each handler persists ONLY validated
 * output; any failure leaves existing plans untouched.
 */
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { newId } from "@/lib/ids";
import { todayISO } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { notify } from "@/domain/notifications/service";
import { nutritionEnabled } from "@/domain/profile/model";
import { clearPlanReview } from "@/domain/profile/service";
import { createWorkoutVersion, getActiveCycle, getActiveWorkoutVersion } from "@/domain/plans/workout-service";
import { createNutritionVersion, getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { macrosFor } from "@/domain/nutrition/calc";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { buildNutritionContext, buildWorkoutContext } from "./context";
import type { AiEngine, AttemptMeta } from "./engine";
import { enqueueJob, type Job } from "./jobs";
import type { AIProvider } from "./types";

export interface HandlerCtl {
  signal: AbortSignal;
  progress: (msg: string, phase?: "running" | "validating") => void;
}

function recordMeta(db: DB, jobId: string) {
  return (m: AttemptMeta) => {
    db.insert(t.aiGenerationMetadata).values({ id: newId(), jobId, ...m, validationErrors: m.validationErrors ?? null }).run();
  };
}

type ReqParams = {
  difficultyDelta?: number | null; daysPerWeek?: number | null; sessionMinutes?: number | null; emphasis?: string | null;
  muscleFocus?: string[] | null; cardio?: "add" | "reduce" | null; text?: string | null; goal?: string | null; choice?: string | null;
  calorieDelta?: number | null; proteinChange?: string | null; mealsPerDay?: number | null; notes?: string | null; recomputeTargets?: boolean;
};

function setRequest(db: DB, requestId: string | undefined, patch: Partial<typeof t.planAdjustmentRequests.$inferInsert>) {
  if (!requestId) return;
  db.update(t.planAdjustmentRequests).set({ ...patch, updatedAt: Date.now() }).where(eq(t.planAdjustmentRequests.id, requestId)).run();
}

export async function runJob(db: DB, job: Job, engine: AiEngine, provider: AIProvider, ctl: HandlerCtl): Promise<unknown> {
  const input = (job.input ?? {}) as Record<string, unknown>;
  const run = { jobId: job.id, signal: ctl.signal, onProgress: ctl.progress, onAttempt: recordMeta(db, job.id) };
  const userId = job.userId;

  switch (job.type) {
    case "initial_program": {
      const w = buildWorkoutContext(db, userId);
      const { value: plan, warnings } = await engine.generateInitialProgram(w.context, w.constraints, run);
      const hadActive = !!getActiveWorkoutVersion(db, userId);
      const weeks = Math.min(6, Math.max(4, Number(w.profile.preferences.cycleWeeks) || plan.durationWeeks || 4));
      const res = createWorkoutVersion(db, {
        userId, plan, reason: "برنامه اولیه", cycle: { mode: "new", startDate: todayISO(), weeks }, previousVersionId: null, aiJobId: job.id,
        profileSnapshot: w.context.profile, activate: !hadActive,
      });
      if (nutritionEnabled(w.profile) && !getActiveNutritionVersion(db, userId)) {
        enqueueJob(db, { userId, type: "nutrition_plan", payload: { reason: "برنامه غذایی اولیه", activate: true }, dedupeKey: "nutrition_plan" });
      }
      clearPlanReview(db, userId);
      notify(db, userId, { kind: "plan_ready", title: "برنامه شما آماده است", body: "برنامه تمرینی جدید آماده مشاهده است.", url: "/program/workout", dedupeKey: `job:${job.id}` });
      return { versionId: res.versionId, cycleId: res.cycleId, activated: !hadActive, warnings };
    }

    case "nutrition_plan": {
      const n = buildNutritionContext(db, userId);
      const { value: plan, warnings } = await engine.generateNutritionPlan(n.context, { foods: n.foods, profile: n.profile, targets: n.targets }, run);
      const activate = input.activate === true || !n.activeVersion;
      const res = createNutritionVersion(db, {
        userId, plan, reason: String(input.reason ?? "برنامه غذایی"), cycleId: getActiveCycle(db, userId)?.id ?? null, previousVersionId: n.activeVersion?.id ?? null,
        aiJobId: job.id, profileSnapshot: n.context.profile, activate,
      });
      const requestId = input.requestId as string | undefined;
      setRequest(db, requestId, { status: activate ? "applied" : "ready", resultVersionId: res.versionId });
      notify(db, userId, { kind: "plan_ready", title: "برنامه غذایی آماده است", body: "برنامه غذایی جدید آماده مشاهده است.", url: "/program/nutrition", dedupeKey: `job:${job.id}` });
      return { versionId: res.versionId, activated: activate, warnings, consistency: engine.checkNutritionConsistency(plan) };
    }

    case "revise_workout":
    case "next_cycle": {
      const req = (input.request ?? {}) as ReqParams;
      const overrides: Record<string, number> = {};
      if (req.daysPerWeek) overrides.daysPerWeek = req.daysPerWeek;
      if (req.sessionMinutes) overrides.sessionMinutes = req.sessionMinutes;
      const w = buildWorkoutContext(db, userId, overrides);
      const active = w.activeVersion;
      if (!active) throw new Error("no active workout plan to revise");
      const ctx = { ...w.context, currentPlan: job.type === "revise_workout" ? active.plan : w.context.currentPlan, request: { ...req, text: req.text ?? null } };
      const isNext = job.type === "next_cycle";
      const { value: plan, warnings } = isNext ? await engine.generateNextCycle(ctx, w.constraints, run) : await engine.reviseWorkoutPlan(ctx, w.constraints, run);
      const weeks = Math.min(6, Math.max(4, Number(input.weeks) || Number(w.profile.preferences.cycleWeeks) || 4));
      const res = createWorkoutVersion(db, {
        userId, plan, reason: String(input.reason ?? (isNext ? "دوره جدید" : "اصلاح برنامه")),
        cycle: isNext ? { mode: "new", startDate: todayISO(), weeks } : { mode: "existing", cycleId: active.cycleId },
        previousVersionId: active.id, aiJobId: job.id, profileSnapshot: w.context.profile, activate: false,
      });
      setRequest(db, input.requestId as string | undefined, { status: "ready", resultVersionId: res.versionId });
      notify(db, userId, { kind: "draft_ready", title: isNext ? "برنامه دوره بعد آماده است" : "پیشنهاد اصلاح برنامه آماده است", body: "برای بررسی و تأیید، برنامه را باز کنید.", url: `/program/review/${res.versionId}`, dedupeKey: `job:${job.id}` });
      if (isNext && typeof req.calorieDelta === "number" && req.calorieDelta !== 0) {
        enqueueJob(db, { userId, type: "revise_nutrition", payload: { reason: "تنظیم کالری برای دوره جدید", request: { calorieDelta: req.calorieDelta } }, dedupeKey: "revise_nutrition" });
      }
      return { versionId: res.versionId, draft: true, warnings };
    }

    case "revise_nutrition": {
      const req = (input.request ?? {}) as ReqParams;
      const n = buildNutritionContext(db, userId);
      if (!n.activeVersion) throw new Error("no active nutrition plan to revise");
      let targets = n.targets;
      const cur = n.activeVersion;
      if (typeof req.calorieDelta === "number" && req.calorieDelta) {
        const kcal = Math.max(n.targets.floorKcal, Math.min(n.targets.ceilingKcal, cur.targetKcal + req.calorieDelta));
        targets = { ...n.targets, ...macrosFor(kcal, n.profile, { proteinG: cur.proteinG }) };
      } else if (!req.recomputeTargets) {
        targets = { ...n.targets, kcal: cur.targetKcal, proteinG: cur.proteinG, carbsG: cur.carbsG, fatG: cur.fatG };
      }
      const ctx = { ...n.context, targets: { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG }, request: { ...req, text: req.text ?? null } };
      const { value: plan, warnings } = await engine.reviseNutritionPlan(ctx, { foods: n.foods, profile: n.profile, targets }, run);
      const res = createNutritionVersion(db, {
        userId, plan, reason: String(input.reason ?? "اصلاح برنامه غذایی"), cycleId: getActiveCycle(db, userId)?.id ?? null,
        previousVersionId: cur.id, aiJobId: job.id, profileSnapshot: n.context.profile, activate: false,
      });
      setRequest(db, input.requestId as string | undefined, { status: "ready", resultVersionId: res.versionId });
      notify(db, userId, { kind: "draft_ready", title: "پیشنهاد اصلاح برنامه غذایی آماده است", body: "برای بررسی و تأیید، برنامه را باز کنید.", url: `/program/review-nutrition/${res.versionId}`, dedupeKey: `job:${job.id}` });
      return { versionId: res.versionId, draft: true, warnings };
    }

    case "coach": {
      const w = buildWorkoutContext(db, userId);
      const ctx = { today: w.context.today, profile: w.context.profile, currentPlan: w.context.currentPlan, history: w.context.history, request: { text: String(input.text ?? "").slice(0, 1000) } };
      const { value } = await engine.explainAdjustment(ctx, run);
      return value;
    }

    case "analyze_progress": {
      const w = buildWorkoutContext(db, userId);
      const ctx = { today: w.context.today, profile: w.context.profile, currentPlan: w.context.currentPlan, history: w.context.history };
      const { value } = await engine.analyzeProgress(ctx, run);
      notify(db, userId, { kind: "analysis_ready", title: "تحلیل پیشرفت آماده است", body: "نتیجه تحلیل پیشرفت شما آماده است.", url: "/progress", dedupeKey: `job:${job.id}` });
      return value;
    }

    case "ai_diagnostic": {
      const d = await provider.diagnose({ smoke: input.smoke === true });
      db.insert(t.systemStatus).values({ key: "ai_diagnostic", value: d }).onConflictDoUpdate({ target: t.systemStatus.key, set: { value: d, updatedAt: Date.now() } }).run();
      return d;
    }

    case "pdf_export": {
      const { generateReport } = await import("@/domain/pdf/export");
      return generateReport(db, userId, String(input.reportId), ctl);
    }

    default:
      logger.warn("unknown job type", { type: job.type });
      throw new Error(`unknown job type ${job.type}`);
  }
}

export type { WorkoutPlan };
