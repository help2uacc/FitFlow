import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { authed, body } from "@/server/api";
import { newId } from "@/lib/ids";
import { isValidISODate, todayISO } from "@/lib/dates";
import { rangeFor } from "@/domain/progress/analytics";

const num = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();
const Input = z.object({
  date: z.string().refine(isValidISODate, "تاریخ نامعتبر"),
  clientId: z.string().max(80).optional(),
  weightKg: num(25, 350), waistCm: num(30, 250), chestCm: num(40, 250), armCm: num(10, 100), hipCm: num(40, 250), thighCm: num(20, 150),
  energy: z.number().int().min(1).max(5).nullable().optional(), notes: z.string().max(500).nullable().optional(),
});
const FIELDS = ["weightKg", "waistCm", "chestCm", "armCm", "hipCm", "thighCm", "energy", "notes"] as const;

export const POST = authed(async ({ req, db, user }) => {
  const input = await body(req, Input);
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) if (input[f] !== undefined && input[f] !== null) patch[f] = input[f];
  const existing = db.select().from(t.bodyMeasurements).where(and(eq(t.bodyMeasurements.userId, user.id), eq(t.bodyMeasurements.date, input.date))).get();
  if (existing) {
    if (Object.keys(patch).length) db.update(t.bodyMeasurements).set(patch).where(eq(t.bodyMeasurements.id, existing.id)).run();
    return db.select().from(t.bodyMeasurements).where(eq(t.bodyMeasurements.id, existing.id)).get();
  }
  const id = newId();
  db.insert(t.bodyMeasurements).values({ id, userId: user.id, date: input.date, clientId: input.clientId ?? null, ...patch }).run();
  return db.select().from(t.bodyMeasurements).where(eq(t.bodyMeasurements.id, id)).get();
});

export const GET = authed(({ req, db, user }) => {
  const { from, to } = rangeFor(req.nextUrl.searchParams.get("range") ?? "90", todayISO(user.timezone));
  return { items: db.select().from(t.bodyMeasurements).where(and(eq(t.bodyMeasurements.userId, user.id), gte(t.bodyMeasurements.date, from), lte(t.bodyMeasurements.date, to))).orderBy(asc(t.bodyMeasurements.date)).all() };
});
