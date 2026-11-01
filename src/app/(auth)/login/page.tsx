import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { registrationOpen } from "@/domain/auth/service";
import { currentSession } from "@/server/auth";
import { env } from "@/lib/env";
import { LoginForm } from "@/components/auth/login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "ورود" };

export default async function LoginPage() {
  if (await currentSession()) redirect("/dashboard");
  const db = getDb();
  const open = registrationOpen(db, env().ALLOW_REGISTRATION);
  return (
    <>
      <LoginForm />
      {open && <p className="mt-4 text-center text-sm">حساب ندارید؟ <Link className="font-semibold text-brand-700 dark:text-brand-300" href="/register">ثبت‌نام</Link></p>}
      <p className="mt-6 text-center text-xs text-slate-500">رمز عبور را فراموش کرده‌اید؟ مدیر سرور می‌تواند با دستور <span className="ltr font-mono">pnpm user:reset-password</span> آن را بازنشانی کند.</p>
    </>
  );
}
