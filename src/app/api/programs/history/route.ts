import { authed } from "@/server/api";
import { workoutHistory } from "@/domain/plans/workout-service";
import { nutritionHistory } from "@/domain/plans/nutrition-service";

export const GET = authed(({ db, user }) => ({ workout: workoutHistory(db, user.id), nutrition: nutritionHistory(db, user.id) }));
