"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email, password, remember } });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا در ورود");
      setLoading(false);
    }
  };
  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h1 className="text-lg font-bold">ورود به حساب</h1>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="ایمیل" htmlFor="email"><Input id="email" type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="رمز عبور" htmlFor="password"><Input id="password" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-brand-600" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> مرا به خاطر بسپار</label>
        <Button type="submit" block size="lg" loading={loading}>ورود</Button>
      </form>
    </Card>
  );
}
