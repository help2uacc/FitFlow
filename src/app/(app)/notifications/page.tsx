import Link from "next/link";
import { Card, EmptyState, PageHeader, cx, faDateTime } from "@/components/ui";
import { MarkAllRead } from "@/components/settings/mark-read";
import { getDb } from "@/db/client";
import { listNotifications, unreadCount } from "@/domain/notifications/service";
import { requireUser } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "اعلان‌ها" };

export default async function Page() {
  const user = await requireUser();
  const db = getDb();
  const items = listNotifications(db, user.id, 50);
  const unread = unreadCount(db, user.id);
  return (
    <>
      <PageHeader title="اعلان‌ها" action={<Link href="/settings#notifications" className="text-sm text-brand-700 dark:text-brand-300">تنظیمات اعلان</Link>} />
      <MarkAllRead unread={unread} />
      {!items.length ? <EmptyState title="اعلانی ندارید" /> : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((n) => {
              const body = (
                <div className="flex gap-3 p-4">
                  <span className={cx("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand-500")} aria-hidden />
                  <div className="min-w-0">
                    <div className="font-semibold">{n.title}</div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{n.body}</div>
                    <div className="mt-1 text-xs text-slate-400">{faDateTime(n.createdAt)}</div>
                  </div>
                </div>
              );
              return <li key={n.id}>{n.url ? <Link href={n.url} className="block hover:bg-slate-50 dark:hover:bg-slate-800/50">{body}</Link> : body}</li>;
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
