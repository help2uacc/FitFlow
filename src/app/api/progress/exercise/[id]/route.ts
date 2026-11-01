import { authed } from "@/server/api";
import { exerciseProgress, rangeFor } from "@/domain/progress/analytics";
import { getCatalogExercise } from "@/domain/plans/validate-workout";
import { todayISO } from "@/lib/dates";

export const GET = authed<{ id: string }>(({ req, db, user, params }) => {
  const range = req.nextUrl.searchParams.get("range") ?? "90";
  const { from, to } = rangeFor(range, todayISO(user.timezone));
  const ex = getCatalogExercise(params.id);
  return { exerciseId: params.id, nameFa: ex?.nameFa ?? params.id, points: exerciseProgress(db, user.id, params.id, from, to) };
});
