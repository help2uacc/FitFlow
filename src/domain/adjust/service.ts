/**
 * Plan adjustment orchestration: preview → confirm → new immutable version.
 * Simple changes are computed deterministically (instant preview); structural
 * or free-text changes go through an AI job that produces a draft version.
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { todayISO } from "@/lib/dates";
import { enqueueJob } from "@/domain/ai/jobs";
import { getProfile, saveProfile } from "@/domain/profile/service";
import { constraintsFromProfile, validateWorkoutPlan, getCatalogExercise, isEligible } from "@/domain/plans/validate-workout";
import { activateWorkoutVersion, createWorkoutVersion, cyclePhase, diffWorkoutPlans, getActiveCycle, getActiveWorkoutVersion, rejectWorkoutDraft, extendCycle } from "@/domain/plans/workout-service";
import { activateNutritionVersion, createNutritionVersion, getActiveNutritionVersion, rejectNutritionDraft, diffNutritionPlans } from "@/domain/plans/nutrition-service";
import { allowedFoods, buildGroceryList, computeDay, computeMeal } from "@/domain/plans/nutrition-build";
import { MealSlot, type NutritionPlan, type WorkoutPlan } from "@/domain/plans/schemas";
import { foodsMap, listFoods } from "@/domain/nutrition/foods";
import { CATALOG, similarity } from "@/domain/exercises/catalog";
import { nutritionStats, rangeFor, recentFeedback, weightSeries, workoutAdherence } from "@/domain/progress/analytics";
import { applyCardio, applyDifficulty, applyEmphasis, applyMuscleFocus, applySessionMinutes, recommendDifficulty, replaceExerciseInPlan } from "./workout";
import { previewCalorieChange, recommendCalorieAdjustment } from "./nutrition";
import { suggestReplacements, type ReplaceCriterion } from "./meal-replace";

// ------------------------------------------------------------------ workout
export const WorkoutAdjustInput = z.object({
  difficultyDelta: z.number().int().min(-2).max(2).optional(),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  emphasis: z.enum(["strength", "hypertrophy"]).optional(),
  muscleFocus: z.array(z.enum(["chest", "back", "shoulders", "arms", "abs", "glutes", "legs", "calves"])).max(4).optional(),
  muscleScope: z.array(z.enum(["chest", "back", "shoulders", "arms", "abs", "glutes", "legs", "calves"])).max(4).optional(),
  cardio: z.enum(["add", "reduce"]).optional(),
  sessionKey: z.string().max(40).optional(),
  text: z.string().trim().max(1000).optional(),
  recommend: z.boolean().optional(),
  useAi: z.boolean().optional(),
  source: z.enum(["controls", "coach", "profile_change", "renewal"]).default("controls"),
});
export type WorkoutAdjustInput = z.infer<typeof WorkoutAdjustInput>;

function recentStats(db: DB, userId: string) {
  const { from, to } = rangeFor("14");
  const adh = workoutAdherence(db, userId, from, to);
  const fb = recentFeedback(db, userId, from);
  return { adherencePct: adh.adherencePct, avgDifficulty: fb.avgDifficulty, painReports: fb.painReports.length, completed: adh.completed };
}

export function previewWorkoutAdjustment(db: DB, userId: string, input: WorkoutAdjustInput) {
  const active = getActiveWorkoutVersion(db, userId);
  if (!active) throw new AppError("no_plan", "برنامه تمرینی فعالی وجود ندارد.", 409);
  const current = active.plan as WorkoutPlan;
  const profile = getProfile(db, userId);
  const stats = recentStats(db, userId);
  const notes: string[] = [];
  const warnings: string[] = [];
  let delta = input.difficultyDelta ?? 0;
  if (input.recommend) {
    const rec = recommendDifficulty(stats);
    delta = rec.delta;
    notes.push(`پیشنهاد بر اساس پیشرفت: ${rec.reason}`);
  }
  const structural = (input.daysPerWeek && input.daysPerWeek !== current.sessions.length) || !!input.text || input.useAi;
  const params = { ...input, difficultyDelta: delta || undefined };
  if (structural) {
    const reqId = newId();
    db.insert(t.planAdjustmentRequests).values({ id: reqId, userId, domain: "workout", intent: "revise_workout", source: input.source, rawText: input.text ?? null, params, status: "generating" }).run();
    const { job, duplicate } = enqueueJob(db, { userId, type: "revise_workout", payload: { requestId: reqId, reason: describeWorkoutChange(input, delta), request: { ...params, text: input.text ?? null } }, dedupeKey: "revise_workout" });
    if (duplicate) {
      db.update(t.planAdjustmentRequests).set({ status: "cancelled" }).where(eq(t.planAdjustmentRequests.id, reqId)).run();
      throw new AppError("duplicate", "یک درخواست اصلاح برنامه در حال پردازش است.", 409, { jobId: job.id });
    }
    db.update(t.planAdjustmentRequests).set({ aiJobId: job.id }).where(eq(t.planAdjustmentRequests.id, reqId)).run();
    return { requestId: reqId, mode: "ai" as const, jobId: job.id };
  }

  const constraints = constraintsFromProfile(profile, input.sessionMinutes ? { sessionMinutes: input.sessionMinutes } : {});
  let plan = structuredClone(current);
  const apply = (o: { plan: WorkoutPlan; notes: string[]; warnings: string[] }) => { plan = o.plan; notes.push(...o.notes); warnings.push(...o.warnings); };
  if (delta) {
    const recoveryConcern = delta > 0 && (stats.painReports > 0 || (stats.avgDifficulty ?? 0) >= 4.5);
    apply(applyDifficulty(plan, delta, { recoveryConcern, sessionKey: input.sessionKey, muscles: input.muscleScope }));
  }
  if (input.emphasis) apply(applyEmphasis(plan, input.emphasis));
  if (input.muscleFocus?.length) apply(applyMuscleFocus(plan, input.muscleFocus, constraints));
  if (input.cardio) apply(applyCardio(plan, input.cardio, constraints));
  if (input.sessionMinutes) apply(applySessionMinutes(plan, input.sessionMinutes, constraints));
  const v = validateWorkoutPlan(plan, { ...constraints, daysPerWeek: plan.sessions.length });
  if (!v.ok || !v.plan) throw new AppError("invalid_adjustment", "این تغییر با محدودیت‌های برنامه سازگار نیست.", 400, { errors: v.errors });
  warnings.push(...v.warnings.filter((w) => !w.startsWith("replaced")));
  const diff = diffWorkoutPlans(current, v.plan);
  const reqId = newId();
  const preview = { plan: v.plan, diff, notes, warnings, reason: describeWorkoutChange(input, delta) };
  db.insert(t.planAdjustmentRequests).values({ id: reqId, userId, domain: "workout", intent: "adjust_workout", source: input.source, rawText: null, params, status: "previewed", preview }).run();
  return { requestId: reqId, mode: "instant" as const, preview: { diff, notes, warnings, before: current, after: v.plan } };
}

function describeWorkoutChange(i: WorkoutAdjustInput, delta: number) {
  const parts: string[] = [];
  if (delta) parts.push(delta > 0 ? (delta > 1 ? "خیلی سخت‌تر" : "کمی سخت‌تر") : delta < -1 ? "خیلی سبک‌تر" : "کمی سبک‌تر");
  if (i.daysPerWeek) parts.push(`${i.daysPerWeek} روز در هفته`);
  if (i.sessionMinutes) parts.push(`جلسات ${i.sessionMinutes} دقیقه‌ای`);
  if (i.emphasis) parts.push(i.emphasis === "strength" ? "تمرکز قدرتی" : "تمرکز حجمی");
  if (i.muscleFocus?.length) parts.push("اولویت عضلانی");
  if (i.cardio) parts.push(i.cardio === "add" ? "هوازی بیشتر" : "هوازی کمتر");
  if (i.text) parts.push("درخواست متنی");
  return "تنظیم برنامه: " + (parts.join("، ") || "بدون تغییر");
}

function ownRequest(db: DB, userId: string, id: string) {
  const r = db.select().from(t.planAdjustmentRequests).where(and(eq(t.planAdjustmentRequests.id, id), eq(t.planAdjustmentRequests.userId, userId))).get();
  if (!r) throw notFound("درخواست");
  return r;
}

export function getAdjustmentRequest(db: DB, userId: string, id: string) {
  return ownRequest(db, userId, id);
}

export function listAdjustmentRequests(db: DB, userId: string) {
  return db.select().from(t.planAdjustmentRequests).where(eq(t.planAdjustmentRequests.userId, userId)).orderBy(desc(t.planAdjustmentRequests.createdAt)).limit(30).all();
}

/** Persist profile fields implied by an applied workout change. */
function syncProfileFromParams(db: DB, userId: string, params: Record<string, unknown>, plan?: WorkoutPlan) {
  const p = getProfile(db, userId);
  let changed = false;
  if (typeof params.daysPerWeek === "number") { p.training.daysPerWeek = String(params.daysPerWeek); changed = true; }
  if (typeof params.sessionMinutes === "number") { p.training.sessionMinutes = params.sessionMinutes; changed = true; }
  if (plan && plan.difficulty !== p.preferences.difficulty) { p.preferences.difficulty = plan.difficulty; changed = true; }
  if (changed) saveProfile(db, userId, p);
}

export function confirmAdjustment(db: DB, userId: string, id: string) {
  const r = ownRequest(db, userId, id);
  if (r.status === "previewed") {
    const preview = r.preview as { plan: WorkoutPlan | NutritionPlan; reason: string; calorie?: { kcal: number; proteinG: number }; protein?: string };
    if (r.domain === "workout") {
      const active = getActiveWorkoutVersion(db, userId);
      if (!active) throw new AppError("no_plan", "برنامه فعالی وجود ندارد.", 409);
      const res = createWorkoutVersion(db, { userId, plan: preview.plan as WorkoutPlan, reason: preview.reason, cycle: { mode: "existing", cycleId: active.cycleId }, previousVersionId: active.id, profileSnapshot: {}, activate: true });
      syncProfileFromParams(db, userId, r.params as Record<string, unknown>, preview.plan as WorkoutPlan);
      db.update(t.planAdjustmentRequests).set({ status: "applied", resultVersionId: res.versionId, updatedAt: Date.now() }).where(eq(t.planAdjustmentRequests.id, id)).run();
      return { versionId: res.versionId };
    }
    const active = getActiveNutritionVersion(db, userId);
    if (!active) throw new AppError("no_plan", "برنامه غذایی فعالی وجود ندارد.", 409);
    const res = createNutritionVersion(db, { userId, plan: preview.plan as NutritionPlan, reason: preview.reason, cycleId: active.cycleId, previousVersionId: active.id, profileSnapshot: {}, activate: true });
    const p = getProfile(db, userId);
    p.nutrition.calorieOverride = (preview.plan as NutritionPlan).targets.kcal;
    if (preview.protein) p.nutrition.proteinPreference = preview.protein === "increase" ? "high" : "normal";
    saveProfile(db, userId, p);
    db.update(t.planAdjustmentRequests).set({ status: "applied", resultVersionId: res.versionId, updatedAt: Date.now() }).where(eq(t.planAdjustmentRequests.id, id)).run();
    return { versionId: res.versionId };
  }
  if (r.status === "ready" && r.resultVersionId) {
    if (r.domain === "workout") {
      activateWorkoutVersion(db, userId, r.resultVersionId);
      const v = db.select().from(t.workoutPlanVersions).where(eq(t.workoutPlanVersions.id, r.resultVersionId)).get();
      syncProfileFromParams(db, userId, r.params as Record<string, unknown>, v?.plan as WorkoutPlan);
    } else {
      activateNutritionVersion(db, userId, r.resultVersionId);
    }
    db.update(t.planAdjustmentRequests).set({ status: "applied", updatedAt: Date.now() }).where(eq(t.planAdjustmentRequests.id, id)).run();
    return { versionId: r.resultVersionId };
  }
  throw new AppError("bad_state", "این درخواست قابل اعمال نیست.", 409);
}

export function rejectAdjustment(db: DB, userId: string, id: string) {
  const r = ownRequest(db, userId, id);
  if (r.status === "ready" && r.resultVersionId) {
    if (r.domain === "workout") rejectWorkoutDraft(db, userId, r.resultVersionId);
    else rejectNutritionDraft(db, userId, r.resultVersionId);
  }
  if (!["previewed", "ready", "failed"].includes(r.status)) throw new AppError("bad_state", "این درخواست قابل رد نیست.", 409);
  db.update(t.planAdjustmentRequests).set({ status: "rejected", updatedAt: Date.now() }).where(eq(t.planAdjustmentRequests.id, id)).run();
}

/** Accept or discard a draft version directly (e.g. from a notification link). */
export function decideDraft(db: DB, userId: string, domain: "workout" | "nutrition", versionId: string, accept: boolean) {
  const req = db.select().from(t.planAdjustmentRequests).where(and(eq(t.planAdjustmentRequests.userId, userId), eq(t.planAdjustmentRequests.resultVersionId, versionId))).get();
  if (req && req.status === "ready") return accept ? confirmAdjustment(db, userId, req.id) : rejectAdjustment(db, userId, req.id);
  if (domain === "workout") return accept ? activateWorkoutVersion(db, userId, versionId) : rejectWorkoutDraft(db, userId, versionId);
  return accept ? activateNutritionVersion(db, userId, versionId) : rejectNutritionDraft(db, userId, versionId);
}

// ------------------------------------------------------------------ exercise substitution
export function exerciseAlternatives(db: DB, userId: string, exerciseId: string) {
  const ex = getCatalogExercise(exerciseId);
  if (!ex) throw notFound("حرکت");
  const c = constraintsFromProfile(getProfile(db, userId));
  return CATALOG.filter((b) => b.id !== ex.id && isEligible(b, c))
    .map((b) => ({ exercise: b, score: similarity(ex, b) }))
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ exercise: b, score }) => ({ id: b.id, nameFa: b.nameFa, nameEn: b.nameEn, equipment: b.equipment, primaryMuscles: b.primaryMuscles, image: b.media[0]?.localPath ?? null, score }));
}

export const SubstituteInput = z.object({ sessionKey: z.string().max(40), index: z.number().int().min(0).max(20), newExerciseId: z.string().max(120) });

export function substituteExerciseInPlan(db: DB, userId: string, input: z.infer<typeof SubstituteInput>) {
  const active = getActiveWorkoutVersion(db, userId);
  if (!active) throw new AppError("no_plan", "برنامه فعالی وجود ندارد.", 409);
  const plan = active.plan as WorkoutPlan;
  const slot = plan.sessions.find((s) => s.key === input.sessionKey)?.exercises[input.index];
  if (!slot) throw notFound("حرکت در برنامه");
  if (!exerciseAlternatives(db, userId, slot.exerciseId).some((a) => a.id === input.newExerciseId)) throw new AppError("not_allowed", "این حرکت جایگزین مناسبی برای شما نیست.");
  const out = replaceExerciseInPlan(plan, input.sessionKey, input.index, input.newExerciseId);
  const res = createWorkoutVersion(db, { userId, plan: out.plan, reason: out.notes[0] ?? "جایگزینی حرکت", cycle: { mode: "existing", cycleId: active.cycleId }, previousVersionId: active.id, profileSnapshot: {}, activate: true });
  return { versionId: res.versionId };
}

// ------------------------------------------------------------------ nutrition
export const NutritionAdjustInput = z.object({
  kind: z.enum(["delta", "target", "protein", "recommend", "ai"]),
  delta: z.number().int().min(-1000).max(1000).optional(),
  target: z.number().int().min(800).max(6000).optional(),
  protein: z.enum(["increase", "decrease"]).optional(),
  mealsPerDay: z.number().int().min(2).max(6).optional(),
  text: z.string().trim().max(1000).optional(),
  source: z.enum(["controls", "coach", "profile_change", "renewal"]).default("controls"),
});

export function previewNutritionAdjustment(db: DB, userId: string, input: z.infer<typeof NutritionAdjustInput>) {
  const active = getActiveNutritionVersion(db, userId);
  if (!active) throw new AppError("no_nutrition", "برنامه غذایی فعالی وجود ندارد.", 409);
  const plan = active.plan as NutritionPlan;
  const profile = getProfile(db, userId);
  if (input.kind === "ai") {
    const reqId = newId();
    const params = { mealsPerDay: input.mealsPerDay ?? null, text: input.text ?? null, recomputeTargets: input.source === "profile_change" };
    if (input.mealsPerDay) { profile.nutrition.mealsPerDay = String(input.mealsPerDay); saveProfile(db, userId, profile); }
    db.insert(t.planAdjustmentRequests).values({ id: reqId, userId, domain: "nutrition", intent: "revise_nutrition", source: input.source, rawText: input.text ?? null, params, status: "generating" }).run();
    const { job, duplicate } = enqueueJob(db, { userId, type: "revise_nutrition", payload: { requestId: reqId, reason: "اصلاح برنامه غذایی", request: params }, dedupeKey: "revise_nutrition" });
    if (duplicate) {
      db.update(t.planAdjustmentRequests).set({ status: "cancelled" }).where(eq(t.planAdjustmentRequests.id, reqId)).run();
      throw new AppError("duplicate", "یک درخواست اصلاح برنامه غذایی در حال پردازش است.", 409, { jobId: job.id });
    }
    db.update(t.planAdjustmentRequests).set({ aiJobId: job.id }).where(eq(t.planAdjustmentRequests.id, reqId)).run();
    return { requestId: reqId, mode: "ai" as const, jobId: job.id };
  }
  const foods = foodsMap(db, userId);
  let rec: { delta: number; reason: string } | null = null;
  let req: Parameters<typeof previewCalorieChange>[3];
  if (input.kind === "recommend") {
    const { from, to } = rangeFor("30");
    const w = weightSeries(db, userId, from, to);
    const n = nutritionStats(db, userId, from, to);
    rec = recommendCalorieAdjustment({ goal: profile.goals.primary, trendKgPerWeek: w.trendKgPerWeek, loggedDays: n.loggedDays, weightKg: profile.personal.weightKg, adherencePct: n.adherencePct });
    req = { kind: "delta", delta: rec.delta };
  } else if (input.kind === "delta") req = { kind: "delta", delta: input.delta ?? 0 };
  else if (input.kind === "target") req = { kind: "target", target: input.target ?? plan.targets.kcal };
  else req = { kind: "protein", change: input.protein ?? "increase" };
  const p = previewCalorieChange(plan, profile, foods, req);
  const reason = input.kind === "protein" ? `تغییر پروتئین (${input.protein === "decrease" ? "کمتر" : "بیشتر"})` : `تنظیم کالری: ${Math.round(p.current.kcal)} ← ${Math.round(p.proposed.kcal)}`;
  const reqId = newId();
  db.insert(t.planAdjustmentRequests).values({
    id: reqId, userId, domain: "nutrition", intent: input.kind === "protein" ? "adjust_macros" : "adjust_calories", source: input.source, rawText: null, params: input, status: "previewed",
    preview: { plan: p.plan, reason, protein: input.kind === "protein" ? input.protein : undefined },
  }).run();
  return {
    requestId: reqId, mode: "instant" as const,
    preview: { current: p.current, requested: p.requested, proposed: p.proposed, clamped: p.clamped, warnings: p.warnings, effects: p.effects, recommendation: rec, diff: diffNutritionPlans(plan, p.plan) },
  };
}

// ------------------------------------------------------------------ meal replacement
export const MealReplaceQuery = z.object({ plannedMealId: z.string().max(80), criterion: z.enum(["similar", "lower_calorie", "higher_protein", "cheaper", "quick"]).default("similar") });
export const MealReplaceApply = z.object({
  plannedMealId: z.string().max(80), scope: z.enum(["today", "plan"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(140), items: z.array(z.object({ foodId: z.string().max(120), grams: z.number().positive().max(1500) })).min(1).max(10),
});

export function mealReplacementOptions(db: DB, userId: string, q: z.infer<typeof MealReplaceQuery>) {
  const meal = db.select().from(t.plannedMeals).where(and(eq(t.plannedMeals.id, q.plannedMealId), eq(t.plannedMeals.userId, userId))).get();
  if (!meal) throw notFound("وعده");
  const items = db.select().from(t.plannedMealItems).where(eq(t.plannedMealItems.plannedMealId, meal.id)).all();
  const v = db.select().from(t.nutritionPlanVersions).where(eq(t.nutritionPlanVersions.id, meal.planVersionId)).get()!;
  const plan = v.plan as NutritionPlan;
  const profile = getProfile(db, userId);
  const all = listFoods(db, userId);
  const fav = profile.nutrition.favorites ?? [];
  const favTags = fav.flatMap((f) => ({ rice: ["rice"], chicken: ["meat"], red_meat: ["red_meat"], fish: ["fish"], eggs: ["egg"], dairy: ["dairy"], legumes: ["legume"], bread: ["bread"], stews: ["stew"], fruit: ["fruit"], nuts: ["nuts"] } as Record<string, string[]>)[f] ?? []);
  return suggestReplacements({
    meal: { slot: meal.slot, title: meal.title, items: items.map((i) => ({ foodId: i.foodId, grams: i.grams })), totals: { kcal: meal.kcal, proteinG: meal.proteinG, carbsG: meal.carbsG, fatG: meal.fatG } },
    allowed: allowedFoods(all, profile), foods: new Map(all.map((f) => [f.id, f])), alternatives: plan.alternatives.map((a) => ({ slot: a.slot, title: a.title, items: a.items.map((i) => ({ foodId: i.foodId, grams: i.grams })) })),
    criterion: q.criterion as ReplaceCriterion, favoriteTags: favTags,
  });
}

export function applyMealReplacement(db: DB, userId: string, input: z.infer<typeof MealReplaceApply>) {
  const meal = db.select().from(t.plannedMeals).where(and(eq(t.plannedMeals.id, input.plannedMealId), eq(t.plannedMeals.userId, userId))).get();
  if (!meal) throw notFound("وعده");
  const profile = getProfile(db, userId);
  const all = listFoods(db, userId);
  const allowed = new Set(allowedFoods(all, profile).map((f) => f.id));
  const fm = new Map(all.map((f) => [f.id, f]));
  for (const i of input.items) if (!allowed.has(i.foodId)) throw new AppError("not_allowed", "این ماده غذایی با محدودیت‌های شما سازگار نیست.");
  const v = db.select().from(t.nutritionPlanVersions).where(eq(t.nutritionPlanVersions.id, meal.planVersionId)).get()!;
  if (v.status !== "active") throw new AppError("stale_plan", "این وعده متعلق به برنامه فعال نیست.", 409);
  const plan = v.plan as NutritionPlan;
  const day = plan.days.find((d) => d.dayOfWeek === meal.dayIndex)!;
  const old = day.meals[meal.sortOrder];
  const computed = computeMeal({ slot: meal.slot, title: input.title, time: meal.time ?? old?.time ?? "12:00", prepMinutes: old?.prepMinutes ?? 15, instructions: "", items: input.items.map((i) => ({ food: fm.get(i.foodId)!, grams: i.grams })) });
  if (input.scope === "today") {
    db.delete(t.mealSubstitutions).where(and(eq(t.mealSubstitutions.userId, userId), eq(t.mealSubstitutions.plannedMealId, meal.id), eq(t.mealSubstitutions.date, input.date))).run();
    db.insert(t.mealSubstitutions).values({ id: newId(), userId, planVersionId: v.id, plannedMealId: meal.id, date: input.date, title: input.title, items: computed.items }).run();
    return { scope: "today" as const };
  }
  const newPlan = structuredClone(plan);
  const nd = newPlan.days.find((d) => d.dayOfWeek === meal.dayIndex)!;
  nd.meals[meal.sortOrder] = computed;
  Object.assign(nd, computeDay(nd.dayOfWeek, nd.meals));
  newPlan.groceryList = buildGroceryList(newPlan.days, fm);
  const res = createNutritionVersion(db, { userId, plan: newPlan, reason: `جایگزینی وعده: ${input.title}`, cycleId: v.cycleId, previousVersionId: v.id, profileSnapshot: {}, activate: true });
  db.insert(t.mealSubstitutions).values({ id: newId(), userId, planVersionId: res.versionId, plannedMealId: meal.id, date: null, title: input.title, items: computed.items }).run();
  return { scope: "plan" as const, versionId: res.versionId };
}

// ------------------------------------------------------------------ renewal
export const RenewInput = z.object({
  choice: z.enum(["maintain", "harder", "easier", "prioritize", "frequency", "calories", "ai"]),
  muscleFocus: z.array(z.string().max(20)).max(4).optional(),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  calorieDelta: z.number().int().min(-500).max(500).optional(),
  weeks: z.number().int().min(4).max(6).optional(),
  text: z.string().trim().max(1000).optional(),
});

export function renewalStatus(db: DB, userId: string) {
  const cycle = getActiveCycle(db, userId);
  if (!cycle) return null;
  const ph = cyclePhase(cycle);
  const stats = recentStats(db, userId);
  const rec = recommendDifficulty(stats);
  const { from, to } = { from: cycle.startDate, to: todayISO() };
  const adh = workoutAdherence(db, userId, from, to);
  return { cycle, ...ph, adherence: adh, recommendation: rec, earlyWarning: ph.elapsedDays < ph.totalDays * 0.6 ? "داده پیشرفت این دوره هنوز کم است؛ مقایسه دقیق ممکن نیست." : null, insufficientData: adh.completed < 4 };
}

export function requestNextCycle(db: DB, userId: string, input: z.infer<typeof RenewInput>) {
  const active = getActiveWorkoutVersion(db, userId);
  if (!active) throw new AppError("no_plan", "برنامه فعالی وجود ندارد.", 409);
  const profile = getProfile(db, userId);
  const weeks = input.weeks ?? (Number(profile.preferences.cycleWeeks) || 4);
  if (input.choice === "maintain") {
    const res = createWorkoutVersion(db, { userId, plan: structuredClone(active.plan as WorkoutPlan), reason: "دوره جدید با همان برنامه", cycle: { mode: "new", startDate: todayISO(), weeks }, previousVersionId: active.id, profileSnapshot: {}, activate: true });
    return { mode: "instant" as const, versionId: res.versionId };
  }
  let difficultyDelta: number | null = null;
  if (input.choice === "harder") difficultyDelta = 1;
  if (input.choice === "easier") difficultyDelta = -1;
  if (input.choice === "ai") difficultyDelta = recommendDifficulty(recentStats(db, userId)).delta || null;
  const request = {
    choice: input.choice, difficultyDelta, daysPerWeek: input.choice === "frequency" ? input.daysPerWeek ?? null : null,
    muscleFocus: input.choice === "prioritize" ? input.muscleFocus ?? null : null, calorieDelta: input.choice === "calories" ? input.calorieDelta ?? null : null, text: input.text ?? null,
  };
  const reqId = newId();
  db.insert(t.planAdjustmentRequests).values({ id: reqId, userId, domain: "workout", intent: "generate_next_cycle", source: "renewal", rawText: input.text ?? null, params: request, status: "generating" }).run();
  const { job, duplicate } = enqueueJob(db, { userId, type: "next_cycle", payload: { requestId: reqId, reason: "دوره جدید بر اساس پیشرفت", request, weeks }, dedupeKey: "next_cycle" });
  if (duplicate) {
    db.update(t.planAdjustmentRequests).set({ status: "cancelled" }).where(eq(t.planAdjustmentRequests.id, reqId)).run();
    throw new AppError("duplicate", "ساخت دوره جدید در حال انجام است.", 409, { jobId: job.id });
  }
  db.update(t.planAdjustmentRequests).set({ aiJobId: job.id }).where(eq(t.planAdjustmentRequests.id, reqId)).run();
  return { mode: "ai" as const, requestId: reqId, jobId: job.id };
}

export { extendCycle, MealSlot };
