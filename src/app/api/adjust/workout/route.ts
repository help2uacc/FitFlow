import { authed, body } from "@/server/api";
import { previewWorkoutAdjustment, WorkoutAdjustInput } from "@/domain/adjust/service";

/** Preview a workout change (instant deterministic preview, or an AI draft job). */
export const POST = authed(async ({ req, db, user }) => previewWorkoutAdjustment(db, user.id, await body(req, WorkoutAdjustInput)));
