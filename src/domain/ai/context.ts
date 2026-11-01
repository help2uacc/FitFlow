/**
 * Builds the minimal structured context sent to the AI for each task.
 * Only planning-relevant data is included — no names, emails or free-form
 * identity data.
 */
import type { DB } from "@/db/client";
import { CATALOG } from "@/domain/exercises/catalog";
import { allowedFoods, excludedFoodTags, type FoodRow } from "@/domain/plans/nutrition-build";
import { ageOf, deriveSafetyFlags, nutritionEnabled, type ProfileData } from "@/domain/profile/model";
import { getProfile } from "@/domain/profile/service";
import { constraintsFromProfile, eligibleExercises, type WorkoutConstraints } from "@/domain/plans/validate-workout";
import { getActiveWorkoutVersion, getActiveCycle } from "@/domain/plans/workout-service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import type { NutritionPlan, WorkoutPlan } from "@/domain/plans/schemas";
import { exerciseProgress, nutritionStats, personalBests, rangeFor, recentFeedback, weightSeries, workoutAdherence } from "@/domain/progress/analytics";
import { listFoods } from "@/domain/nutrition/foods";
import { computeTargets } from "@/domain/nutrition/calc";
import { todayISO } from "@/lib/dates";

export function profileSummary(p: ProfileData) {
  return {
    age: ageOf(p), sex: p.personal.sex ?? null, heightCm: p.personal.heightCm ?? null, weightKg: p.personal.weightKg ?? null,
    bodyFatPctEstimate: p.personal.bodyFatKnown ? p.personal.bodyFatPct ?? null : null,
    desiredShape: p.personal.desiredShape ?? null, improveAreas: p.personal.improveAreas ?? [],
    goals: p.goals, experience: { ...p.experience, successfulMethods: p.experience.successfulMethods ?? null, dislikedExercises: p.experience.dislikedExercises ?? null },
    training: p.training, preferences: p.preferences, lifestyle: p.lifestyle,
  };
}

export function safetySummary(p: ProfileData) {
  const f = deriveSafetyFlags(p);
  return {
    ...f,
    conditions: (p.health.conditions ?? []).filter((x) => x !== "none"),
    previousInjuries: (p.health.injuries ?? []).filter((x) => x !== "none"),
    currentPain: (p.health.currentPain ?? []).filter((x) => x !== "none"),
    restrictionsText: p.health.restrictions ?? null,
    medicationsText: p.health.medications ?? null,
  };
}

export function compactCatalog(c: WorkoutConstraints) {
  return eligibleExercises(c).map((e) => ({
    id: e.id, en: e.nameEn, fa: e.nameFa, pattern: e.pattern, mechanic: e.mechanic, level: e.level, equipment: e.equipment, primary: e.primaryMuscles, stress: e.stress,
  }));
}

export function compactWorkoutPlan(plan: WorkoutPlan | null) {
  if (!plan) return null;
  return {
    title: plan.title, split: plan.split, difficulty: plan.difficulty,
    sessions: plan.sessions.map((s) => ({ key: s.key, dayOfWeek: s.dayOfWeek, title: s.title, estimatedMinutes: s.estimatedMinutes,
      exercises: s.exercises.map((e) => ({ id: e.exerciseId, sets: e.sets, unit: e.unit, reps: `${e.repMin}-${e.repMax}`, rir: e.targetRir, rest: e.restSec })) })),
  };
}

export function historySummary(db: DB, userId: string, plan: WorkoutPlan | null) {
  const { from, to } = rangeFor("30");
  const adherence = workoutAdherence(db, userId, from, to);
  const fb = recentFeedback(db, userId, from);
  const ids = plan ? [...new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))] : [];
  const progress = ids.map((id) => {
    const pts = exerciseProgress(db, userId, id, rangeFor("90").from, to);
    if (!pts.length) return null;
    return { id, sessions: pts.length, firstE1rm: pts[0].bestE1rm, lastE1rm: pts[pts.length - 1].bestE1rm, lastTopWeight: pts[pts.length - 1].topWeight };
  }).filter(Boolean);
  const weight = weightSeries(db, userId, rangeFor("30").from, to);
  const nutrition = nutritionStats(db, userId, rangeFor("14").from, to);
  return {
    last30Days: adherence, avgSessionDifficulty1to5: fb.avgDifficulty, painReports: fb.painReports.slice(0, 5),
    latestCheckins: fb.checkins.slice(0, 2).map(({ id: _id, userId: _u, createdAt: _c, ...c }) => c),
    exerciseProgress: progress, personalBests: personalBests(db, userId).slice(0, 8),
    weightTrendKgPerWeek: weight.trendKgPerWeek, latestWeightKg: weight.points.at(-1)?.weightKg ?? null,
    nutrition: { loggedDays14: nutrition.loggedDays, avgKcalOnLoggedDays: nutrition.avgKcal, avgProteinOnLoggedDays: nutrition.avgProteinG, adherencePct: nutrition.adherencePct, note: "days without logs are missing data, not zero intake" },
  };
}

export function buildWorkoutContext(db: DB, userId: string, overrides: Partial<WorkoutConstraints> = {}) {
  const profile = getProfile(db, userId);
  const constraints = constraintsFromProfile(profile, overrides);
  const active = getActiveWorkoutVersion(db, userId);
  const plan = (active?.plan as WorkoutPlan | undefined) ?? null;
  return {
    profile, constraints, activeVersion: active, plan,
    context: {
      today: todayISO(), profile: profileSummary(profile), safety: safetySummary(profile),
      constraints: { ...constraints, preferredDays: (profile.training.preferredDays ?? []).map(Number) },
      exerciseCatalog: compactCatalog(constraints), currentPlan: compactWorkoutPlan(plan),
      history: active ? historySummary(db, userId, plan) : null, cycle: getActiveCycle(db, userId),
      nutritionEnabled: nutritionEnabled(profile),
    } as Record<string, unknown>,
  };
}

export function compactFoods(foods: FoodRow[]) {
  return foods.map((f) => ({ id: f.id, fa: f.nameFa, en: f.nameEn, cat: f.category, serving: `${f.servingG}g = ${f.servingLabel}`, per100g: { kcal: f.kcal100, p: f.protein100, c: f.carbs100, f: f.fat100 }, tags: f.tags, cost: f.costLevel }));
}

export function buildNutritionContext(db: DB, userId: string) {
  const profile = getProfile(db, userId);
  const foods = listFoods(db, userId);
  const allowed = allowedFoods(foods, profile);
  const targets = computeTargets(profile);
  const active = getActiveNutritionVersion(db, userId);
  const workout = getActiveWorkoutVersion(db, userId);
  const wplan = workout?.plan as WorkoutPlan | undefined;
  const plan = (active?.plan as NutritionPlan | undefined) ?? null;
  return {
    profile, foods, allowed, targets, activeVersion: active, plan,
    context: {
      today: todayISO(), profile: profileSummary(profile), nutrition: profile.nutrition, excludedFoodTags: excludedFoodTags(profile),
      targets: { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG },
      trainingDays: wplan ? wplan.sessions.map((s) => ({ dayOfWeek: s.dayOfWeek, title: s.title })) : [],
      trainingTime: profile.training.preferredTime ?? null,
      foodCatalog: compactFoods(allowed),
      currentPlan: plan ? { days: plan.days.map((d) => ({ dayOfWeek: d.dayOfWeek, meals: d.meals.map((m) => ({ slot: m.slot, title: m.title, time: m.time, items: m.items.map((i) => ({ foodId: i.foodId, grams: i.grams })) })) })) } : null,
      history: workout ? historySummary(db, userId, wplan ?? null) : null,
    } as Record<string, unknown>,
  };
}

export { CATALOG };
