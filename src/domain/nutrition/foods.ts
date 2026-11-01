import { and, eq, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { newId } from "@/lib/ids";
import { notFound } from "@/lib/errors";
import type { FoodRow } from "@/domain/plans/nutrition-build";

const visible = (userId: string) => and(eq(t.foods.isActive, true), or(isNull(t.foods.userId), eq(t.foods.userId, userId)));

export function listFoods(db: DB, userId: string): FoodRow[] {
  return db.select().from(t.foods).where(visible(userId)).all();
}
export function foodsMap(db: DB, userId: string) {
  return new Map(listFoods(db, userId).map((f) => [f.id, f]));
}

export function searchFoods(db: DB, userId: string, q: string, limit = 30) {
  const term = q.trim().replace(/[%_]/g, "");
  if (!term) return db.select().from(t.foods).where(visible(userId)).limit(limit).all();
  return db.select().from(t.foods).where(and(visible(userId), or(like(t.foods.nameFa, `%${term}%`), like(t.foods.nameEn, `%${term}%`)))).limit(limit).all();
}

export function getFood(db: DB, userId: string, id: string) {
  const f = db.select().from(t.foods).where(and(eq(t.foods.id, id), visible(userId))).get();
  if (!f) throw notFound("ماده غذایی");
  return f;
}

export const CustomFoodInput = z.object({
  nameFa: z.string().trim().min(1).max(100),
  servingG: z.number().positive().max(2000),
  servingLabel: z.string().trim().max(60).optional(),
  kcal100: z.number().min(0).max(950),
  protein100: z.number().min(0).max(100),
  carbs100: z.number().min(0).max(100),
  fat100: z.number().min(0).max(100),
  fiber100: z.number().min(0).max(100).optional(),
}).refine((f) => f.protein100 + f.carbs100 + f.fat100 <= 101, { message: "مجموع درشت‌مغذی‌ها در ۱۰۰ گرم نمی‌تواند بیش از ۱۰۰ گرم باشد." });

export function createCustomFood(db: DB, userId: string, input: z.infer<typeof CustomFoodInput>) {
  const id = "u_" + newId();
  db.insert(t.foods).values({
    id, userId, nameFa: input.nameFa, nameEn: input.nameFa, category: "custom", state: "na", servingG: input.servingG,
    servingLabel: input.servingLabel || `${input.servingG} گرم`, kcal100: input.kcal100, protein100: input.protein100, carbs100: input.carbs100,
    fat100: input.fat100, fiber100: input.fiber100 ?? null, tags: ["custom"], costLevel: 2, sourceId: "user", confidence: "low",
  }).run();
  return getFood(db, userId, id);
}

export const RecipeInput = z.object({
  name: z.string().trim().min(1).max(100),
  servings: z.number().positive().max(50),
  ingredients: z.array(z.object({ foodId: z.string(), grams: z.number().positive().max(5000) })).min(1).max(30),
});

/**
 * A recipe is stored with its ingredients and also exposed as a derived
 * user food (per-100 g of the finished dish) so it can be logged by weight.
 * Ingredients are summed once — the derived food replaces them in logs.
 */
export function createRecipe(db: DB, userId: string, input: z.infer<typeof RecipeInput>) {
  const ings = input.ingredients.map((i) => ({ food: getFood(db, userId, i.foodId), grams: i.grams }));
  const totalG = ings.reduce((s, i) => s + i.grams, 0);
  const tot = ings.reduce((a, i) => ({
    kcal: a.kcal + (i.food.kcal100 * i.grams) / 100, p: a.p + (i.food.protein100 * i.grams) / 100,
    c: a.c + (i.food.carbs100 * i.grams) / 100, f: a.f + (i.food.fat100 * i.grams) / 100,
  }), { kcal: 0, p: 0, c: 0, f: 0 });
  const recipeId = newId();
  const foodId = "r_" + recipeId;
  const per100 = (x: number) => Math.round((x / totalG) * 1000) / 10;
  db.transaction((tx) => {
    tx.insert(t.recipes).values({ id: recipeId, userId, name: input.name, servings: input.servings }).run();
    for (const i of input.ingredients) tx.insert(t.recipeIngredients).values({ id: newId(), recipeId, foodId: i.foodId, grams: i.grams }).run();
    tx.insert(t.foods).values({
      id: foodId, userId, nameFa: input.name, nameEn: input.name, category: "recipe", state: "prepared",
      servingG: Math.round(totalG / input.servings), servingLabel: `۱ پرس (${Math.round(totalG / input.servings)} گرم)`,
      kcal100: per100(tot.kcal), protein100: per100(tot.p), carbs100: per100(tot.c), fat100: per100(tot.f), tags: ["recipe"], costLevel: 2, sourceId: "user", confidence: "low",
    }).run();
  });
  return { recipeId, food: getFood(db, userId, foodId) };
}
