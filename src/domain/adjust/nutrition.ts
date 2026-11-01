/**
 * Calorie / macro adjustments with safety boundaries and deterministic
 * re-fitting of the existing meal plan (no AI call needed for the preview).
 */
import { calorieBounds, computeTargets, macrosFor, proteinPerKg } from "@/domain/nutrition/calc";
import type { ProfileData } from "@/domain/profile/model";
import { refitNutritionPlan, type FoodRow, type PlanTargets } from "@/domain/plans/nutrition-build";
import type { NutritionPlan } from "@/domain/plans/schemas";

export type CalorieRequest = { kind: "delta"; delta: number } | { kind: "target"; target: number } | { kind: "protein"; change: "increase" | "decrease" };

export interface CaloriePreview {
  current: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  requested: number | null;
  proposed: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  clamped: boolean;
  warnings: string[];
  effects: string[];
  plan: NutritionPlan;
}

const KCAL_PER_KG = 7700;

export function previewCalorieChange(plan: NutritionPlan, profile: ProfileData, foods: Map<string, FoodRow>, req: CalorieRequest): CaloriePreview {
  const cur = plan.targets;
  const base = computeTargets({ ...profile, nutrition: { ...profile.nutrition, calorieOverride: null } });
  const sex = profile.personal.sex ?? "male";
  const { floor, ceiling } = calorieBounds(sex, base.bmr, base.tdee);
  const warnings: string[] = [];
  const effects: string[] = [];
  let requested: number | null = null;
  let kcal = cur.kcal;
  let proteinG = cur.proteinG;
  let clamped = false;

  if (req.kind === "delta" || req.kind === "target") {
    requested = req.kind === "delta" ? cur.kcal + req.delta : req.target;
    kcal = Math.round(requested / 10) * 10;
    if (kcal < floor) {
      warnings.push(`کالری ${requested} کمتر از حداقل ایمن تخمینی شما (${floor}) است. کسری خیلی زیاد معمولاً باعث افت عضله، گرسنگی شدید و بازگشت وزن می‌شود؛ به‌جای آن ${floor} پیشنهاد می‌شود.`);
      kcal = floor;
      clamped = true;
    } else if (kcal > ceiling) {
      warnings.push(`کالری ${requested} بیش از ۲۵٪ بالاتر از نیاز نگهداری تخمینی (${base.tdee}) است و احتمالاً بیشتر چربی اضافه می‌کند؛ ${ceiling} پیشنهاد می‌شود.`);
      kcal = ceiling;
      clamped = true;
    }
    const macros = macrosFor(kcal, profile, { proteinG: cur.proteinG });
    proteinG = macros.proteinG;
    const diff = kcal - cur.kcal;
    if (diff !== 0) {
      const perWeek = Math.round(((diff * 7) / KCAL_PER_KG) * 100) / 100;
      effects.push(`${diff > 0 ? "افزایش" : "کاهش"} ${Math.abs(diff)} کیلوکالری در روز ≈ ${Math.abs(perWeek)} کیلوگرم ${diff > 0 ? "افزایش" : "کاهش"} بیشتر در هفته (تخمینی).`);
      effects.push("پروتئین ثابت می‌ماند؛ تغییر از کربوهیدرات و چربی اعمال می‌شود.");
    }
    if (kcal < base.tdee - 600) warnings.push("کسری کالری قابل توجه است؛ کیفیت خواب، انرژی تمرین و روند وزن را دقیق‌تر پایش کنید.");
  } else {
    const w = profile.personal.weightKg ?? 75;
    const step = req.change === "increase" ? 0.3 : -0.3;
    const perKg = Math.max(1.2, Math.min(2.4, cur.proteinG / w + step));
    proteinG = Math.round(perKg * w);
    if (req.change === "increase" && cur.proteinG / w >= 2.35) warnings.push("پروتئین در حال حاضر نزدیک سقف توصیه‌شده (حدود ۲.۴ گرم به ازای هر کیلو) است.");
    effects.push(`پروتئین ${cur.proteinG} ← ${proteinG} گرم با کالری ثابت؛ کربوهیدرات/چربی متناسب تنظیم می‌شود.`);
    void proteinPerKg;
  }

  const macros = macrosFor(kcal, profile, { proteinG });
  const targets: PlanTargets = { ...plan.targets, ...macros };
  const newPlan = refitNutritionPlan({ ...plan, changeSummary: { kept: ["ساختار وعده‌ها و انتخاب غذاها"], changed: effects, reasons: ["درخواست کاربر"], targets: [] } }, foods, targets);
  return { current: { kcal: cur.kcal, proteinG: cur.proteinG, carbsG: cur.carbsG, fatG: cur.fatG }, requested, proposed: macros, clamped, warnings, effects, plan: newPlan };
}

/** Deterministic AI-style recommendation from weight trend vs goal. */
export function recommendCalorieAdjustment(input: { goal?: string; trendKgPerWeek: number | null; loggedDays: number; weightKg?: number; adherencePct: number | null }) {
  const { goal, trendKgPerWeek: tr, loggedDays } = input;
  if (tr === null) return { delta: 0, reason: "برای توصیه دقیق، حداقل ۳ وزن‌کشی در ۲ هفته لازم است." };
  if (loggedDays < 5 && (input.adherencePct ?? 0) < 50) return { delta: 0, reason: "ثبت غذا ناقص است؛ ابتدا پایبندی به برنامه فعلی را بسنجید." };
  const w = input.weightKg ?? 75;
  const pct = (tr / w) * 100;
  if (goal === "fat_loss" || goal === "recomp") {
    if (pct > -0.25) return { delta: -150, reason: `روند وزن (${tr} کیلوگرم در هفته) کندتر از هدف کاهش چربی است؛ کاهش ملایم ۱۵۰ کالری.` };
    if (pct < -1.0) return { delta: 150, reason: `کاهش وزن سریع‌تر از حد مطلوب (${tr} کیلوگرم در هفته) است؛ افزایش ۱۵۰ کالری برای حفظ عضله.` };
    return { delta: 0, reason: "روند کاهش وزن در محدوده مناسب است." };
  }
  if (goal === "muscle_gain") {
    if (pct < 0.1) return { delta: 150, reason: `وزن تقریباً ثابت است (${tr} کیلوگرم در هفته)؛ برای عضله‌سازی ۱۵۰ کالری بیشتر.` };
    if (pct > 0.5) return { delta: -100, reason: "افزایش وزن سریع است؛ کمی کاهش برای جلوگیری از چربی اضافه." };
    return { delta: 0, reason: "روند افزایش وزن مناسب است." };
  }
  if (Math.abs(pct) > 0.3) return { delta: tr > 0 ? -100 : 100, reason: "برای حفظ وزن، کالری کمی تنظیم می‌شود." };
  return { delta: 0, reason: "وزن پایدار است؛ تغییری لازم نیست." };
}
