import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { inviteValid, registrationOpen, userCount } from "@/domain/auth/service";
import { currentSession } from "@/server/auth";
import { env } from "@/lib/env";
import { Card } from "@/components/ui";
import { RegisterForm } from "@/components/auth/register-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "ثبت‌نام" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string | string[] }> }) {
  if (await currentSession()) redirect("/dashboard");
  const db = getDb();
  const { invite } = await searchParams;
  const token = typeof invite === "string" ? invite : undefined;
  const open = registrationOpen(db, env().ALLOW_REGISTRATION);
  if (!open && !inviteValid(db, token)) {
    return (
      <Card>
        <h1 className="text-lg font-bold">{token ? "لینک دعوت نامعتبر است" : "ثبت‌نام غیرفعال است"}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{token ? "این لینک منقضی شده یا قبلاً استفاده شده است. از مالک یک لینک جدید بخواهید." : "ثبت‌نام فقط با لینک دعوت ممکن است."}</p>
        <Link href="/login" className="mt-4 inline-block font-semibold text-brand-700">ورود</Link>
      </Card>
    );
  }
  return (
    <>
      <RegisterForm firstUser={userCount(db) === 0} invite={open ? undefined : token} />
      <p className="mt-4 text-center text-sm">حساب دارید؟ <Link className="font-semibold text-brand-700 dark:text-brand-300" href="/login">ورود</Link></p>
    </>
  );
}
