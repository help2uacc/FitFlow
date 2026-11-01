import { z } from "zod";
import { authed } from "@/server/api";
import { nutritionDay } from "@/domain/tracking/food";
import { isValidISODate, todayISO } from "@/lib/dates";

export const GET = authed(({ req, db, user }) => {
  const raw = req.nextUrl.searchParams.get("date") ?? todayISO(user.timezone);
  const date = z.string().refine(isValidISODate, "تاریخ نامعتبر").parse(raw);
  return nutritionDay(db, user.id, date);
});
