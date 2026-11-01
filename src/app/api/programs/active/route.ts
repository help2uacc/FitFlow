import { authed } from "@/server/api";
import { cyclePhase, getActiveWorkoutVersion, getCycle } from "@/domain/plans/workout-service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";

export const GET = authed(({ db, user }) => {
  const w = getActiveWorkoutVersion(db, user.id);
  const n = getActiveNutritionVersion(db, user.id);
  const cycle = w ? getCycle(db, user.id, w.cycleId) : null;
  return {
    workout: w ? { id: w.id, version: w.version, plan: w.plan, createdAt: w.createdAt } : null,
    cycle: cycle ? { ...cycle, ...cyclePhase(cycle) } : null,
    nutrition: n ? { id: n.id, version: n.version, plan: n.plan, targetKcal: n.targetKcal } : null,
  };
});
