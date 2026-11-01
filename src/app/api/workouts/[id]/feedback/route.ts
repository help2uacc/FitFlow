import { authed, body } from "@/server/api";
import { FeedbackInput, saveFeedback } from "@/domain/tracking/workouts";

export const POST = authed<{ id: string }>(async ({ req, db, user, params }) => {
  saveFeedback(db, user.id, params.id, await body(req, FeedbackInput));
  return { ok: true };
});
