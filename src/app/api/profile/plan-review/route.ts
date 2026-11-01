import { z } from "zod";
import { authed, body } from "@/server/api";
import { clearPlanReview, getPlanReview } from "@/domain/profile/service";
import { previewWorkoutAdjustment, previewNutritionAdjustment } from "@/domain/adjust/service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";

/**
 * "Update my plan based on these changes": creates AI revision drafts for the
 * affected domains (current plans stay active until the drafts are accepted).
 */
export const POST = authed(async ({ req, db, user }) => {
  const b = await body(req, z.object({ action: z.enum(["update", "dismiss"]) }));
  const review = getPlanReview(db, user.id);
  if (b.action === "dismiss" || !review) { clearPlanReview(db, user.id); return { ok: true }; }
  const out: Record<string, unknown> = {};
  const text = `profile changed: ${review.fields.join(", ")}`;
  if (review.domains.includes("workout")) out.workout = previewWorkoutAdjustment(db, user.id, { source: "profile_change", useAi: true, text });
  if (review.domains.includes("nutrition") && getActiveNutritionVersion(db, user.id)) out.nutrition = previewNutritionAdjustment(db, user.id, { kind: "ai", text, source: "profile_change" });
  clearPlanReview(db, user.id);
  return out;
});
