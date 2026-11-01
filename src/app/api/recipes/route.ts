import { authed, body } from "@/server/api";
import { RecipeInput, createRecipe } from "@/domain/nutrition/foods";

export const POST = authed(async ({ req, db, user }) => createRecipe(db, user.id, await body(req, RecipeInput)));
