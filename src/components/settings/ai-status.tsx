"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type JobView } from "@/lib/client";
import { JobStatus } from "@/components/job-status";
import { Alert, Badge, Button, Card, CardHeader, faDateTime, faNum } from "@/components/ui";

interface Diag {
  provider: string; binaryFound: boolean; binaryPath: string | null; version: string | null; loggedIn: boolean | null; loginStatusText: string | null;
  smokeTest: { ok: boolean; durationMs: number; error?: string } | null; osUser: string; workdir: string; checkedAt: number; problems: string[];
}
interface Status { provider: string; diagnostic: Diag | null; diagnosticAt: number | null; worker: { lastHeartbeat: number | null; ok: boolean }; recent: { outcome: string; durationMs: number; createdAt: number; provider: string; attempt: number }[] }

const yes = (v: boolean | null | undefined) => v === null || v === undefined ? <Badge>نامشخص</Badge> : v ? <Badge tone="brand">بله</Badge> : <Badge tone="rose">خیر</Badge>;
const OUTCOME: Record<string, string> = { valid: "معتبر", invalid: "نامعتبر (اصلاح شد/رد شد)", auth: "خطای احراز هویت", usage_limit: "سقف استفاده", timeout: "اتمام زمان", cancelled: "لغو", invalid_output: "خروجی نامعتبر", unavailable: "عدم دسترسی", not_installed: "نصب نیست", process: "خطای اجرا" };

function Cmd({ children }: { children: string }) {
  return <pre className="ltr overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100" dir="ltr"><code>{children}</code></pre>;
}

export function AiStatus() {
  const [s, setS] = useState<Status | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { try { setS(await api<Status>("/api/settings/ai")); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { api<Status>("/api/settings/ai").then(setS).catch((e) => setErr((e as Error).message)); }, []);
  const run = async (smoke: boolean) => {
    setErr(null);
    try { setJobId((await api<{ job: JobView }>("/api/settings/ai", { body: { smoke } })).job.id); } catch (e) { setErr((e as Error).message); }
  };
  const d = s?.diagnostic;
  const needsLogin = d && d.binaryFound && d.loggedIn === false;
  return (
    <div className="space-y-4">
      {err && <Alert tone="error">{err}</Alert>}
      <Card>
        <CardHeader title="سرویس پس‌زمینه (Worker)" />
        {s ? (
          <div className="flex items-center justify-between text-sm">
            <span>{s.worker.ok ? "در حال اجرا" : "پاسخ نمی‌دهد"}{s.worker.lastHeartbeat ? ` · آخرین سیگنال ${faDateTime(s.worker.lastHeartbeat)}` : ""}</span>
            {s.worker.ok ? <Badge tone="brand">سالم</Badge> : <Badge tone="rose">متوقف</Badge>}
          </div>
        ) : <p className="text-sm text-slate-500">…</p>}
        {s && !s.worker.ok && <p className="mt-2 text-xs text-slate-500">سرویس fitflow-worker را بررسی کنید: <span className="ltr">sudo systemctl status fitflow-worker</span></p>}
      </Card>

      <Card>
        <CardHeader title="Codex CLI" subtitle={s ? `ارائه‌دهنده: ${s.provider === "mock" ? "شبیه‌ساز (فقط تست/توسعه)" : "Codex CLI روی سرور"}` : undefined}
          action={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => run(false)} disabled={!!jobId}>بررسی مجدد</Button><Button size="sm" variant="soft" onClick={() => run(true)} disabled={!!jobId}>تست کامل (یک درخواست واقعی)</Button></div>} />
        {jobId && <div className="mb-3"><JobStatus jobId={jobId} title="بررسی سیستم" onDone={() => { setJobId(null); void load(); }} /></div>}
        {!d ? <p className="text-sm text-slate-500">هنوز بررسی انجام نشده است. «بررسی مجدد» را بزنید (Worker باید در حال اجرا باشد).</p> : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">فایل اجرایی پیدا شد</dt><dd>{yes(d.binaryFound)} {d.binaryPath && <span className="ltr text-xs text-slate-500">{d.binaryPath}</span>}</dd>
            <dt className="text-slate-500">نسخه</dt><dd className="ltr text-right">{d.version ?? "—"}</dd>
            <dt className="text-slate-500">وارد شده (login)</dt><dd>{yes(d.loggedIn)}</dd>
            <dt className="text-slate-500">کاربر سیستم‌عامل</dt><dd className="ltr text-right">{d.osUser}</dd>
            <dt className="text-slate-500">پوشه کاری</dt><dd className="ltr break-all text-right text-xs">{d.workdir}</dd>
            {d.loginStatusText && <><dt className="text-slate-500">وضعیت ورود</dt><dd className="ltr text-right text-xs">{d.loginStatusText}</dd></>}
            {d.smokeTest && <><dt className="text-slate-500">تست کامل</dt><dd>{d.smokeTest.ok ? <Badge tone="brand">موفق ({faNum(d.smokeTest.durationMs / 1000, 1)} ثانیه)</Badge> : <Badge tone="rose">ناموفق</Badge>} {d.smokeTest.error && <span className="ltr text-xs text-rose-600">{d.smokeTest.error}</span>}</dd></>}
            <dt className="text-slate-500">آخرین بررسی</dt><dd>{faDateTime(d.checkedAt)}</dd>
          </dl>
        )}
        {d && d.problems.length > 0 && <div className="mt-3"><Alert tone="warn" title="مشکلات">{<ul className="ltr list-inside list-disc text-left text-xs">{d.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}</Alert></div>}
      </Card>

      {(needsLogin || (d && !d.binaryFound)) && (
        <Card>
          <CardHeader title="راه‌اندازی Codex روی سرور" subtitle="این دستورات را مدیر سرور یک بار اجرا می‌کند؛ هیچ توکنی در این صفحه نمایش داده نمی‌شود." />
          <div className="space-y-3 text-sm">
            {d && !d.binaryFound && <><p>۱. نصب Codex CLI (برای کل سیستم) و تنظیم CODEX_BIN در فایل env در صورت نیاز:</p><Cmd>{"sudo npm install -g @openai/codex\nwhich codex"}</Cmd></>}
            <p>ورود برای کاربر سرویس (fitflow) — ورود با حساب ChatGPT از طریق کد دستگاه:</p>
            <Cmd>{"sudo -u fitflow -H codex login"}</Cmd>
            <p>یا با کلید API:</p>
            <Cmd>{"printenv OPENAI_API_KEY | sudo -u fitflow -H codex login --with-api-key"}</Cmd>
            <p>بررسی:</p>
            <Cmd>{"sudo -u fitflow -H codex login status"}</Cmd>
            <p className="text-xs text-slate-500">اعتبارنامه‌ها در پوشه CODEX_HOME کاربر fitflow (پیش‌فرض ‎~/.codex) ذخیره می‌شوند؛ اگر CODEX_HOME را در env تنظیم کرده‌اید، همان مقدار را هنگام login هم استفاده کنید (مثلاً <span className="ltr">sudo -u fitflow -H env CODEX_HOME=/var/lib/fitflow/codex-home codex login</span>). این پوشه نباید در مسیرهای عمومی وب باشد. سپس «بررسی مجدد» را بزنید.</p>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="درخواست‌های اخیر هوش مصنوعی" subtitle="بدون نمایش متن درخواست‌ها" />
        {s?.recent.length ? (
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {s.recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span>{OUTCOME[r.outcome] ?? r.outcome}{r.attempt > 1 ? ` (تلاش ${faNum(r.attempt)})` : ""}</span>
                <span className="text-xs text-slate-500">{faNum(r.durationMs / 1000, 1)} ثانیه · {faDateTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">هنوز درخواستی ثبت نشده است.</p>}
      </Card>
    </div>
  );
}
