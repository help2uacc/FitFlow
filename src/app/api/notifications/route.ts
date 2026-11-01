import { authed } from "@/server/api";
import { listNotifications, unreadCount } from "@/domain/notifications/service";

export const GET = authed(({ db, user }) => ({ items: listNotifications(db, user.id, 50), unread: unreadCount(db, user.id) }));
