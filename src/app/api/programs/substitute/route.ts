import { authed, body } from "@/server/api";
import { SubstituteInput, substituteExerciseInPlan } from "@/domain/adjust/service";

export const POST = authed(async ({ req, db, user }) => substituteExerciseInPlan(db, user.id, await body(req, SubstituteInput)));
