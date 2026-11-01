import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { registrationOpen, userCount } from "@/domain/auth/service";
import { currentSession } from "@/server/auth";
import { env } from "@/lib/env";
import { Card } from "@/components/ui";
import { RegisterForm } from "@/components/auth/register-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "ثبت‌نام" };

export default async function RegisterPage() {
  if (await currentSession()) redirect("/dashboard");
  const db = getDb();
  if (!registrationOpen(db, env().ALLOW_REGISTRATION)) {
    return (
      <Card>
        <h1 className="text-lg font-bold">ثبت‌نام غیرفعال است</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">این نصب خصوصی FitFlow است و حساب مالک قبلاً ساخته شده است.</p>
        <Link href="/login" className="mt-4 inline-block font-semibold text-brand-700">ورود</Link>
      </Card>
    );
  }
  return (
    <>
      <RegisterForm firstUser={userCount(db) === 0} />
      <p className="mt-4 text-center text-sm">حساب دارید؟ <Link className="font-semibold text-brand-700 dark:text-brand-300" href="/login">ورود</Link></p>
    </>
  );
}
