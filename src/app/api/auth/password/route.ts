import { z } from "zod";
import { authed, body } from "@/server/api";
import { changePassword, revokeOtherSessions } from "@/domain/auth/service";
import { rateLimit } from "@/server/rate-limit";
import { AppError } from "@/lib/errors";

const Body = z.object({ current: z.string().max(200), next: z.string().max(200) });
export const POST = authed(async ({ req, db, user, sessionId }) => {
  if (!rateLimit(`pw:${user.id}`, 5, 15 * 60_000).ok) throw new AppError("rate_limited", "تعداد تلاش‌ها زیاد است.", 429);
  const b = await body(req, Body);
  await changePassword(db, user.id, b.current, b.next);
  revokeOtherSessions(db, user.id, sessionId);
  return { ok: true };
});
