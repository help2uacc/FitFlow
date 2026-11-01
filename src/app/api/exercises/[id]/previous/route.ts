import { authed } from "@/server/api";
import { previousPerformance } from "@/domain/tracking/workouts";

export const GET = authed<{ id: string }>(({ req, db, user, params }) => ({
  previous: previousPerformance(db, user.id, decodeURIComponent(params.id), req.nextUrl.searchParams.get("exclude") ?? undefined),
}));
