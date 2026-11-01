import { authed } from "@/server/api";
import { markAllRead } from "@/domain/notifications/service";

export const POST = authed(({ db, user }) => { markAllRead(db, user.id); return { ok: true }; });
