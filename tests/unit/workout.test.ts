import { describe, expect, it } from "vitest";
import { applyDifficulty, applySessionMinutes, recommendDifficulty } from "@/domain/adjust/workout";
import { estimateSessionMinutes, validateWorkoutPlan, type WorkoutConstraints } from "@/domain/plans/validate-workout";
import { cyclePhase } from "@/domain/plans/workout-service";
import { e1rm, linearSlope } from "@/domain/progress/analytics";
import { deriveSafetyFlags, emptyProfile } from "@/domain/profile/model";
import { FULL_GYM_EQUIPMENT } from "@/domain/profile/model";
import type { WorkoutPlan } from "@/domain/plans/schemas";

const c: WorkoutConstraints = { daysPerWeek: 1, sessionMinutes: 60, equipment: ["bodyweight", ...FULL_GYM_EQUIPMENT], avoidStress: [], avoidHighImpact: false, capIntensity: false, excludedIds: [] };
const ex = (id: string, sets = 3) => ({ exerciseId: id, sets, unit: "reps" as const, repMin: 8, repMax: 12, restSec: 90, targetRir: 2, loadGuidance: "", notes: "", alternatives: [] });
const plan = (exs = [ex("Barbell_Full_Squat"), ex("Barbell_Bench_Press_-_Medium_Grip"), ex("Barbell_Curl")]): WorkoutPlan => ({
  title: "t", objective: "o", split: "full", durationWeeks: 4, difficulty: 3, progressionRules: [], recoveryGuidance: [], intensityGuidance: "", safetyNotes: [],
  changeSummary: { kept: [], changed: [], reasons: [], targets: [] }, coachMessage: "",
  sessions: [{ key: "s1", dayOfWeek: 6, title: "A", focus: [], estimatedMinutes: 60, warmup: [], cooldown: [], exercises: exs }],
});

describe("plan validation", () => {
  it("accepts a valid plan", () => expect(validateWorkoutPlan(plan(), c).ok).toBe(true));
  it("rejects unknown exercise ids", () => {
    const r = validateWorkoutPlan(plan([ex("Made_Up_Exercise")]), c);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/unknown exerciseId/);
  });
  it("rejects wrong session count and malformed JSON", () => {
    expect(validateWorkoutPlan(plan(), { ...c, daysPerWeek: 3 }).ok).toBe(false);
    expect(validateWorkoutPlan({ title: 1 }, c).ok).toBe(false);
  });
  it("substitutes exercises that stress a painful joint", () => {
    const r = validateWorkoutPlan(plan(), { ...c, avoidStress: ["knee"] });
    expect(r.ok).toBe(true);
    expect(r.plan!.sessions[0].exercises[0].exerciseId).not.toBe("Barbell_Full_Squat");
    expect(r.warnings.join()).toMatch(/replaced/);
  });
  it("substitutes when equipment is missing", () => {
    const r = validateWorkoutPlan(plan(), { ...c, equipment: ["bodyweight", "dumbbell", "bench"] });
    expect(r.ok).toBe(true);
    for (const e of r.plan!.sessions[0].exercises) expect(e.exerciseId).not.toMatch(/^Barbell/);
  });
  it("trims overly long sessions to plausible duration", () => {
    const long = plan(Array.from({ length: 10 }, (_, i) => ex(["Barbell_Full_Squat", "Leg_Press", "Barbell_Curl", "Hammer_Curls", "Triceps_Pushdown", "Face_Pull", "Pullups", "Seated_Cable_Rows", "Side_Lateral_Raise", "Plank"][i], 5)));
    const r = validateWorkoutPlan(long, { ...c, sessionMinutes: 45 });
    if (r.ok) expect(r.plan!.sessions[0].estimatedMinutes).toBeLessThanOrEqual(Math.round(45 * 1.15));
    else expect(r.errors.join()).toMatch(/too long/);
  });
  it("caps intensity when red flags are reported", () => {
    const r = validateWorkoutPlan({ ...plan(), difficulty: 5 }, { ...c, capIntensity: true });
    expect(r.plan!.difficulty).toBe(2);
    expect(r.plan!.sessions[0].exercises[0].targetRir).toBeGreaterThanOrEqual(3);
  });
});

describe("difficulty adjustment", () => {
  it("harder = more compound sets and lower RIR, not heavier weights", () => {
    const out = applyDifficulty(plan(), 1).plan;
    expect(out.sessions[0].exercises[0].sets).toBe(4);
    expect(out.sessions[0].exercises[0].targetRir).toBe(1);
    expect(out.difficulty).toBe(4);
  });
  it("does not add sets when recovery is poor", () => {
    expect(applyDifficulty(plan(), 1, { recoveryConcern: true }).plan.sessions[0].exercises[0].sets).toBe(3);
  });
  it("does not increase beyond the maximum", () => {
    const r = applyDifficulty({ ...plan(), difficulty: 5 }, 1);
    expect(r.plan.difficulty).toBe(5);
    expect(r.warnings.length).toBe(1);
  });
  it("easier lowers volume and raises RIR", () => {
    const e = applyDifficulty(plan(), -1).plan.sessions[0].exercises[0];
    expect(e.sets).toBe(2);
    expect(e.targetRir).toBe(3);
  });
  it("fits sessions to a shorter duration", () => {
    const out = applySessionMinutes(plan([ex("Barbell_Full_Squat", 5), ex("Leg_Press", 5), ex("Barbell_Curl", 5), ex("Hammer_Curls", 5)]), 35).plan;
    expect(estimateSessionMinutes(out.sessions[0].exercises)).toBeLessThanOrEqual(40);
  });
  it("recommends progression only with good data", () => {
    expect(recommendDifficulty({ adherencePct: 90, avgDifficulty: 3, painReports: 0, completed: 6 }).delta).toBe(1);
    expect(recommendDifficulty({ adherencePct: 90, avgDifficulty: 3, painReports: 1, completed: 6 }).delta).toBe(-1);
    expect(recommendDifficulty({ adherencePct: 90, avgDifficulty: 3, painReports: 0, completed: 1 }).delta).toBe(0);
  });
});

describe("progress & lifecycle", () => {
  it("e1RM (Epley) and trend slope", () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.7, 1);
    expect(e1rm(100, 1)).toBe(100);
    expect(linearSlope([{ x: 0, y: 80 }, { x: 7, y: 79.3 }, { x: 14, y: 78.6 }])).toBeCloseTo(-0.1, 5);
  });
  it("cycle phase / expiration", () => {
    const cyc = { startDate: "2026-01-01", endDate: "2026-01-28" };
    expect(cyclePhase(cyc, "2026-01-10").phase).toBe("active");
    expect(cyclePhase(cyc, "2026-01-25").phase).toBe("ending_soon");
    expect(cyclePhase(cyc, "2026-01-29").phase).toBe("ended");
    expect(cyclePhase(cyc, "2026-01-10").week).toBe(2);
  });
  it("safety flags from health answers", () => {
    const p = emptyProfile();
    p.health = { currentPain: ["knee"], injuries: ["shoulder"], redFlags: ["chest_pain"] };
    const f = deriveSafetyFlags(p);
    expect(f.avoidStress).toEqual(["knee"]);
    expect(f.cautionStress).toEqual(["shoulder"]);
    expect(f.capIntensity).toBe(true);
    expect(f.avoidHighImpact).toBe(true);
  });
});
