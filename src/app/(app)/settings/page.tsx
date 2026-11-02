import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { DangerZone, InstallPanel, InvitePanel, LogoutButton, NotificationsPanel, PasswordPanel, SessionsPanel, ThemePanel } from "@/components/settings/settings-panels";
import { requireUser } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "تنظیمات" };

export default async function Page() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="تنظیمات" subtitle={user.email} />
      <div className="space-y-4">
        <ThemePanel />
        <NotificationsPanel />
        <InstallPanel />
        <Link href="/settings/ai" className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800 dark:hover:bg-slate-800">
          <div className="font-bold">وضعیت سیستم هوش مصنوعی</div>
          <div className="text-sm text-slate-500">بررسی نصب و احراز هویت Codex روی سرور ←</div>
        </Link>
        {user.role === "owner" && <InvitePanel />}
        <PasswordPanel />
        <SessionsPanel />
        <DangerZone />
        <LogoutButton />
      </div>
    </>
  );
}
