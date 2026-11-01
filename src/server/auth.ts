import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { SESSION_COOKIE, validateSession } from "@/domain/auth/service";
import { getOnboardingState } from "@/domain/profile/service";
import { isSecureCookie } from "@/lib/env";

export async function currentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(getDb(), token);
}

/** For server components/pages: require an authenticated user or redirect to /login. */
export async function requireUser() {
  const s = await currentSession();
  if (!s) redirect("/login");
  return s.user;
}

/** Require login + completed onboarding. */
export async function requireOnboardedUser() {
  const user = await requireUser();
  const st = getOnboardingState(getDb(), user.id);
  if (!st.completed) redirect("/onboarding");
  return user;
}

export function sessionCookie(token: string, expiresAt: number, remember: boolean) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    ...(remember ? { expires: new Date(expiresAt) } : {}),
  };
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
