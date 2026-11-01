import { z } from "zod";
import { authed, body } from "@/server/api";
import { saveAnswer, getPlanReview } from "@/domain/profile/service";

const Body = z.object({ questionId: z.string().max(60), value: z.unknown(), nextQuestionId: z.string().max(60).nullable().optional() });

/** Auto-save a single onboarding/profile answer (validated against the question bank). */
export const PUT = authed(async ({ req, db, user }) => {
  const b = await body(req, Body);
  const value = saveAnswer(db, user.id, b.questionId, b.value, { nextQuestionId: b.nextQuestionId ?? null });
  return { value, planReview: getPlanReview(db, user.id) };
});
