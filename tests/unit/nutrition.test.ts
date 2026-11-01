import { describe, expect, it } from "vitest";
import { bmrMifflin, calorieBounds, computeTargets, macrosFor, recipePerServing, scaleFood } from "@/domain/nutrition/calc";
import { emptyProfile, type ProfileData } from "@/domain/profile/model";
import { recommendCalorieAdjustment } from "@/domain/adjust/nutrition";
import { fitItemsToTargets, excludedFoodTags, type FoodRow } from "@/domain/plans/nutrition-build";

const profile = (): ProfileData => {
  const p = emptyProfile();
  p.personal = { birthYear: 1994, sex: "male", heightCm: 180, weightKg: 80 };
  p.goals = { primary: "fat_loss" };
  p.training = { daysPerWeek: "3", sessionMinutes: 60 };
  p.lifestyle = { dailySteps: "6000", occupation: "desk" };
  return p;
};
const food = (id: string, kcal: number, p: number, c: number, f: number, tags: string[] = []): FoodRow => ({ id, nameFa: id, nameEn: id, category: "x", servingG: 100, servingLabel: "", kcal100: kcal, protein100: p, carbs100: c, fat100: f, tags, costLevel: 1 });

describe("energy calculations", () => {
  it("Mifflin-St Jeor matches the reference formula", () => {
    expect(bmrMifflin("male", 80, 180, 30)).toBe(1780);
    expect(bmrMifflin("female", 60, 165, 30)).toBeCloseTo(1320.25, 2);
  });
  it("fat-loss target is a moderate deficit within safety bounds", () => {
    const t = computeTargets(profile());
    expect(t.kcal).toBeLessThan(t.tdee);
    expect(t.tdee - t.kcal).toBeLessThanOrEqual(750);
    expect(t.kcal).toBeGreaterThanOrEqual(t.floorKcal);
    expect(t.proteinG).toBe(160); // 2.0 g/kg
  });
  it("never goes below the floor even with an extreme override", () => {
    const p = profile();
    p.nutrition.calorieOverride = 900;
    const t = computeTargets(p);
    expect(t.kcal).toBeGreaterThanOrEqual(1500);
  });
  it("bounds", () => {
    const b = calorieBounds("female", 1300, 2000);
    expect(b.floor).toBe(1400);
    expect(b.ceiling).toBe(2500);
  });
  it("macros add up to calories", () => {
    const m = macrosFor(2400, profile());
    expect(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9).toBeGreaterThan(2390);
    expect(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9).toBeLessThan(2410);
  });
});

describe("portion scaling & recipes", () => {
  it("scales per-100g values", () => {
    expect(scaleFood({ kcal100: 130, protein100: 2.7, carbs100: 28.2, fat100: 0.3 }, 150)).toEqual({ kcal: 195, proteinG: 4.1, carbsG: 42.3, fatG: 0.5 });
  });
  it("counts recipe ingredients once and divides by servings", () => {
    const r = recipePerServing([{ food: { kcal100: 100, protein100: 10, carbs100: 0, fat100: 5 }, grams: 200 }, { food: { kcal100: 50, protein100: 0, carbs100: 10, fat100: 0 }, grams: 200 }], 2);
    expect(r.total.kcal).toBe(300);
    expect(r.perServing.kcal).toBe(150);
    expect(r.servingGrams).toBe(200);
  });
  it("fits a day to calorie & protein targets", () => {
    const items = [{ food: food("chicken", 165, 31, 0, 3.6, ["protein"]), grams: 150 }, { food: food("rice", 130, 2.7, 28, 0.3), grams: 200 }, { food: food("oil", 884, 0, 0, 100), grams: 10 }];
    const out = fitItemsToTargets(items, { kcal: 900, proteinG: 70 });
    const kcal = out.reduce((s, i) => s + (i.food.kcal100 * i.grams) / 100, 0);
    expect(Math.abs(kcal - 900) / 900).toBeLessThan(0.05);
  });
  it("maps allergies/restrictions to excluded tags", () => {
    const p = profile();
    p.nutrition.allergies = ["lactose"];
    p.nutrition.restrictions = ["vegetarian"];
    expect(excludedFoodTags(p)).toEqual(expect.arrayContaining(["lactose", "meat", "fish", "seafood"]));
  });
});

describe("calorie recommendation", () => {
  it("needs data before recommending", () => {
    expect(recommendCalorieAdjustment({ goal: "fat_loss", trendKgPerWeek: null, loggedDays: 10, adherencePct: 90 }).delta).toBe(0);
  });
  it("reduces when fat loss stalls and increases when loss is too fast", () => {
    expect(recommendCalorieAdjustment({ goal: "fat_loss", trendKgPerWeek: 0, loggedDays: 10, weightKg: 80, adherencePct: 90 }).delta).toBeLessThan(0);
    expect(recommendCalorieAdjustment({ goal: "fat_loss", trendKgPerWeek: -1.2, loggedDays: 10, weightKg: 80, adherencePct: 90 }).delta).toBeGreaterThan(0);
  });
});

describe("sparse-day fitting", () => {
  it("reaches a high target with only two light meals without absurd portions", () => {
    const items = [
      { food: food("chicken", 165, 31, 0, 3.6, ["protein"]), grams: 120 }, { food: food("rice", 130, 2.7, 28, 0.3), grams: 150 },
      { food: food("salad", 25, 1, 5, 0.2), grams: 150 }, { food: food("fish", 128, 26, 0, 2.7, ["protein"]), grams: 120 },
      { food: food("potato", 86, 1.7, 20, 0.1), grams: 150 }, { food: food("broccoli", 35, 2.4, 7, 0.4), grams: 150 },
    ];
    const out = fitItemsToTargets(items, { kcal: 2410, proteinG: 150 });
    const kcal = out.reduce((s, i) => s + (i.food.kcal100 * i.grams) / 100, 0);
    expect(Math.abs(kcal - 2410) / 2410).toBeLessThan(0.15);
    for (const i of out) expect(i.grams).toBeLessThanOrEqual(600);
  });
});
