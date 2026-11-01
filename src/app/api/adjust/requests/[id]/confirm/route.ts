import { authed } from "@/server/api";
import { confirmAdjustment } from "@/domain/adjust/service";
import { clearPlanReview } from "@/domain/profile/service";

export const POST = authed<{ id: string }>(({ db, user, params }) => {
  const r = confirmAdjustment(db, user.id, params.id);
  clearPlanReview(db, user.id);
  return r;
});
