import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as t from "@/db/schema";
import type { DB } from "@/db/client";
import { createTestDb, createUser, completeOnboardingFor, makeRunner, cid, setMockMode } from "../helpers";
import { requestInitialProgram, setNutritionMode, requestNutritionPlan } from "@/domain/program/service";
import { getActiveWorkoutVersion, workoutHistory } from "@/domain/plans/workout-service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { getJob } from "@/domain/ai/jobs";
import { startWorkout, logSet, updateWorkoutStatus } from "@/domain/tracking/workouts";
import { logPlannedMeal, nutritionDay } from "@/domain/tracking/food";
import { confirmAdjustment, previewNutritionAdjustment, previewWorkoutAdjustment, exerciseAlternatives, substituteExerciseInPlan, requestNextCycle } from "@/domain/adjust/service";
import type { NutritionPlan, WorkoutPlan } from "@/domain/plans/schemas";
import { todayISO } from "@/lib/dates";
import { handleCoachMessage } from "@/domain/coach/service";

let db: DB;
let userId: string;
beforeEach(async () => {
  db = createTestDb();
  userId = (await createUser(db)).id;
});

describe("end-to-end planning pipeline (mock AI)", () => {
  it("generates, logs, adjusts and renews without losing history", async () => {
    completeOnboardingFor(db, userId);
    const runner = makeRunner(db);
    const { job } = requestInitialProgram(db, userId);
    // duplicate request collapses into the same job
    expect(requestInitialProgram(db, userId).duplicate).toBe(true);
    await runner.drain();
    const j = getJob(db, userId, job.id);
    expect(j.status, JSON.stringify(j)).toBe("completed");
    const active = getActiveWorkoutVersion(db, userId)!;
    expect(active).toBeTruthy();
    const plan = active.plan as WorkoutPlan;
    expect(plan.sessions).toHaveLength(3);
    expect(plan.sessions.map((s) => s.dayOfWeek).sort()).toEqual([1, 3, 6]);

    // log a workout on a planned day
    const date = todayISO();
    const s = plan.sessions[0];
    const sessionRow = db.select().from(t.workoutSessions).where(eq(t.workoutSessions.planVersionId, active.id)).all().find((r) => r.sessionKey === s.key)!;
    const w = startWorkout(db, userId, { clientId: cid("w"), date, sessionId: sessionRow.id });
    const setCid = cid("s");
    logSet(db, userId, { clientId: setCid, completedWorkoutId: w.id, exerciseId: s.exercises[0].exerciseId, setIndex: 0, weightKg: 60, reps: 10, status: "done" });
    logSet(db, userId, { clientId: setCid, completedWorkoutId: w.id, exerciseId: s.exercises[0].exerciseId, setIndex: 0, weightKg: 62.5, reps: 10, status: "done" }); // idempotent update
    const done = updateWorkoutStatus(db, userId, w.id, { action: "complete" });
    expect(done.status).toBe("completed");
    expect(done.totalVolumeKg).toBe(625);
    expect(db.select().from(t.completedSets).all()).toHaveLength(1);

    // difficulty adjustment preview → confirm → new version, logs preserved
    const prev = previewWorkoutAdjustment(db, userId, { difficultyDelta: 1, source: "controls" });
    expect(prev.mode).toBe("instant");
    confirmAdjustment(db, userId, prev.requestId);
    const v2 = getActiveWorkoutVersion(db, userId)!;
    expect(v2.version).toBe(2);
    expect((v2.plan as WorkoutPlan).difficulty).toBe(4);
    expect(db.select().from(t.completedWorkouts).where(eq(t.completedWorkouts.id, w.id)).get()!.planVersionId).toBe(active.id);

    // exercise substitution
    const ex0 = (v2.plan as WorkoutPlan).sessions[0].exercises[0].exerciseId;
    const alts = exerciseAlternatives(db, userId, ex0);
    expect(alts.length).toBeGreaterThan(0);
    substituteExerciseInPlan(db, userId, { sessionKey: (v2.plan as WorkoutPlan).sessions[0].key, index: 0, newExerciseId: alts[0].id });
    expect(((getActiveWorkoutVersion(db, userId)!.plan as WorkoutPlan).sessions[0].exercises[0].exerciseId)).toBe(alts[0].id);

    // enable nutrition later
    const m = setNutritionMode(db, userId, "full");
    expect(m.missing).toContain("meals_per_day"); // hidden during onboarding → must be asked now
  });

  it("enables nutrition later, adjusts calories both ways, and renews the cycle", async () => {
    completeOnboardingFor(db, userId);
    const runner = makeRunner(db);
    requestInitialProgram(db, userId);
    await runner.drain();
    const { saveAnswer } = await import("@/domain/profile/service");
    setNutritionMode(db, userId, "full");
    for (const [q, v] of Object.entries({ nutrition_goal: "auto", meals_per_day: "4", wake_time: "07:00", bed_time: "23:00", appetite: "normal", allergies: ["none"], diet_restrictions: ["none"], cuisine: "iranian", region: "IR", budget: "medium", cooking_time: "30", meal_prep: true, eat_out: "2", fast_food: "rare", sweets: "rare", night_eating: false, measurement_pref: "household", flexibility: "balanced" })) saveAnswer(db, userId, q, v);
    requestNutritionPlan(db, userId);
    await runner.drain();
    const nv = getActiveNutritionVersion(db, userId)!;
    expect(nv, "nutrition plan should be active").toBeTruthy();
    const np = nv.plan as NutritionPlan;
    expect(np.days).toHaveLength(7);
    for (const d of np.days) expect(Math.abs(d.totals.kcal - np.targets.kcal) / np.targets.kcal).toBeLessThan(0.15);
    expect(np.groceryList.length).toBeGreaterThan(3);

    // log a planned meal in one tap
    const day = nutritionDay(db, userId, todayISO());
    expect(day.meals.length).toBe(4);
    logPlannedMeal(db, userId, { clientId: cid("m"), date: todayISO(), plannedMealId: day.meals[0].id, portion: 1, action: "eaten" });
    const after = nutritionDay(db, userId, todayISO());
    expect(after.consumed.kcal).toBeGreaterThan(0);
    const loggedKcal = after.consumed.kcal;

    // +200 kcal
    const up = previewNutritionAdjustment(db, userId, { kind: "delta", delta: 200, source: "controls" });
    if (up.mode !== "instant") throw new Error("expected instant");
    expect(up.preview.proposed.kcal).toBe(np.targets.kcal + 200);
    expect(up.preview.proposed.proteinG).toBe(np.targets.proteinG);
    confirmAdjustment(db, userId, up.requestId);
    const nv2 = getActiveNutritionVersion(db, userId)!;
    expect(nv2.targetKcal).toBe(np.targets.kcal + 200);
    // old logs unchanged
    expect(nutritionDay(db, userId, todayISO()).consumed.kcal).toBe(loggedKcal);

    // -300 kcal
    const down = previewNutritionAdjustment(db, userId, { kind: "delta", delta: -300, source: "controls" });
    if (down.mode !== "instant") throw new Error("expected instant");
    confirmAdjustment(db, userId, down.requestId);
    expect(getActiveNutritionVersion(db, userId)!.targetKcal).toBe(np.targets.kcal - 100);

    // extreme request is clamped with a warning
    const extreme = previewNutritionAdjustment(db, userId, { kind: "target", target: 900, source: "controls" });
    if (extreme.mode !== "instant") throw new Error("expected instant");
    expect(extreme.preview.clamped).toBe(true);
    expect(extreme.preview.warnings.length).toBeGreaterThan(0);

    // coach: Persian free text
    const c = handleCoachMessage(db, userId, "می‌خوام روزانه ۲۰۰ کالری بیشتر بخورم.");
    expect(c.source).toBe("local");
    expect(c.intent).toBe("adjust_calories");

    // renew: next cycle (AI) → draft → confirm
    const r = requestNextCycle(db, userId, { choice: "harder" });
    expect(r.mode).toBe("ai");
    await runner.drain();
    const req = db.select().from(t.planAdjustmentRequests).where(eq(t.planAdjustmentRequests.id, (r as { requestId: string }).requestId)).get()!;
    expect(req.status).toBe("ready");
    confirmAdjustment(db, userId, req.id);
    const hist = workoutHistory(db, userId);
    expect(hist).toHaveLength(2);
    expect(hist[1].status).toBe("completed");
    expect(hist[0].status).toBe("active");
  });

  it("keeps the current plan when the AI fails", async () => {
    completeOnboardingFor(db, userId);
    const runner = makeRunner(db);
    requestInitialProgram(db, userId);
    await runner.drain();
    const v1 = getActiveWorkoutVersion(db, userId)!;
    for (const mode of ["auth_error", "invalid_json", "invalid_plan"]) {
      setMockMode(db, mode);
      const r = previewWorkoutAdjustment(db, userId, { daysPerWeek: 4, source: "controls" });
      await runner.drain();
      const job = getJob(db, userId, (r as { jobId: string }).jobId);
      expect(job.status, mode).toBe("failed");
      expect(getActiveWorkoutVersion(db, userId)!.id).toBe(v1.id);
    }
    setMockMode(db, "usage_limit");
    const r = previewWorkoutAdjustment(db, userId, { daysPerWeek: 4, source: "controls" });
    await runner.drain();
    const job = getJob(db, userId, (r as { jobId: string }).jobId);
    expect(job.status).toBe("queued"); // retried later
    expect(job.errorCode).toBe("usage_limit");
    expect(job.runAfter).toBeGreaterThan(Date.now() + 60_000);
  });
});
