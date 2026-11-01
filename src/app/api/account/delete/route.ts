import { NextResponse } from "next/server";
import { z } from "zod";
import { authed, body } from "@/server/api";
import { deleteAccount } from "@/domain/account/service";
import { SESSION_COOKIE } from "@/domain/auth/service";

export const POST = authed(async ({ req, db, user }) => {
  const i = await body(req, z.object({ password: z.string().min(1).max(200), confirm: z.literal("DELETE") }));
  await deleteAccount(db, user.id, i.password);
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
});
