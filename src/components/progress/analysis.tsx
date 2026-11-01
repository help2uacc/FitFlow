"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type JobView } from "@/lib/client";
import { JobStatus } from "@/components/job-status";
import { Alert, Badge, Button, Card, CardHeader } from "@/components/ui";
import type { ProgressAnalysis } from "./types";

const ACTION_LINK: Record<string, [string, string] | undefined> = {
  increase_difficulty: ["/program/adjust", "تنظیم سختی تمرین"], decrease_difficulty: ["/program/adjust", "تنظیم سختی تمرین"], deload: ["/program/adjust", "سبک‌تر کردن برنامه"],
  increase_calories: ["/program/adjust?tab=nutrition", "تنظیم کالری"], decrease_calories: ["/program/adjust?tab=nutrition", "تنظیم کالری"], next_cycle: ["/program/renew", "ساخت دوره بعد"],
};
const QUALITY = { insufficient: ["داده ناکافی", "amber"], limited: ["داده محدود", "sky"], good: ["داده کافی", "brand"] } as const;

export function AnalysisView({ a }: { a: ProgressAnalysis }) {
  const q = QUALITY[a.dataQuality];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><Badge tone={q[1]}>{q[0]}</Badge></div>
      <p className="leading-7">{a.summary}</p>
      {a.wins.length > 0 && <div><div className="mb-1 text-sm font-semibold text-brand-700 dark:text-brand-300">نقاط قوت</div><ul className="list-inside list-disc space-y-1 text-sm">{a.wins.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
      {a.concerns.length > 0 && <div><div className="mb-1 text-sm font-semibold text-amber-700 dark:text-amber-300">نکات قابل توجه</div><ul className="list-inside list-disc space-y-1 text-sm">{a.concerns.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
      {a.recommendations.length > 0 && (
        <ul className="space-y-2">
          {a.recommendations.map((r, i) => {
            const link = ACTION_LINK[r.action];
            return (
              <li key={i} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                <div className="font-semibold">{r.title}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">{r.detail}</div>
                {link && <Link href={link[0]} className="mt-1 inline-block text-sm font-medium text-brand-700 dark:text-brand-300">{link[1]} ←</Link>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AiAnalysis() {
  const [analysis, setAnalysis] = useState<ProgressAnalysis | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<{ analysis: ProgressAnalysis | null }>("/api/progress/analysis").then((r) => setAnalysis(r.analysis)).catch(() => {}); }, []);
  const start = async () => {
    setErr(null);
    try { setJobId((await api<{ job: JobView }>("/api/progress/analyze", { method: "POST" })).job.id); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Card>
      <CardHeader title="تحلیل هوشمند پیشرفت" subtitle="بر اساس تمرینات، تغذیه و بازخوردهای ثبت‌شده" action={!jobId && <Button size="sm" variant="soft" onClick={start}>{analysis ? "تحلیل دوباره" : "تحلیل با هوش مصنوعی"}</Button>} />
      {err && <Alert tone="error">{err}</Alert>}
      {jobId && <div className="mb-3"><JobStatus jobId={jobId} title="تحلیل پیشرفت" onDone={(j) => { if (j.status === "completed") { setAnalysis(j.result as ProgressAnalysis); setJobId(null); } }} /></div>}
      {analysis ? <AnalysisView a={analysis} /> : !jobId && <p className="text-sm text-slate-500">هنوز تحلیلی انجام نشده است.</p>}
    </Card>
  );
}
