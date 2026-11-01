/**
 * Meal replacement suggestions that approximately keep a meal's nutritional
 * role, without regenerating the whole plan.
 */
import { scaleFood, sumMacros, type Macros } from "@/domain/nutrition/calc";
import type { FoodRow } from "@/domain/plans/nutrition-build";

export type ReplaceCriterion = "similar" | "lower_calorie" | "higher_protein" | "cheaper" | "quick";
export interface Candidate { title: string; items: { foodId: string; grams: number; nameFa: string; kcal: number; proteinG: number; carbsG: number; fatG: number }[]; totals: Macros; score: number; source: "plan_alternative" | "swap" }

const role = (f: FoodRow) => (f.tags.includes("protein") && (f.protein100 * 4) / Math.max(1, f.kcal100) >= 0.3 ? "protein"
  : f.tags.includes("veg") ? "veg" : f.tags.includes("fruit") ? "fruit" : f.tags.includes("fat") ? "fat" : f.tags.includes("carb") ? "carb" : f.category);

function build(items: { food: FoodRow; grams: number }[]) {
  const its = items.map((i) => ({ foodId: i.food.id, grams: i.grams, nameFa: i.food.nameFa, ...scaleFood(i.food, i.grams) }));
  return { items: its, totals: sumMacros(its) };
}

function scaleTo(items: { food: FoodRow; grams: number }[], kcal: number) {
  const cur = sumMacros(items.map((i) => scaleFood(i.food, i.grams))).kcal;
  const k = cur > 0 ? Math.min(2, Math.max(0.5, kcal / cur)) : 1;
  return items.map((i) => ({ food: i.food, grams: Math.max(5, Math.round((i.grams * k) / 5) * 5) }));
}

export function suggestReplacements(input: {
  meal: { slot: string; title: string; items: { foodId: string; grams: number }[]; totals: Macros };
  allowed: FoodRow[]; foods: Map<string, FoodRow>; alternatives: { slot: string; title: string; items: { foodId: string; grams: number }[] }[];
  criterion: ReplaceCriterion; favoriteTags?: string[]; limit?: number;
}): Candidate[] {
  const { meal, allowed, foods, criterion } = input;
  const allowedIds = new Set(allowed.map((f) => f.id));
  const targetKcal = criterion === "lower_calorie" ? meal.totals.kcal * 0.8 : meal.totals.kcal;
  const out: Candidate[] = [];
  const score = (t: Macros, items: { food: FoodRow }[]) => {
    let s = 100 - Math.abs(t.kcal - targetKcal) / Math.max(1, targetKcal) * 100 - Math.abs(t.proteinG - meal.totals.proteinG) * (criterion === "higher_protein" ? 0 : 1.5);
    if (criterion === "higher_protein") s += (t.proteinG - meal.totals.proteinG) * 2;
    if (criterion === "cheaper") s -= items.reduce((a, i) => a + i.food.costLevel, 0) * 5;
    if (criterion === "quick") s -= items.filter((i) => ["prepared", "cooked"].includes(i.food.category)).length * 3;
    if (input.favoriteTags?.length) s += items.filter((i) => i.food.tags.some((tg) => input.favoriteTags!.includes(tg))).length * 4;
    return Math.round(s);
  };
  // 1) alternatives proposed by the plan for the same slot
  for (const alt of input.alternatives.filter((a) => a.slot === meal.slot)) {
    const items = alt.items.map((i) => ({ food: foods.get(i.foodId)!, grams: i.grams })).filter((i) => i.food && allowedIds.has(i.food.id));
    if (!items.length) continue;
    const b = build(scaleTo(items, targetKcal));
    out.push({ title: alt.title, ...b, score: score(b.totals, items), source: "plan_alternative" });
  }
  // 2) swap the main item of each role for another food with the same role
  const base = meal.items.map((i) => ({ food: foods.get(i.foodId)!, grams: i.grams })).filter((i) => i.food);
  base.forEach((it, idx) => {
    const r = role(it.food);
    const pool = allowed.filter((f) => f.id !== it.food.id && role(f) === r && !base.some((b) => b.food.id === f.id)).slice(0, 12);
    for (const f of pool) {
      // keep the role's calories: grams so that kcal is similar
      const grams = Math.max(5, Math.round(((it.grams * it.food.kcal100) / Math.max(1, f.kcal100)) / 5) * 5);
      const items = base.map((b, j) => (j === idx ? { food: f, grams: Math.min(grams, 600) } : b));
      const b = build(scaleTo(items, targetKcal));
      out.push({ title: `${meal.title} با ${f.nameFa} به‌جای ${it.food.nameFa}`, ...b, score: score(b.totals, items), source: "swap" });
    }
  });
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter((c) => {
    const k = c.items.map((i) => i.foodId).sort().join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, input.limit ?? 5);
}
