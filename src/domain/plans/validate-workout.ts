/**
 * Business-rule validation & safe repair of AI workout plans.
 *
 * The AI proposes; this module decides whether the proposal can be published.
 * Hard errors reject the plan (the job retries with the errors as feedback).
 * Soft issues are repaired deterministically and reported as warnings.
 */
import { CATALOG, equipmentAvailable, similarity, type CatalogExercise } from "@/domain/exercises/catalog";
import { availableEquipment, deriveSafetyFlags, type ProfileData } from "@/domain/profile/model";
import { AiWorkoutPlan, type AiPrescription, type WorkoutPlan } from "./schemas";

export interface WorkoutConstraints {
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: string[];
  avoidStress: string[];
  avoidHighImpact: boolean;
  capIntensity: boolean;
  excludedIds: string[];
}

export interface ValidationResult<T> { ok: boolean; plan?: T; errors: string[]; warnings: string[] }

const byId = new Map(CATALOG.map((e) => [e.id, e]));
export const getCatalogExercise = (id: string) => byId.get(id);

export function constraintsFromProfile(p: ProfileData, overrides: Partial<WorkoutConstraints> = {}): WorkoutConstraints {
  const flags = deriveSafetyFlags(p);
  return {
    daysPerWeek: Number(p.training.daysPerWeek) || 3,
    sessionMinutes: p.training.sessionMinutes ?? 60,
    equipment: availableEquipment(p),
    avoidStress: flags.avoidStress,
    avoidHighImpact: flags.avoidHighImpact,
    capIntensity: flags.capIntensity,
    excludedIds: [],
    ...overrides,
  };
}

export function isEligible(ex: CatalogExercise, c: WorkoutConstraints) {
  if (!ex.media.length) return false; // must have verified instructional media
  if (!equipmentAvailable(ex, c.equipment)) return false;
  if (ex.stress.some((s) => c.avoidStress.includes(s))) return false;
  if (c.avoidHighImpact && ex.stress.includes("high_impact")) return false;
  if (c.excludedIds.includes(ex.id)) return false;
  return true;
}

export function eligibleExercises(c: WorkoutConstraints) {
  return CATALOG.filter((e) => isEligible(e, c));
}

export function bestSubstitute(ex: CatalogExercise, c: WorkoutConstraints, exclude: string[] = []) {
  return CATALOG.filter((b) => b.id !== ex.id && !exclude.includes(b.id) && isEligible(b, c))
    .map((b) => ({ b, s: similarity(ex, b) }))
    .filter((x) => x.s >= 0.4)
    .sort((x, y) => y.s - x.s)[0]?.b;
}

/** Rough session duration estimate in minutes (warm-up included). */
export function estimateSessionMinutes(exs: Pick<AiPrescription, "sets" | "unit" | "repMax" | "restSec">[]) {
  let sec = 8 * 60; // warm-up
  for (const e of exs) {
    const work = e.unit === "reps" ? e.repMax * 3.5 + 15 : e.unit === "seconds" ? e.repMax : e.repMax * 60;
    sec += e.sets * work + Math.max(0, e.sets - 1) * e.restSec + 60; // +1 min transition
  }
  return Math.round(sec / 60);
}

export function validateWorkoutPlan(raw: unknown, c: WorkoutConstraints): ValidationResult<WorkoutPlan> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = AiWorkoutPlan.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 15).map((i) => `schema: ${i.path.join(".")}: ${i.message}`), warnings };
  }
  const plan: WorkoutPlan = structuredClone(parsed.data);

  if (plan.sessions.length !== c.daysPerWeek) {
    errors.push(`plan must contain exactly ${c.daysPerWeek} sessions (got ${plan.sessions.length})`);
  }
  const days = new Set<number>();
  const keys = new Set<string>();
  for (const s of plan.sessions) {
    if (days.has(s.dayOfWeek)) errors.push(`duplicate dayOfWeek ${s.dayOfWeek}`);
    days.add(s.dayOfWeek);
    if (keys.has(s.key)) s.key = `${s.key}_${s.dayOfWeek}`;
    keys.add(s.key);

    const used: string[] = [];
    for (const ex of s.exercises) {
      const cat = byId.get(ex.exerciseId);
      if (!cat) {
        errors.push(`unknown exerciseId "${ex.exerciseId}" in session ${s.key}`);
        continue;
      }
      if (!isEligible(cat, c)) {
        const sub = bestSubstitute(cat, c, used);
        if (!sub) {
          errors.push(`exercise ${cat.id} is not allowed for this user and has no eligible substitute`);
          continue;
        }
        warnings.push(`replaced ${cat.id} → ${sub.id} (equipment/safety constraints)`);
        ex.exerciseId = sub.id;
      }
      used.push(ex.exerciseId);
      if (ex.repMax < ex.repMin) [ex.repMin, ex.repMax] = [ex.repMax, ex.repMin];
      if (ex.unit === "reps" && ex.repMax > 30) errors.push(`implausible rep target ${ex.repMax} for ${ex.exerciseId}`);
      if (c.capIntensity && ex.targetRir !== null && ex.targetRir < 3) {
        ex.targetRir = 3;
        warnings.push(`RIR raised to 3 for ${ex.exerciseId} (safety cap)`);
      }
      ex.alternatives = ex.alternatives.filter((a) => {
        const alt = byId.get(a);
        return alt && a !== ex.exerciseId && isEligible(alt, c);
      });
      if (!ex.alternatives.length) {
        const alt = bestSubstitute(byId.get(ex.exerciseId)!, c, [ex.exerciseId]);
        if (alt) ex.alternatives = [alt.id];
      }
    }
    // keep duration plausible: trim sets from the last exercises until within budget
    const budget = Math.round(c.sessionMinutes * 1.15);
    let est = estimateSessionMinutes(s.exercises);
    let guard = 0;
    while (est > budget && guard++ < 40) {
      const idx = [...s.exercises.keys()].reverse().find((i) => s.exercises[i].sets > 2);
      if (idx === undefined) break;
      s.exercises[idx].sets -= 1;
      est = estimateSessionMinutes(s.exercises);
    }
    if (est > c.sessionMinutes * 1.5) errors.push(`session ${s.key} is far too long (${est} min for a ${c.sessionMinutes} min budget)`);
    else if (guard > 0) warnings.push(`session ${s.key}: sets trimmed to fit ${c.sessionMinutes} min`);
    s.estimatedMinutes = Math.min(180, Math.max(10, est));
  }
  if (c.capIntensity && plan.difficulty > 2) {
    plan.difficulty = 2;
    warnings.push("difficulty capped at 2 due to reported warning signs");
  }
  return { ok: errors.length === 0, plan: errors.length ? undefined : plan, errors, warnings };
}
