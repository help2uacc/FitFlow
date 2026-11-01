import { authed, body } from "@/server/api";
import { LogPlannedMealInput, logPlannedMeal } from "@/domain/tracking/food";

export const POST = authed(async ({ req, db, user }) => ({ entries: logPlannedMeal(db, user.id, await body(req, LogPlannedMealInput)) }));
