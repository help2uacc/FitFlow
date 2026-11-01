import { authed } from "@/server/api";
import { workoutDetailWithPrevious } from "@/domain/tracking/workout-views";

export const GET = authed<{ id: string }>(({ db, user, params }) => workoutDetailWithPrevious(db, user.id, params.id));
