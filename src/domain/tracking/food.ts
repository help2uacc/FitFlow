import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { dayOfWeek, isValidISODate } from "@/lib/dates";
import { round1, scaleFood, sumMacros } from "@/domain/nutrition/calc";
import { getFood } from "@/domain/nutrition/foods";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { MealSlot, type NutritionPlan } from "@/domain/plans/schemas";

const isoDate = z.string().refine(isValidISODate, "تاریخ نامعتبر");
const clientId = z.string().min(8).max(80).regex(/^[A-Za-z0-9:_-]+$/);

export const LogFoodInput = z.object({
  clientId, date: isoDate, mealSlot: MealSlot, foodId: z.string().max(120), grams: z.number().positive().max(3000),
  plannedMealId: z.string().max(80).nullable().optional(), status: z.enum(["eaten", "partial"]).default("eaten"),
});
export const LogPlannedMealInput = z.object({
  clientId, date: isoDate, plannedMealId: z.string().max(80),
  portion: z.number().min(0.1).max(3).default(1),
  action: z.enum(["eaten", "partial", "skipped"]).default("eaten"),
});
export const UpdateEntryInput = z.object({ grams: z.number().positive().max(3000) });

function snapshot(food: { kcal100: number; protein100: number; carbs100: number; fat100: number }, grams: number) {
  const m = scaleFood(food, grams);
  return { kcal: m.kcal, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG };
}

export function logFood(db: DB, userId: string, input: z.infer<typeof LogFoodInput>) {
  const existing = db.select().from(t.foodLogEntries).where(and(eq(t.foodLogEntries.userId, userId), eq(t.foodLogEntries.clientId, input.clientId))).get();
  if (existing) return existing;
  const food = getFood(db, userId, input.foodId);
  const active = getActiveNutritionVersion(db, userId);
  const id = newId();
  db.insert(t.foodLogEntries).values({
    id, userId, clientId: input.clientId, date: input.date, mealSlot: input.mealSlot, planVersionId: active?.id ?? null, plannedMealId: input.plannedMealId ?? null,
    foodId: food.id, label: food.nameFa, grams: input.grams, ...snapshot(food, input.grams), status: input.status,
  }).run();
  recomputeDailySummary(db, userId, input.date);
  return db.select().from(t.foodLogEntries).where(eq(t.foodLogEntries.id, id)).get()!;
}

/** One-tap logging of a planned meal (whole, partial portion, or skipped). */
export function logPlannedMeal(db: DB, userId: string, input: z.infer<typeof LogPlannedMealInput>) {
  const meal = db.select().from(t.plannedMeals).where(and(eq(t.plannedMeals.id, input.plannedMealId), eq(t.plannedMeals.userId, userId))).get();
  if (!meal) throw notFound("وعده برنامه");
  const prior = db.select().from(t.foodLogEntries).where(and(eq(t.foodLogEntries.userId, userId), eq(t.foodLogEntries.clientId, `${input.clientId}:0`))).get();
  if (prior) return listDayEntries(db, userId, input.date).filter((e) => e.clientId.startsWith(input.clientId + ":"));
  const sub = db.select().from(t.mealSubstitutions).where(and(eq(t.mealSubstitutions.userId, userId), eq(t.mealSubstitutions.plannedMealId, meal.id), eq(t.mealSubstitutions.date, input.date))).get();
  const items: { foodId: string; grams: number }[] = sub ? (sub.items as { foodId: string; grams: number }[]) : db.select().from(t.plannedMealItems).where(eq(t.plannedMealItems.plannedMealId, meal.id)).all();
  db.transaction((tx) => {
    if (input.action === "skipped") {
      tx.insert(t.foodLogEntries).values({
        id: newId(), userId, clientId: `${input.clientId}:0`, date: input.date, mealSlot: meal.slot, planVersionId: meal.planVersionId, plannedMealId: meal.id,
        foodId: null, label: meal.title, grams: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, status: "skipped",
      }).run();
      return;
    }
    const portion = input.action === "partial" ? Math.min(input.portion, 0.99) : input.portion;
    items.forEach((it, i) => {
      const food = getFood(db, userId, it.foodId);
      const grams = Math.round(it.grams * portion);
      tx.insert(t.foodLogEntries).values({
        id: newId(), userId, clientId: `${input.clientId}:${i}`, date: input.date, mealSlot: meal.slot, planVersionId: meal.planVersionId, plannedMealId: meal.id,
        foodId: food.id, label: food.nameFa, grams, ...snapshot(food, grams), status: portion < 1 ? "partial" : "eaten",
      }).run();
    });
  });
  recomputeDailySummary(db, userId, input.date);
  return listDayEntries(db, userId, input.date).filter((e) => e.plannedMealId === meal.id);
}

export function updateEntry(db: DB, userId: string, id: string, input: z.infer<typeof UpdateEntryInput>) {
  const e = db.select().from(t.foodLogEntries).where(and(eq(t.foodLogEntries.id, id), eq(t.foodLogEntries.userId, userId))).get();
  if (!e) throw notFound("ثبت غذا");
  if (!e.foodId) throw new AppError("not_editable", "این ثبت قابل ویرایش مقدار نیست.");
  const food = getFood(db, userId, e.foodId);
  db.update(t.foodLogEntries).set({ grams: input.grams, ...snapshot(food, input.grams), updatedAt: Date.now() }).where(eq(t.foodLogEntries.id, id)).run();
  recomputeDailySummary(db, userId, e.date);
}

export function deleteEntry(db: DB, userId: string, id: string) {
  const e = db.select().from(t.foodLogEntries).where(and(eq(t.foodLogEntries.id, id), eq(t.foodLogEntries.userId, userId))).get();
  if (!e) throw notFound("ثبت غذا");
  db.delete(t.foodLogEntries).where(eq(t.foodLogEntries.id, id)).run();
  recomputeDailySummary(db, userId, e.date);
}

export function listDayEntries(db: DB, userId: string, date: string) {
  return db.select().from(t.foodLogEntries).where(and(eq(t.foodLogEntries.userId, userId), eq(t.foodLogEntries.date, date))).orderBy(asc(t.foodLogEntries.createdAt)).all();
}

export function setDayComplete(db: DB, userId: string, date: string, complete: boolean) {
  recomputeDailySummary(db, userId, date, complete ? "complete" : "partial");
}

/** Keep nutrition_daily_summaries in sync. Unlogged days are never treated as zero intake. */
export function recomputeDailySummary(db: DB, userId: string, date: string, forceCompleteness?: "complete" | "partial") {
  const entries = listDayEntries(db, userId, date);
  const tot = sumMacros(entries.map((e) => ({ kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG })));
  const active = getActiveNutritionVersion(db, userId);
  const planned = active ? db.select().from(t.plannedMeals).where(and(eq(t.plannedMeals.planVersionId, active.id), eq(t.plannedMeals.dayIndex, dayOfWeek(date)))).all() : [];
  const loggedMeals = new Set(entries.filter((e) => e.plannedMealId).map((e) => e.plannedMealId)).size;
  const prev = db.select().from(t.nutritionDailySummaries).where(and(eq(t.nutritionDailySummaries.userId, userId), eq(t.nutritionDailySummaries.date, date))).get();
  const completeness = entries.length === 0 && !forceCompleteness ? "none" : forceCompleteness ?? (prev?.completeness === "complete" ? "complete" : "partial");
  const values = {
    planVersionId: active?.id ?? null, targetKcal: active?.targetKcal ?? null, targetProteinG: active?.proteinG ?? null,
    kcal: tot.kcal, proteinG: tot.proteinG, carbsG: tot.carbsG, fatG: tot.fatG, entries: entries.length, plannedMeals: planned.length, loggedMeals,
    completeness: completeness as "none" | "partial" | "complete", updatedAt: Date.now(),
  };
  db.insert(t.nutritionDailySummaries).values({ userId, date, ...values })
    .onConflictDoUpdate({ target: [t.nutritionDailySummaries.userId, t.nutritionDailySummaries.date], set: values }).run();
}

/** Everything the nutrition-day screen needs. */
export function nutritionDay(db: DB, userId: string, date: string) {
  const active = getActiveNutritionVersion(db, userId);
  const entries = listDayEntries(db, userId, date);
  const consumed = sumMacros(entries.map((e) => ({ kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG })));
  const summary = db.select().from(t.nutritionDailySummaries).where(and(eq(t.nutritionDailySummaries.userId, userId), eq(t.nutritionDailySummaries.date, date))).get();
  let meals: {
    id: string; slot: string; title: string; time: string | null; kcal: number; proteinG: number; carbsG: number; fatG: number;
    items: { foodId: string; nameFa: string; grams: number; serving: string }[]; substituted: boolean; status: "pending" | "eaten" | "partial" | "skipped";
    prepMinutes: number; instructions: string;
  }[] = [];
  if (active) {
    const plan = active.plan as NutritionPlan;
    const dow = dayOfWeek(date);
    const rows = db.select().from(t.plannedMeals).where(and(eq(t.plannedMeals.planVersionId, active.id), eq(t.plannedMeals.dayIndex, dow))).orderBy(asc(t.plannedMeals.sortOrder)).all();
    const subs = db.select().from(t.mealSubstitutions).where(and(eq(t.mealSubstitutions.userId, userId), eq(t.mealSubstitutions.date, date))).all();
    const planDay = plan.days.find((d) => d.dayOfWeek === dow);
    meals = rows.map((r) => {
      const sub = subs.find((s) => s.plannedMealId === r.id);
      const pm = planDay?.meals[r.sortOrder];
      let items = (pm?.items ?? []).map((i) => ({ foodId: i.foodId, nameFa: i.nameFa, grams: i.grams, serving: i.serving }));
      let mac = { kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG };
      let title = r.title;
      if (sub) {
        const subItems = sub.items as { foodId: string; grams: number; nameFa?: string; kcal?: number; proteinG?: number; carbsG?: number; fatG?: number }[];
        items = subItems.map((i) => ({ foodId: i.foodId, nameFa: i.nameFa ?? i.foodId, grams: i.grams, serving: "" }));
        mac = sumMacros(subItems.map((i) => ({ kcal: i.kcal ?? 0, proteinG: i.proteinG ?? 0, carbsG: i.carbsG ?? 0, fatG: i.fatG ?? 0 })));
        title = sub.title;
      }
      const logs = entries.filter((e) => e.plannedMealId === r.id);
      const status = !logs.length ? "pending" : logs.some((l) => l.status === "skipped") ? "skipped" : logs.some((l) => l.status === "partial") ? "partial" : "eaten";
      return { id: r.id, slot: r.slot, title, time: r.time, ...mac, items, substituted: !!sub, status, prepMinutes: pm?.prepMinutes ?? 0, instructions: pm?.instructions ?? "" };
    });
  }
  const target = active ? { kcal: active.targetKcal, proteinG: active.proteinG, carbsG: active.carbsG, fatG: active.fatG } : null;
  return {
    date, planVersionId: active?.id ?? null, target, consumed,
    remainingKcal: target ? round1(target.kcal - consumed.kcal) : null,
    meals, entries, completeness: summary?.completeness ?? "none",
  };
}

export function dailySummaries(db: DB, userId: string, from: string, to: string) {
  return db.select().from(t.nutritionDailySummaries).where(and(eq(t.nutritionDailySummaries.userId, userId), gte(t.nutritionDailySummaries.date, from), lte(t.nutritionDailySummaries.date, to))).orderBy(asc(t.nutritionDailySummaries.date)).all();
}
