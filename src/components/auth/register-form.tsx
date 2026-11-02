"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function RegisterForm({ firstUser, invite }: { firstUser: boolean; invite?: string }) {
  const [f, setF] = useState({ displayName: "", email: "", password: "", passwordConfirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.passwordConfirm) return setError("تکرار رمز عبور مطابقت ندارد.");
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/register", { body: { ...f, invite } });
      window.location.href = "/onboarding";
    } catch (err) {
      setError(err instanceof ApiError ? (err.details as { message: string }[] | undefined)?.[0]?.message ?? err.message : "خطا در ثبت‌نام");
      setLoading(false);
    }
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h1 className="text-lg font-bold">ساخت حساب</h1>
        {firstUser && <p className="text-sm text-slate-500">این اولین حساب و حساب مالک است. پس از آن ثبت‌نام عمومی بسته می‌شود.</p>}
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="نام نمایشی" htmlFor="name"><Input id="name" autoComplete="name" required value={f.displayName} onChange={set("displayName")} /></Field>
        <Field label="ایمیل" htmlFor="email"><Input id="email" type="email" dir="ltr" autoComplete="email" required value={f.email} onChange={set("email")} /></Field>
        <Field label="رمز عبور" htmlFor="pw" hint="حداقل ۱۰ کاراکتر، شامل حرف و عدد"><Input id="pw" type="password" dir="ltr" autoComplete="new-password" required value={f.password} onChange={set("password")} /></Field>
        <Field label="تکرار رمز عبور" htmlFor="pw2"><Input id="pw2" type="password" dir="ltr" autoComplete="new-password" required value={f.passwordConfirm} onChange={set("passwordConfirm")} /></Field>
        <Button type="submit" block size="lg" loading={loading}>ثبت‌نام</Button>
      </form>
    </Card>
  );
}
