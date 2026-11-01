import { authed, body } from "@/server/api";
import { CustomFoodInput, createCustomFood, searchFoods } from "@/domain/nutrition/foods";

export const GET = authed(({ req, db, user }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  return { foods: searchFoods(db, user.id, q, 30) };
});
export const POST = authed(async ({ req, db, user }) => createCustomFood(db, user.id, await body(req, CustomFoodInput)));
