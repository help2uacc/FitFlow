import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { getDb, type DB } from "@/db/client";
import { SESSION_COOKIE, validateSession } from "@/domain/auth/service";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type AuthedUser = NonNullable<ReturnType<typeof validateSession>>["user"];
export interface Ctx<P = Record<string, string>> { req: NextRequest; db: DB; user: AuthedUser; sessionId: string; params: P }

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return json({ error: { code: e.code, message: e.message, details: e.details } }, e.status);
  if (e instanceof ZodError) return json({ error: { code: "validation", message: "ورودی نامعتبر است.", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, 400);
  logger.error("unhandled api error", { err: e instanceof Error ? e : String(e) });
  return json({ error: { code: "internal", message: "خطای داخلی سرور." } }, 500);
}

/** Same-origin check for state-changing requests (defence in depth on top of SameSite cookies). */
export function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    const o = new URL(origin);
    return o.host === host || o.origin === new URL(env().APP_URL).origin;
  } catch {
    return false;
  }
}

type Handler<P> = (ctx: Ctx<P>) => Promise<Response | unknown> | Response | unknown;

/** Wrap an authenticated route handler: origin check, auth, error mapping. */
export function authed<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      if (!checkOrigin(req)) throw new AppError("bad_origin", "درخواست از مبدأ نامعتبر.", 403);
      const db = getDb();
      const s = validateSession(db, req.cookies.get(SESSION_COOKIE)?.value);
      if (!s) throw new AppError("unauthenticated", "لطفاً وارد شوید.", 401);
      const params = (context?.params ? await context.params : {}) as P;
      const out = await handler({ req, db, user: s.user, sessionId: s.sessionId, params });
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new AppError("bad_json", "بدنه درخواست JSON معتبر نیست.");
  }
  return schema.parse(data);
}
