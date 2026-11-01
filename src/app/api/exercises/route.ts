import { authed } from "@/server/api";
import { listExercises } from "@/domain/tracking/workout-views";

export const GET = authed(({ req, db }) => {
  const sp = req.nextUrl.searchParams;
  return { items: listExercises(db, { q: sp.get("q")?.slice(0, 80) ?? undefined, muscle: sp.get("muscle") ?? undefined, equipment: sp.get("equipment") ?? undefined }) };
});
