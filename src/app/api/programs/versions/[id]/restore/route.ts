import { authed } from "@/server/api";
import { AppError } from "@/lib/errors";
import { createWorkoutVersion, getActiveWorkoutVersion, getWorkoutVersion } from "@/domain/plans/workout-service";
import type { WorkoutPlan } from "@/domain/plans/schemas";

/** Re-apply an earlier workout version as a NEW version (history is never rewritten). */
export const POST = authed<{ id: string }>(({ db, user, params }) => {
  const old = getWorkoutVersion(db, user.id, params.id);
  const active = getActiveWorkoutVersion(db, user.id);
  if (!active) throw new AppError("no_plan", "برنامه فعالی وجود ندارد.", 409);
  if (old.id === active.id) throw new AppError("already_active", "این نسخه هم‌اکنون فعال است.", 409);
  const res = createWorkoutVersion(db, { userId: user.id, plan: old.plan as WorkoutPlan, reason: `بازگردانی نسخه ${old.version}`, cycle: { mode: "existing", cycleId: active.cycleId }, previousVersionId: active.id, profileSnapshot: {}, activate: true });
  return res;
});
