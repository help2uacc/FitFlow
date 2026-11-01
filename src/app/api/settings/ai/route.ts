import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { authed, body } from "@/server/api";
import { env } from "@/lib/env";
import { enqueueJob, jobView } from "@/domain/ai/jobs";

export const GET = authed(({ db }) => {
  const get = (k: string) => db.select().from(t.systemStatus).where(eq(t.systemStatus.key, k)).get();
  const diag = get("ai_diagnostic");
  const hb = get("worker_heartbeat");
  const hbAt = (hb?.value as { at?: number } | undefined)?.at ?? null;
  const recent = db.select({ outcome: t.aiGenerationMetadata.outcome, durationMs: t.aiGenerationMetadata.durationMs, createdAt: t.aiGenerationMetadata.createdAt, provider: t.aiGenerationMetadata.provider, attempt: t.aiGenerationMetadata.attempt })
    .from(t.aiGenerationMetadata).orderBy(desc(t.aiGenerationMetadata.createdAt)).limit(10).all();
  return {
    provider: env().AI_PROVIDER,
    diagnostic: diag?.value ?? null,
    diagnosticAt: diag?.updatedAt ?? null,
    worker: { lastHeartbeat: hbAt, ok: hbAt !== null && Date.now() - hbAt < 60_000, info: hb?.value ?? null },
    recent,
  };
});

export const POST = authed(async ({ req, db, user }) => {
  const { smoke } = await body(req, z.object({ smoke: z.boolean().default(false) }));
  const { job, duplicate } = enqueueJob(db, { userId: user.id, type: "ai_diagnostic", payload: { smoke }, dedupeKey: "ai_diagnostic", maxAttempts: 1 });
  return { job: jobView(job), duplicate };
});
