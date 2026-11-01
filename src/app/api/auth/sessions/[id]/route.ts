import { and, eq, like } from "drizzle-orm";
import * as t from "@/db/schema";
import { authed } from "@/server/api";
import { AppError } from "@/lib/errors";

/** Revoke one session by its public short id (prefix of the hashed id). */
export const DELETE = authed<{ id: string }>(({ db, user, params }) => {
  if (!/^[a-f0-9]{16}$/.test(params.id)) throw new AppError("bad_id", "شناسه نامعتبر.");
  db.delete(t.sessions).where(and(eq(t.sessions.userId, user.id), like(t.sessions.id, `${params.id}%`))).run();
  return { ok: true };
});
