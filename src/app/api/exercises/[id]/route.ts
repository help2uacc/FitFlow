import { authed } from "@/server/api";
import { exerciseDetail } from "@/domain/tracking/workout-views";

export const GET = authed<{ id: string }>(({ db, params }) => exerciseDetail(db, decodeURIComponent(params.id)));
