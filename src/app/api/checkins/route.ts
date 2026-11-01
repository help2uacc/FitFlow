import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { authed, body } from "@/server/api";
import { newId } from "@/lib/ids";
import { isValidISODate } from "@/lib/dates";

const s15 = z.number().int().min(1).max(5).nullable().optional();
const Input = z.object({
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر"),
  workoutDifficulty: s15, recovery: s15, consistency: s15, appetite: s15, energy: s15, dietAdherence: s15,
  pain: z.boolean().nullable().optional(), painNotes: z.string().max(500).nullable().optional(),
  scheduleChanged: z.boolean().nullable().optional(), notes: z.string().max(1000).nullable().optional(),
});

export const POST = authed(async ({ req, db, user }) => {
  const i = await body(req, Input);
  const id = newId();
  db.insert(t.progressCheckins).values({
    id, userId: user.id, date: i.date, workoutDifficulty: i.workoutDifficulty ?? null, recovery: i.recovery ?? null, consistency: i.consistency ?? null,
    pain: i.pain ?? null, painNotes: i.painNotes ?? null, appetite: i.appetite ?? null, energy: i.energy ?? null, dietAdherence: i.dietAdherence ?? null,
    scheduleChanged: i.scheduleChanged ?? null, notes: i.notes ?? null,
  }).run();
  return db.select().from(t.progressCheckins).where(eq(t.progressCheckins.id, id)).get();
});

export const GET = authed(({ db, user }) => ({
  items: db.select().from(t.progressCheckins).where(eq(t.progressCheckins.userId, user.id)).orderBy(desc(t.progressCheckins.date), desc(t.progressCheckins.createdAt)).limit(20).all(),
}));
