import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, lt, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { hashPassword, passwordProblems, verifyPassword } from "./password";

export const SESSION_COOKIE = "ff_session";
const DAY = 86400000;
export const SESSION_TTL = { remember: 30 * DAY, normal: 1 * DAY };

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function userCount(db: DB) {
  return db.select({ n: count() }).from(t.users).get()?.n ?? 0;
}

export function registrationOpen(db: DB, allowEnv: boolean) {
  if (userCount(db) === 0) return true;
  if (allowEnv) return true;
  const s = db.select().from(t.appSettings).where(eq(t.appSettings.key, "allow_registration")).get();
  return s?.value === true;
}

export async function registerUser(db: DB, input: { email: string; displayName: string; password: string }, allowEnv: boolean) {
  if (!registrationOpen(db, allowEnv)) throw new AppError("registration_closed", "ثبت‌نام عمومی غیرفعال است.", 403);
  const email = input.email.trim().toLowerCase();
  const problem = passwordProblems(input.password);
  if (problem) throw new AppError("weak_password", problem);
  if (db.select().from(t.users).where(eq(t.users.email, email)).get()) throw new AppError("email_taken", "این ایمیل قبلاً ثبت شده است.", 409);
  const role = userCount(db) === 0 ? "owner" : "user";
  const id = newId();
  db.insert(t.users).values({ id, email, displayName: input.displayName.trim(), passwordHash: await hashPassword(input.password), role }).run();
  return { id, email, role };
}

export async function authenticate(db: DB, email: string, password: string) {
  const user = db.select().from(t.users).where(eq(t.users.email, email.trim().toLowerCase())).get();
  // constant-ish work even when the user doesn't exist
  const ok = user ? await verifyPassword(user.passwordHash, password) : (await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$ZmFrZWhhc2hmYWtlaGFzaA", password), false);
  if (!user || !ok) throw new AppError("invalid_credentials", "ایمیل یا رمز عبور اشتباه است.", 401);
  return user;
}

export function createSession(db: DB, userId: string, opts: { remember: boolean; userAgent?: string | null; ip?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + (opts.remember ? SESSION_TTL.remember : SESSION_TTL.normal);
  db.insert(t.sessions).values({ id: tokenHash(token), userId, createdAt: now, lastSeenAt: now, expiresAt, remember: opts.remember, userAgent: opts.userAgent?.slice(0, 300) ?? null, ip: opts.ip ?? null }).run();
  return { token, expiresAt };
}

export function validateSession(db: DB, token: string | undefined | null) {
  if (!token || token.length > 200) return null;
  const id = tokenHash(token);
  const now = Date.now();
  const row = db.select({ s: t.sessions, u: t.users }).from(t.sessions).innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    .where(and(eq(t.sessions.id, id), gt(t.sessions.expiresAt, now))).get();
  if (!row) return null;
  if (now - row.s.lastSeenAt > 5 * 60 * 1000) {
    const ttl = row.s.remember ? SESSION_TTL.remember : SESSION_TTL.normal;
    db.update(t.sessions).set({ lastSeenAt: now, expiresAt: Math.max(row.s.expiresAt, now + ttl) }).where(eq(t.sessions.id, id)).run();
  }
  const { passwordHash: _ph, ...user } = row.u;
  void _ph;
  return { sessionId: id, user };
}

export function revokeSession(db: DB, sessionId: string, userId?: string) {
  const cond = userId ? and(eq(t.sessions.id, sessionId), eq(t.sessions.userId, userId)) : eq(t.sessions.id, sessionId);
  db.delete(t.sessions).where(cond).run();
}

export function revokeOtherSessions(db: DB, userId: string, keepSessionId: string) {
  db.delete(t.sessions).where(and(eq(t.sessions.userId, userId), ne(t.sessions.id, keepSessionId))).run();
}

export function purgeExpiredSessions(db: DB) {
  db.delete(t.sessions).where(lt(t.sessions.expiresAt, Date.now())).run();
}

export async function changePassword(db: DB, userId: string, current: string, next: string) {
  const user = db.select().from(t.users).where(eq(t.users.id, userId)).get();
  if (!user || !(await verifyPassword(user.passwordHash, current))) throw new AppError("invalid_credentials", "رمز عبور فعلی اشتباه است.", 400);
  const problem = passwordProblems(next);
  if (problem) throw new AppError("weak_password", problem);
  db.update(t.users).set({ passwordHash: await hashPassword(next), updatedAt: Date.now() }).where(eq(t.users.id, userId)).run();
}

export async function resetPasswordOffline(db: DB, email: string, next: string) {
  const user = db.select().from(t.users).where(eq(t.users.email, email.trim().toLowerCase())).get();
  if (!user) throw new Error("No user with that email");
  const problem = passwordProblems(next);
  if (problem) throw new Error(problem);
  db.update(t.users).set({ passwordHash: await hashPassword(next), updatedAt: Date.now() }).where(eq(t.users.id, user.id)).run();
  db.delete(t.sessions).where(eq(t.sessions.userId, user.id)).run();
}
