import { z } from "zod";
import { authed, body } from "@/server/api";
import { extendCycle } from "@/domain/plans/workout-service";

export const POST = authed(async ({ req, db, user }) => extendCycle(db, user.id, (await body(req, z.object({ weeks: z.number().int().min(1).max(4) }))).weeks));
