import { z } from "zod";
import { authed, body } from "@/server/api";
import { handleCoachMessage } from "@/domain/coach/service";

export const POST = authed(async ({ req, db, user }) => {
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(1000) }));
  return handleCoachMessage(db, user.id, text);
});
