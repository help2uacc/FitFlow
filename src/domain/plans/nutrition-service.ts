import { and, asc, desc, eq, max, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import type { NutritionPlan } from "./schemas";
import { MEAL_SLOT_FA } from "./schemas";

export function createNutritionVersion(db: DB, input: {
  userId: string; plan: NutritionPlan; reason: string; cycleId: string | null; previousVersionId: string | null;
  aiJobId?: string | null; profileSnapshot: unknown; activate: boolean;
}) {
  const id = db.transaction((tx) => {
    const v = tx.select({ v: max(t.nutritionPlanVersions.version) }).from(t.nutritionPlanVersions).where(eq(t.nutritionPlanVersions.userId, input.userId)).get()?.v ?? 0;
    const id = newId();
    tx.insert(t.nutritionPlanVersions).values({
      id, userId: input.userId, cycleId: input.cycleId, version: v + 1, status: "draft", revisionReason: input.reason, previousVersionId: input.previousVersionId,
      targetKcal: Math.round(input.plan.targets.kcal), proteinG: Math.round(input.plan.targets.proteinG), carbsG: Math.round(input.plan.targets.carbsG), fatG: Math.round(input.plan.targets.fatG),
      plan: input.plan, profileSnapshot: (input.profileSnapshot ?? {}) as object, aiJobId: input.aiJobId ?? null,
    }).run();
    for (const d of input.plan.days) d.meals.forEach((m, mi) => {
      const mid = newId();
      tx.insert(t.plannedMeals).values({ id: mid, userId: input.userId, planVersionId: id, dayIndex: d.dayOfWeek, slot: m.slot, title: m.title, time: m.time, sortOrder: mi, kcal: m.totals.kcal, proteinG: m.totals.proteinG, carbsG: m.totals.carbsG, fatG: m.totals.fatG }).run();
      for (const it of m.items) tx.insert(t.plannedMealItems).values({ id: newId(), plannedMealId: mid, foodId: it.foodId, grams: it.grams }).run();
    });
    return id;
  });
  if (input.activate) activateNutritionVersion(db, input.userId, id);
  return { versionId: id };
}

export function activateNutritionVersion(db: DB, userId: string, versionId: string) {
  const v = db.select().from(t.nutritionPlanVersions).where(and(eq(t.nutritionPlanVersions.id, versionId), eq(t.nutritionPlanVersions.userId, userId))).get();
  if (!v) throw notFound("نسخه برنامه غذایی");
  if (v.status !== "draft") throw new AppError("not_draft", "فقط پیش‌نویس قابل اعمال است.", 409);
  const prev = getActiveNutritionVersion(db, userId);
  db.transaction((tx) => {
    if (prev) tx.update(t.nutritionPlanVersions).set({ status: "superseded" }).where(eq(t.nutritionPlanVersions.id, prev.id)).run();
    tx.update(t.nutritionPlanVersions).set({ status: "active", activatedAt: Date.now() }).where(eq(t.nutritionPlanVersions.id, v.id)).run();
    tx.update(t.nutritionPlanVersions).set({ status: "rejected" })
      .where(and(eq(t.nutritionPlanVersions.userId, userId), eq(t.nutritionPlanVersions.status, "draft"), ne(t.nutritionPlanVersions.id, v.id))).run();
    tx.insert(t.planChangeHistory).values({
      id: newId(), userId, domain: "nutrition", fromVersionId: prev?.id ?? null, toVersionId: v.id, summary: v.revisionReason,
      changes: prev ? diffNutritionPlans(prev.plan as NutritionPlan, v.plan as NutritionPlan) : { created: true },
    }).run();
  });
}

export function rejectNutritionDraft(db: DB, userId: string, versionId: string) {
  const v = db.select().from(t.nutritionPlanVersions).where(and(eq(t.nutritionPlanVersions.id, versionId), eq(t.nutritionPlanVersions.userId, userId))).get();
  if (!v) throw notFound("نسخه برنامه غذایی");
  if (v.status !== "draft") throw new AppError("not_draft", "این نسخه پیش‌نویس نیست.", 409);
  db.update(t.nutritionPlanVersions).set({ status: "rejected" }).where(eq(t.nutritionPlanVersions.id, versionId)).run();
}

/** Disable nutrition planning: archive the active plan (history & logs are kept). */
export function archiveActiveNutrition(db: DB, userId: string) {
  db.update(t.nutritionPlanVersions).set({ status: "archived" }).where(and(eq(t.nutritionPlanVersions.userId, userId), eq(t.nutritionPlanVersions.status, "active"))).run();
}

export function getActiveNutritionVersion(db: DB, userId: string) {
  return db.select().from(t.nutritionPlanVersions).where(and(eq(t.nutritionPlanVersions.userId, userId), eq(t.nutritionPlanVersions.status, "active"))).get() ?? null;
}
export function getNutritionVersion(db: DB, userId: string, id: string) {
  const v = db.select().from(t.nutritionPlanVersions).where(and(eq(t.nutritionPlanVersions.id, id), eq(t.nutritionPlanVersions.userId, userId))).get();
  if (!v) throw notFound("نسخه برنامه غذایی");
  return v;
}
export function latestNutritionDraft(db: DB, userId: string) {
  return db.select().from(t.nutritionPlanVersions).where(and(eq(t.nutritionPlanVersions.userId, userId), eq(t.nutritionPlanVersions.status, "draft"))).orderBy(desc(t.nutritionPlanVersions.createdAt)).get() ?? null;
}
export function nutritionHistory(db: DB, userId: string) {
  return db.select({
    id: t.nutritionPlanVersions.id, version: t.nutritionPlanVersions.version, status: t.nutritionPlanVersions.status, revisionReason: t.nutritionPlanVersions.revisionReason,
    targetKcal: t.nutritionPlanVersions.targetKcal, proteinG: t.nutritionPlanVersions.proteinG, createdAt: t.nutritionPlanVersions.createdAt, activatedAt: t.nutritionPlanVersions.activatedAt,
  }).from(t.nutritionPlanVersions).where(eq(t.nutritionPlanVersions.userId, userId)).orderBy(desc(t.nutritionPlanVersions.version)).all();
}

export function plannedMealsForDay(db: DB, versionId: string, dayIndex: number) {
  const meals = db.select().from(t.plannedMeals).where(and(eq(t.plannedMeals.planVersionId, versionId), eq(t.plannedMeals.dayIndex, dayIndex))).orderBy(asc(t.plannedMeals.sortOrder)).all();
  return meals;
}

export function diffNutritionPlans(a: NutritionPlan, b: NutritionPlan) {
  const lines: string[] = [];
  const d = (x: number, y: number, label: string, unit: string) => { if (Math.round(x) !== Math.round(y)) lines.push(`${label}: ${Math.round(x)} ← ${Math.round(y)} ${unit}`); };
  d(a.targets.kcal, b.targets.kcal, "کالری روزانه", "کیلوکالری");
  d(a.targets.proteinG, b.targets.proteinG, "پروتئین", "گرم");
  d(a.targets.carbsG, b.targets.carbsG, "کربوهیدرات", "گرم");
  d(a.targets.fatG, b.targets.fatG, "چربی", "گرم");
  const titles = (p: NutritionPlan) => new Set(p.days.flatMap((x) => x.meals.map((m) => `${MEAL_SLOT_FA[m.slot as keyof typeof MEAL_SLOT_FA] ?? m.slot}: ${m.title}`)));
  const ta = titles(a), tb = titles(b);
  const added = [...tb].filter((x) => !ta.has(x));
  if (added.length) lines.push(`${added.length} وعده جدید یا تغییر یافته`);
  return { lines, addedMeals: added.slice(0, 20) };
}
