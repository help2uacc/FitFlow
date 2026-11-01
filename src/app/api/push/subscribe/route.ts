import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { authed, body } from "@/server/api";
import { newId } from "@/lib/ids";

const Sub = z.object({ endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https only"), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export const POST = authed(async ({ req, db, user }) => {
  const s = await body(req, Sub);
  db.insert(t.pushSubscriptions).values({ id: newId(), userId: user.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth })
    .onConflictDoUpdate({ target: t.pushSubscriptions.endpoint, set: { userId: user.id, p256dh: s.keys.p256dh, auth: s.keys.auth } }).run();
  return { ok: true };
});

export const DELETE = authed(async ({ req, db, user }) => {
  let endpoint: string | undefined;
  try { endpoint = ((await req.json()) as { endpoint?: string }).endpoint; } catch { /* no body */ }
  db.delete(t.pushSubscriptions).where(endpoint ? and(eq(t.pushSubscriptions.userId, user.id), eq(t.pushSubscriptions.endpoint, endpoint)) : eq(t.pushSubscriptions.userId, user.id)).run();
  return { ok: true };
});
