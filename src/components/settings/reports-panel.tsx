"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { JobStatus } from "@/components/job-status";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Select, faDateTime } from "@/components/ui";

interface Report { id: string; kind: "workout" | "nutrition" | "combined" | "progress"; status: "queued" | "ready" | "failed"; sizeBytes: number | null; jobId: string | null; error: string | null; createdAt: number }
const KIND: Record<Report["kind"], string> = { workout: "برنامه تمرینی", nutrition: "برنامه غذایی", combined: "تمرین + تغذیه", progress: "گزارش پیشرفت" };

export function ReportsPanel({ hasWorkout, hasNutrition }: { hasWorkout: boolean; hasNutrition: boolean }) {
  const [items, setItems] = useState<Report[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [range, setRange] = useState("30");
  const load = useCallback(async () => { try { setItems((await api<{ items: Report[] }>("/api/reports")).items); } catch (e) { setErr((e as Error).message); } }, []);
  useEffect(() => { api<{ items: Report[] }>("/api/reports").then((r) => setItems(r.items)).catch((e) => setErr((e as Error).message)); }, []);
  const make = async (kind: Report["kind"]) => {
    setErr(null); setBusy(kind);
    try { await api("/api/reports", { body: { kind, ...(kind === "progress" ? { range } : {}) } }); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const opts: { kind: Report["kind"]; desc: string; disabled: boolean; why?: string }[] = [
    { kind: "workout", desc: "برنامه هفتگی، جدول حرکات، راهنما با QR و صفحات ثبت", disabled: !hasWorkout, why: "برنامه تمرینی فعالی ندارید." },
    { kind: "nutrition", desc: "اهداف، منوی ۷ روزه، جایگزین‌ها و فهرست خرید", disabled: !hasNutrition, why: "برنامه غذایی فعال نیست؛ ابتدا آن را از تنظیمات تغذیه فعال کنید." },
    { kind: "combined", desc: "برنامه تمرینی و غذایی در یک فایل", disabled: !hasWorkout || !hasNutrition, why: "برای فایل ترکیبی هر دو برنامه باید فعال باشند." },
    { kind: "progress", desc: "تمرینات انجام‌شده، رکوردها، وزن و تغذیه", disabled: false },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {opts.map((o) => (
          <Card key={o.kind} className="flex flex-col gap-2">
            <div className="font-bold">{KIND[o.kind]}</div>
            <p className="flex-1 text-sm text-slate-500 dark:text-slate-400">{o.desc}</p>
            {o.kind === "progress" && (
              <Select value={range} onChange={(e) => setRange(e.target.value)} aria-label="بازه گزارش">
                <option value="7">۷ روز اخیر</option><option value="14">۱۴ روز اخیر</option><option value="30">۳۰ روز اخیر</option><option value="90">۹۰ روز اخیر</option><option value="all">کل دوره</option>
              </Select>
            )}
            {o.disabled && o.why && <p className="text-xs text-amber-700 dark:text-amber-300">{o.why}</p>}
            <Button variant="secondary" disabled={o.disabled} loading={busy === o.kind} onClick={() => make(o.kind)}>ساخت PDF</Button>
          </Card>
        ))}
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      <Card>
        <CardHeader title="فایل‌های ساخته‌شده" />
        {!items.length ? <EmptyState title="هنوز فایلی ساخته نشده" /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((r) => (
              <li key={r.id} className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{KIND[r.kind]}</div>
                    <div className="text-xs text-slate-500">{faDateTime(r.createdAt)}{r.sizeBytes ? ` · ${(r.sizeBytes / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 0 })} کیلوبایت` : ""}</div>
                  </div>
                  {r.status === "ready" ? <a href={`/api/reports/${r.id}/download`} className="inline-flex h-9 items-center rounded-xl bg-brand-600 px-3 text-sm font-medium text-white" download>دانلود</a>
                    : r.status === "failed" ? <Badge tone="rose">ناموفق</Badge> : <Badge tone="amber">در حال ساخت</Badge>}
                </div>
                {r.status === "queued" && r.jobId && <JobStatus jobId={r.jobId} title="ساخت PDF" onDone={() => void load()} />}
                {r.status === "failed" && <p className="text-xs text-rose-600">ساخت فایل ناموفق بود؛ دوباره تلاش کنید.</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
