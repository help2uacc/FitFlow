import { desc, eq } from "drizzle-orm";
import * as t from "@/db/schema";
import { authed } from "@/server/api";
import { revokeOtherSessions } from "@/domain/auth/service";

export const GET = authed(({ db, user, sessionId }) => ({
  sessions: db.select().from(t.sessions).where(eq(t.sessions.userId, user.id)).orderBy(desc(t.sessions.lastSeenAt)).all().map((s) => ({
    id: s.id.slice(0, 16), current: s.id === sessionId, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, expiresAt: s.expiresAt, remember: s.remember,
  })),
}));

export const DELETE = authed(({ db, user, sessionId }) => {
  revokeOtherSessions(db, user.id, sessionId);
  return { ok: true };
});
