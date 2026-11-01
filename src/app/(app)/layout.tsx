import { AppShell } from "@/components/app-shell";
import { getDb } from "@/db/client";
import { unreadCount } from "@/domain/notifications/service";
import { requireOnboardedUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  return <AppShell userName={user.displayName} unread={unreadCount(getDb(), user.id)}>{children}</AppShell>;
}
