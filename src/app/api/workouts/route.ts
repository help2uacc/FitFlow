import { authed, body } from "@/server/api";
import { StartWorkoutInput, listWorkoutLogs, startWorkout } from "@/domain/tracking/workouts";

export const POST = authed(async ({ req, db, user }) => startWorkout(db, user.id, await body(req, StartWorkoutInput)));
export const GET = authed(({ req, db, user }) => {
  const sp = req.nextUrl.searchParams;
  const before = sp.get("before") ?? undefined;
  const limit = Number(sp.get("limit")) || 20;
  return listWorkoutLogs(db, user.id, { before: before && /^\d{4}-\d{2}-\d{2}$/.test(before) ? before : undefined, limit });
});
