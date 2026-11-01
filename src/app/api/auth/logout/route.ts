import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { revokeSession, SESSION_COOKIE, tokenHash } from "@/domain/auth/service";
import { checkOrigin, errorResponse } from "@/server/api";
import { AppError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    if (!checkOrigin(req)) throw new AppError("bad_origin", "درخواست نامعتبر.", 403);
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) revokeSession(getDb(), tokenHash(token));
    const res = NextResponse.json({ ok: true });
    res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
