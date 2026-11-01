import { z } from "zod";
import { authed, body } from "@/server/api";
import { getPrefs, pushConfigured, setPrefs } from "@/domain/notifications/scheduler";

const Prefs = z.object({
  workoutReminders: z.boolean(), workoutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), checkinReminders: z.boolean(), mealReminders: z.boolean(), programReminders: z.boolean(),
});

export const GET = authed(({ db, user }) => ({ prefs: getPrefs(db, user.id), pushConfigured: pushConfigured() }));
export const PUT = authed(async ({ req, db, user }) => {
  const p = await body(req, Prefs);
  setPrefs(db, user.id, p);
  return { prefs: p };
});
