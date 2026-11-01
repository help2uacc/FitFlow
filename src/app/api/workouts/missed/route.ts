import { z } from "zod";
import { authed, body } from "@/server/api";
import { markMissed } from "@/domain/tracking/workouts";
import { isValidISODate } from "@/lib/dates";

const Input = z.object({
  sessionId: z.string().max(80),
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر"),
  clientId: z.string().min(8).max(80).regex(/^[A-Za-z0-9:_-]+$/),
});
export const POST = authed(async ({ req, db, user }) => {
  const i = await body(req, Input);
  return markMissed(db, user.id, i.sessionId, i.date, i.clientId);
});
