import { authed, body } from "@/server/api";
import { MealReplaceApply, MealReplaceQuery, applyMealReplacement, mealReplacementOptions } from "@/domain/adjust/service";

export const GET = authed(({ req, db, user }) => {
  const sp = req.nextUrl.searchParams;
  const q = MealReplaceQuery.parse({ plannedMealId: sp.get("plannedMealId") ?? "", criterion: sp.get("criterion") ?? undefined });
  return { candidates: mealReplacementOptions(db, user.id, q) };
});
export const POST = authed(async ({ req, db, user }) => applyMealReplacement(db, user.id, await body(req, MealReplaceApply)));
