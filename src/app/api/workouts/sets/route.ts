import { authed, body } from "@/server/api";
import { LogSetInput, logSet } from "@/domain/tracking/workouts";

export const POST = authed(async ({ req, db, user }) => logSet(db, user.id, await body(req, LogSetInput)));
