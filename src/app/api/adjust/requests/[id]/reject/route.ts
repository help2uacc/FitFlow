import { authed } from "@/server/api";
import { rejectAdjustment } from "@/domain/adjust/service";

export const POST = authed<{ id: string }>(({ db, user, params }) => {
  rejectAdjustment(db, user.id, params.id);
  return { ok: true };
});
