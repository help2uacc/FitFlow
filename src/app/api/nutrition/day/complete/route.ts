import { z } from "zod";
import { authed, body } from "@/server/api";
import { setDayComplete } from "@/domain/tracking/food";
import { isValidISODate } from "@/lib/dates";

const Body = z.object({ date: z.string().refine(isValidISODate, "تاریخ نامعتبر"), complete: z.boolean() });

export const POST = authed(async ({ req, db, user }) => {
  const b = await body(req, Body);
  setDayComplete(db, user.id, b.date, b.complete);
  return { ok: true };
});
