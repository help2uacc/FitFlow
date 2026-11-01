import { authed } from "@/server/api";
import { getAdjustmentRequest } from "@/domain/adjust/service";
import { getActiveNutritionVersion, diffNutritionPlans } from "@/domain/plans/nutrition-service";
import type { NutritionPlan } from "@/domain/plans/schemas";

/** Request status + a compact preview (without the full plan payload). */
export const GET = authed<{ id: string }>(({ db, user, params }) => {
  const r = getAdjustmentRequest(db, user.id, params.id);
  const preview = (r.preview ?? null) as Record<string, unknown> | null;
  let view: Record<string, unknown> | null = null;
  if (preview && r.status === "previewed") {
    if (r.domain === "workout") view = { diff: preview.diff, notes: preview.notes, warnings: preview.warnings, reason: preview.reason };
    else {
      const active = getActiveNutritionVersion(db, user.id);
      const plan = preview.plan as NutritionPlan;
      view = {
        reason: preview.reason,
        current: active ? { kcal: active.targetKcal, proteinG: active.proteinG, carbsG: active.carbsG, fatG: active.fatG } : null,
        proposed: { kcal: plan.targets.kcal, proteinG: plan.targets.proteinG, carbsG: plan.targets.carbsG, fatG: plan.targets.fatG },
        diff: active ? diffNutritionPlans(active.plan as NutritionPlan, plan) : null,
      };
    }
  }
  return { id: r.id, domain: r.domain, intent: r.intent, status: r.status, aiJobId: r.aiJobId, resultVersionId: r.resultVersionId, createdAt: r.createdAt, view };
});
