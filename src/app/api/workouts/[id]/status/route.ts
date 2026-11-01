import { authed, body } from "@/server/api";
import { WorkoutStatusInput, updateWorkoutStatus } from "@/domain/tracking/workouts";

export const POST = authed<{ id: string }>(async ({ req, db, user, params }) => updateWorkoutStatus(db, user.id, params.id, await body(req, WorkoutStatusInput)));
