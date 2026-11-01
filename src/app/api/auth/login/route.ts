import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { authenticate, createSession } from "@/domain/auth/service";
import { body, checkOrigin, errorResponse } from "@/server/api";
import { clientIp, sessionCookie } from "@/server/auth";
import { rateLimit } from "@/server/rate-limit";
import { AppError } from "@/lib/errors";

const Body = z.object({ email: z.string().trim().max(200), password: z.string().max(200), remember: z.boolean().default(true) });

export async function POST(req: NextRequest) {
  try {
    if (!checkOrigin(req)) throw new AppError("bad_origin", "درخواست نامعتبر.", 403);
    const ip = await clientIp();
    const b = await body(req, Body);
    const rlIp = rateLimit(`login:ip:${ip}`, 20, 15 * 60_000);
    const rlUser = rateLimit(`login:user:${b.email.toLowerCase()}`, 8, 15 * 60_000);
    if (!rlIp.ok || !rlUser.ok) throw new AppError("rate_limited", "تعداد تلاش‌های ورود زیاد است؛ ۱۵ دقیقه دیگر امتحان کنید.", 429);
    const db = getDb();
    const user = await authenticate(db, b.email, b.password);
    const s = createSession(db, user.id, { remember: b.remember, userAgent: req.headers.get("user-agent"), ip });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookie(s.token, s.expiresAt, b.remember));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
