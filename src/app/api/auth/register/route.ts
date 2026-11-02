import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { createSession, registerUser } from "@/domain/auth/service";
import { body, checkOrigin, errorResponse } from "@/server/api";
import { clientIp, sessionCookie } from "@/server/auth";
import { rateLimit } from "@/server/rate-limit";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

const Body = z.object({
  email: z.string().trim().email("ایمیل معتبر نیست.").max(200),
  displayName: z.string().trim().min(1, "نام لازم است.").max(80),
  password: z.string().min(1).max(200),
  passwordConfirm: z.string().max(200),
  invite: z.string().max(200).optional(),
}).refine((b) => b.password === b.passwordConfirm, { message: "تکرار رمز عبور مطابقت ندارد.", path: ["passwordConfirm"] });

export async function POST(req: NextRequest) {
  try {
    if (!checkOrigin(req)) throw new AppError("bad_origin", "درخواست نامعتبر.", 403);
    const rl = rateLimit(`register:${await clientIp()}`, 5, 15 * 60_000);
    if (!rl.ok) throw new AppError("rate_limited", "تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.", 429);
    const b = await body(req, Body);
    const db = getDb();
    const user = await registerUser(db, b, env().ALLOW_REGISTRATION);
    const s = createSession(db, user.id, { remember: true, userAgent: req.headers.get("user-agent"), ip: await clientIp() });
    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
    res.cookies.set(sessionCookie(s.token, s.expiresAt, true));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
