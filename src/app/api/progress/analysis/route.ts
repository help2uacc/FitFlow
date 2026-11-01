import { and, desc, eq } from "drizzle-orm";
import * as t from "@/db/schema";
import { authed } from "@/server/api";

export const GET = authed(({ db, user }) => {
  const j = db.select().from(t.aiJobs).where(and(eq(t.aiJobs.userId, user.id), eq(t.aiJobs.type, "analyze_progress"), eq(t.aiJobs.status, "completed"))).orderBy(desc(t.aiJobs.createdAt)).get();
  return { analysis: j?.result ?? null, createdAt: j?.finishedAt ?? null };
});
