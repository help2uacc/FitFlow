import { and, eq } from "drizzle-orm";
import * as t from "@/db/schema";
import { authed } from "@/server/api";
import { notFound } from "@/lib/errors";

/** Retrieve any (workout or nutrition) plan version owned by the user. */
export const GET = authed<{ id: string }>(({ db, user, params }) => {
  const w = db.select().from(t.workoutPlanVersions).where(and(eq(t.workoutPlanVersions.id, params.id), eq(t.workoutPlanVersions.userId, user.id))).get();
  if (w) return { domain: "workout", version: w };
  const n = db.select().from(t.nutritionPlanVersions).where(and(eq(t.nutritionPlanVersions.id, params.id), eq(t.nutritionPlanVersions.userId, user.id))).get();
  if (n) return { domain: "nutrition", version: n };
  throw notFound("نسخه برنامه");
});
