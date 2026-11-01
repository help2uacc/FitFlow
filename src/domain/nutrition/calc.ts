/**
 * Deterministic nutrition calculations. All energy values are estimates; the
 * UI must present them as such (not laboratory-accurate measurements).
 */
import { ageOf, type ProfileData } from "@/domain/profile/model";

export interface Macros { kcal: number; proteinG: number; carbsG: number; fatG: number }
export interface Targets extends Macros {
  bmr: number; tdee: number; activityFactor: number; goalAdjustmentPct: number; waterMl: number;
  method: "mifflin_st_jeor" | "katch_mcardle"; assumptions: string[]; floorKcal: number; ceilingKcal: number;
}

export function bmrMifflin(sex: "male" | "female", weightKg: number, heightCm: number, age: number) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}
export function bmrKatch(weightKg: number, bodyFatPct: number) {
  return 370 + 21.6 * weightKg * (1 - bodyFatPct / 100);
}

/** Physical-activity factor from daily steps/occupation plus training volume. */
export function activityFactor(p: ProfileData): number {
  const steps = Number(p.lifestyle.dailySteps) || ({ sedentary: 3000, light: 5000, moderate: 7000, high: 9000 }[p.experience.activityLevel ?? ""] ?? 5000);
  let base = steps < 4000 ? 1.2 : steps < 8000 ? 1.3 : steps < 12000 ? 1.4 : 1.5;
  if (p.lifestyle.occupation === "physical") base = Math.max(base, 1.5);
  else if (p.lifestyle.occupation === "standing") base = Math.max(base, 1.35);
  const days = Number(p.training.daysPerWeek) || 3;
  const minutes = p.training.sessionMinutes ?? 60;
  const training = days * (minutes / 60) * 0.025;
  return Math.min(1.95, Math.round((base + training) * 1000) / 1000);
}

export function goalAdjustmentPct(p: ProfileData): number {
  const ng = p.nutrition.goal;
  const goal = ng && ng !== "auto"
    ? ({ lose: "fat_loss", gain: "muscle_gain", maintain: "maintain", performance: "performance" } as Record<string, string>)[ng]
    : p.goals.primary;
  switch (goal) {
    case "fat_loss": return -20;
    case "recomp": return -8;
    case "muscle_gain": return p.experience.level === "advanced" ? 7 : 12;
    case "endurance":
    case "performance": return 3;
    default: return 0;
  }
}

/** Reference weight used for protein when BMI is high (avoids excessive targets). */
function proteinReferenceWeight(weightKg: number, heightCm: number) {
  const bmi = weightKg / (heightCm / 100) ** 2;
  if (bmi <= 30) return weightKg;
  const ref = 27 * (heightCm / 100) ** 2;
  return ref + 0.25 * (weightKg - ref);
}

export function calorieBounds(sex: "male" | "female", bmr: number, tdee: number) {
  const floor = Math.max(sex === "male" ? 1500 : 1200, Math.round(bmr * 0.95), Math.round(tdee * 0.7));
  const ceiling = Math.round(tdee * 1.25);
  return { floor, ceiling };
}

export function proteinPerKg(p: ProfileData) {
  const goal = p.goals.primary;
  let g = goal === "fat_loss" || goal === "recomp" ? 2.0 : goal === "muscle_gain" || goal === "strength" ? 1.8 : 1.6;
  if (p.nutrition.proteinPreference === "high") g = Math.min(2.4, g + 0.3);
  return g;
}

export function computeTargets(p: ProfileData): Targets {
  const sex = p.personal.sex ?? "male";
  const w = p.personal.weightKg ?? 75;
  const h = p.personal.heightCm ?? 172;
  const age = ageOf(p) ?? 30;
  const assumptions: string[] = [];
  if (!p.personal.weightKg) assumptions.push("وزن ثبت نشده؛ ۷۵ کیلوگرم فرض شد.");
  const useKatch = !!p.personal.bodyFatPct && p.personal.bodyFatKnown === true;
  const bmr = useKatch ? bmrKatch(w, p.personal.bodyFatPct!) : bmrMifflin(sex, w, h, age);
  const af = activityFactor(p);
  const tdee = bmr * af;
  const adj = goalAdjustmentPct(p);
  let kcal = tdee * (1 + adj / 100);
  // limit deficit to 750 kcal/day and surplus to 450 kcal/day
  kcal = Math.max(tdee - 750, Math.min(tdee + 450, kcal));
  const { floor, ceiling } = calorieBounds(sex, bmr, tdee);
  kcal = Math.max(floor, Math.min(ceiling, kcal));
  if (p.nutrition.calorieOverride) {
    kcal = Math.max(floor, Math.min(ceiling, p.nutrition.calorieOverride));
    assumptions.push("هدف کالری به درخواست شما تنظیم شده است.");
  }
  kcal = Math.round(kcal / 10) * 10;
  const macros = macrosFor(kcal, p);
  assumptions.push(
    useKatch ? "متابولیسم پایه با فرمول کچ-مک‌آردل (بر اساس درصد چربی تخمینی)." : "متابولیسم پایه با فرمول میفلین-سنت‌جئور.",
    `ضریب فعالیت ${af.toFixed(2)} بر اساس قدم روزانه، شغل و ${p.training.daysPerWeek ?? 3} جلسه تمرین در هفته.`,
    "همه اعداد تخمینی‌اند؛ روند وزن در ۲ تا ۳ هفته معیار اصلی تنظیم است.",
  );
  const waterMl = Math.round((w * 35 + ((Number(p.training.daysPerWeek) || 3) * (p.training.sessionMinutes ?? 60) / 7 / 60) * 500) / 50) * 50;
  return { ...macros, bmr: Math.round(bmr), tdee: Math.round(tdee), activityFactor: af, goalAdjustmentPct: adj, waterMl, method: useKatch ? "katch_mcardle" : "mifflin_st_jeor", assumptions, floorKcal: floor, ceilingKcal: ceiling };
}

/** Split calories into macros: protein by body weight, fat 25–30 %, carbs the rest. */
export function macrosFor(kcal: number, p: ProfileData, opts?: { proteinG?: number; fatPct?: number }): Macros {
  const w = p.personal.weightKg ?? 75;
  const h = p.personal.heightCm ?? 172;
  const lowCarb = (p.nutrition.restrictions ?? []).includes("low_carb");
  let proteinG = opts?.proteinG ?? Math.round(proteinReferenceWeight(w, h) * proteinPerKg(p));
  proteinG = Math.min(proteinG, Math.round((kcal * 0.4) / 4));
  const fatPct = opts?.fatPct ?? (lowCarb ? 0.4 : 0.27);
  let fatG = Math.round((kcal * fatPct) / 9);
  fatG = Math.max(fatG, Math.round(w * 0.6));
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG };
}

export interface FoodNutrients { kcal100: number; protein100: number; carbs100: number; fat100: number }

/** Scale per-100 g values to an eaten quantity. */
export function scaleFood(f: FoodNutrients, grams: number): Macros {
  const k = grams / 100;
  return { kcal: round1(f.kcal100 * k), proteinG: round1(f.protein100 * k), carbsG: round1(f.carbs100 * k), fatG: round1(f.fat100 * k) };
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce((a, b) => ({ kcal: round1(a.kcal + b.kcal), proteinG: round1(a.proteinG + b.proteinG), carbsG: round1(a.carbsG + b.carbsG), fatG: round1(a.fatG + b.fatG) }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Recipe nutrition per serving — each ingredient counted exactly once. */
export function recipePerServing(ingredients: { food: FoodNutrients; grams: number }[], servings: number) {
  const total = sumMacros(ingredients.map((i) => scaleFood(i.food, i.grams)));
  const grams = ingredients.reduce((s, i) => s + i.grams, 0);
  const n = Math.max(servings, 0.0001);
  return { perServing: { kcal: round1(total.kcal / n), proteinG: round1(total.proteinG / n), carbsG: round1(total.carbsG / n), fatG: round1(total.fatG / n) }, servingGrams: round1(grams / n), total };
}
