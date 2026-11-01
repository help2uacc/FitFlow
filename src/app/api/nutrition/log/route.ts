import { authed, body } from "@/server/api";
import { LogFoodInput, logFood } from "@/domain/tracking/food";

export const POST = authed(async ({ req, db, user }) => logFood(db, user.id, await body(req, LogFoodInput)));
