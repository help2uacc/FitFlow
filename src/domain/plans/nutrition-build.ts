/**
 * Turns an AI meal selection into a publishable nutrition plan.
 * The AI chooses foods & arranges meals; nutrient totals, target fitting and
 * the grocery list are computed deterministically from the food database.
 */
import { round1, scaleFood, sumMacros, type Macros, type Targets } from "@/domain/nutrition/calc";
import type { ProfileData } from "@/domain/profile/model";
import { AiNutritionPlan, type DayComputed, type MealComputed, type MealItemComputed, type NutritionPlan } from "./schemas";
import type { ValidationResult } from "./validate-workout";

export interface FoodRow {
  id: string; nameFa: string; nameEn: string; category: string; servingG: number; servingLabel: string;
  kcal100: number; protein100: number; carbs100: number; fat100: number; tags: string[]; costLevel: number; userId?: string | null;
}

/** Tags a user must avoid, derived from allergies & dietary restrictions. */
export function excludedFoodTags(p: ProfileData): string[] {
  const out = new Set<string>();
  const map: Record<string, string[]> = {
    lactose: ["lactose"], gluten: ["gluten"], nuts: ["nuts"], eggs: ["egg"], seafood: ["seafood", "fish"], soy: ["soy"],
    vegetarian: ["meat", "fish", "seafood"], vegan: ["animal", "meat", "fish", "seafood", "egg", "lactose"], no_red_meat: ["red_meat"],
  };
  for (const a of [...(p.nutrition.allergies ?? []), ...(p.nutrition.restrictions ?? [])]) for (const tag of map[a] ?? []) out.add(tag);
  return [...out];
}

export function allowedFoods(foods: FoodRow[], p: ProfileData) {
  const ex = excludedFoodTags(p);
  return foods.filter((f) => !f.tags.some((t) => ex.includes(t)));
}

const isProteinAnchor = (f: FoodRow) => f.kcal100 > 0 && (f.protein100 * 4) / f.kcal100 >= 0.35;
const roundGrams = (g: number) => Math.max(5, Math.round(g / 5) * 5);

function computeItem(f: FoodRow, grams: number): MealItemComputed {
  const m = scaleFood(f, grams);
  return { foodId: f.id, grams, nameFa: f.nameFa, serving: f.servingLabel, ...m };
}
const totalsOf = (items: Macros[]) => sumMacros(items);

/**
 * Scale a day's items so calories hit `kcal` and protein approaches `proteinG`.
 * Solves a 2×2 system (protein-dense items vs the rest) with clamped factors.
 */
export function fitItemsToTargets(
  items: { food: FoodRow; grams: number }[],
  target: { kcal: number; proteinG: number },
): { food: FoodRow; grams: number }[] {
  const anchors = items.filter((i) => isProteinAnchor(i.food));
  const rest = items.filter((i) => !isProteinAnchor(i.food));
  const sum = (xs: typeof items) => sumMacros(xs.map((i) => scaleFood(i.food, i.grams)));
  const A = sum(anchors), R = sum(rest);
  let a = 1, b = 1;
  const det = A.kcal * R.proteinG - R.kcal * A.proteinG;
  if (anchors.length && rest.length && Math.abs(det) > 1e-6) {
    a = (target.kcal * R.proteinG - R.kcal * target.proteinG) / det;
    b = (A.kcal * target.proteinG - target.kcal * A.proteinG) / det;
  }
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
    const s = clamp(target.kcal / Math.max(1, A.kcal + R.kcal), 0.4, 2.5);
    a = s; b = s;
  }
  a = clamp(a, 0.5, 2.5);
  if (R.kcal > 0) b = clamp((target.kcal - a * A.kcal) / R.kcal, 0.3, 2.5);
  else a = clamp(target.kcal / Math.max(1, A.kcal), 0.5, 2.5);
  return items.map((i) => ({ food: i.food, grams: roundGrams(i.grams * (isProteinAnchor(i.food) ? a : b)) }));
}

export function computeMeal(m: { slot: string; title: string; time: string; prepMinutes: number; instructions: string; items: { food: FoodRow; grams: number }[] }): MealComputed {
  const items = m.items.map((i) => computeItem(i.food, i.grams));
  return { slot: m.slot, title: m.title, time: m.time, prepMinutes: m.prepMinutes, instructions: m.instructions, items, totals: totalsOf(items) };
}

export function computeDay(dayOfWeek: number, meals: MealComputed[]): DayComputed {
  return { dayOfWeek, meals, totals: totalsOf(meals.map((m) => m.totals)) };
}

export function buildGroceryList(days: DayComputed[], foodsById: Map<string, FoodRow>) {
  const agg = new Map<string, number>();
  for (const d of days) for (const m of d.meals) for (const i of m.items) agg.set(i.foodId, (agg.get(i.foodId) ?? 0) + i.grams);
  return [...agg.entries()].map(([foodId, grams]) => {
    const f = foodsById.get(foodId)!;
    const g = Math.ceil(grams / 50) * 50;
    return { foodId, nameFa: f.nameFa, category: f.category, grams: g, label: g >= 1000 ? `${round1(g / 1000)} کیلوگرم` : `${g} گرم` };
  }).sort((x, y) => x.category.localeCompare(y.category) || x.nameFa.localeCompare(y.nameFa));
}

export type PlanTargets = Pick<Targets, "kcal" | "proteinG" | "carbsG" | "fatG" | "bmr" | "tdee" | "waterMl" | "assumptions" | "floorKcal" | "ceilingKcal"> & { method: string };

export function validateAndBuildNutritionPlan(raw: unknown, ctx: { foods: FoodRow[]; profile: ProfileData; targets: PlanTargets }): ValidationResult<NutritionPlan> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed = AiNutritionPlan.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 15).map((i) => `schema: ${i.path.join(".")}: ${i.message}`), warnings };
  const ai = parsed.data;
  const foodsById = new Map(ctx.foods.map((f) => [f.id, f]));
  const allowed = new Set(allowedFoods(ctx.foods, ctx.profile).map((f) => f.id));

  const resolveItems = (items: { foodId: string; grams: number }[], where: string) => {
    const out: { food: FoodRow; grams: number }[] = [];
    for (const it of items) {
      const f = foodsById.get(it.foodId);
      if (!f) { errors.push(`unknown foodId "${it.foodId}" in ${where}`); continue; }
      if (!allowed.has(f.id)) { errors.push(`food "${f.id}" violates the user's allergies/restrictions in ${where}`); continue; }
      out.push({ food: f, grams: it.grams });
    }
    return out;
  };

  const seenDays = new Set(ai.days.map((d) => d.dayOfWeek));
  if (seenDays.size !== 7) errors.push("days must cover each dayOfWeek 0..6 exactly once");

  const days: DayComputed[] = ai.days.map((d) => {
    const resolved = d.meals.map((m) => ({ ...m, items: resolveItems(m.items, `day ${d.dayOfWeek} ${m.slot}`) }));
    // fit whole-day totals to target
    const flat = resolved.flatMap((m, mi) => m.items.map((i, ii) => ({ ...i, mi, ii })));
    const fitted = fitItemsToTargets(flat, { kcal: ctx.targets.kcal, proteinG: ctx.targets.proteinG });
    fitted.forEach((f, idx) => { const o = flat[idx]; resolved[o.mi].items[o.ii] = { food: f.food, grams: f.grams }; });
    const meals = resolved.filter((m) => m.items.length).sort((a, b) => a.time.localeCompare(b.time)).map(computeMeal);
    const day = computeDay(d.dayOfWeek, meals);
    const dev = Math.abs(day.totals.kcal - ctx.targets.kcal) / ctx.targets.kcal;
    if (dev > 0.15) errors.push(`day ${d.dayOfWeek} totals ${Math.round(day.totals.kcal)} kcal cannot be fitted to target ${ctx.targets.kcal} — choose more suitable foods`);
    else if (dev > 0.07) warnings.push(`day ${d.dayOfWeek} is ${Math.round(dev * 100)}% off the calorie target`);
    return day;
  }).sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  const alternatives = ai.alternatives.map((alt) => {
    const items = resolveItems(alt.items, `alternative ${alt.title}`).map((i) => computeItem(i.food, roundGrams(i.grams)));
    return { slot: alt.slot, title: alt.title, items, totals: totalsOf(items) };
  }).filter((a) => a.items.length);

  if (errors.length) return { ok: false, errors, warnings };
  return {
    ok: true, errors, warnings,
    plan: {
      title: ai.title, targets: ctx.targets, days, alternatives, groceryList: buildGroceryList(days, foodsById),
      hydrationGuidance: ai.hydrationGuidance, rationale: ai.rationale, changeSummary: ai.changeSummary, coachMessage: ai.coachMessage,
    },
  };
}

/** Re-fit an existing plan to new targets (calorie/macro adjustment without AI). */
export function refitNutritionPlan(plan: NutritionPlan, foods: Map<string, FoodRow>, targets: PlanTargets): NutritionPlan {
  const days = plan.days.map((d) => {
    const flat = d.meals.flatMap((m, mi) => m.items.map((i, ii) => ({ food: foods.get(i.foodId)!, grams: i.grams, mi, ii })));
    const fitted = fitItemsToTargets(flat, { kcal: targets.kcal, proteinG: targets.proteinG });
    const meals = d.meals.map((m, mi) => computeMeal({ ...m, items: flat.map((f, idx) => ({ ...f, grams: fitted[idx].grams })).filter((f) => f.mi === mi).map(({ food, grams }) => ({ food, grams })) }));
    return computeDay(d.dayOfWeek, meals);
  });
  return { ...plan, targets, days, groceryList: buildGroceryList(days, foods) };
}
