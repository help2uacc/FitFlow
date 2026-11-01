import { authed, body } from "@/server/api";
import { NutritionAdjustInput, previewNutritionAdjustment } from "@/domain/adjust/service";

export const POST = authed(async ({ req, db, user }) => previewNutritionAdjustment(db, user.id, await body(req, NutritionAdjustInput)));
