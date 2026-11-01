import { authed } from "@/server/api";
import { deleteSet } from "@/domain/tracking/workouts";

export const DELETE = authed<{ id: string }>(({ db, user, params }) => {
  deleteSet(db, user.id, params.id);
  return { ok: true };
});
