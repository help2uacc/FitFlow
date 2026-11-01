import { z } from "zod";
import { authed, body } from "@/server/api";
import { AppError } from "@/lib/errors";
import { getJob } from "@/domain/ai/jobs";
import { actionForIntent } from "@/domain/coach/service";
import { CoachIntent } from "@/domain/plans/schemas";

export const POST = authed(async ({ req, db, user }) => {
  const { jobId } = await body(req, z.object({ jobId: z.string().max(80) }));
  const job = getJob(db, user.id, jobId);
  if (job.type !== "coach") throw new AppError("bad_job", "این کار مربوط به مربی نیست.");
  if (job.status !== "completed") throw new AppError("not_ready", "پاسخ هنوز آماده نیست.", 409);
  const intent = CoachIntent.parse(job.result);
  const text = String((job.input as { text?: string })?.text ?? "");
  try {
    return { intent: intent.intent, ...actionForIntent(db, user.id, intent, text) };
  } catch (e) {
    if (e instanceof AppError) return { intent: intent.intent, reply: e.message, action: { type: "none" } };
    throw e;
  }
});
