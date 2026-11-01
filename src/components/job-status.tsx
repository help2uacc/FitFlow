"use client";
import { useState } from "react";
import { api, JOB_STATUS_FA, useJob, type JobView } from "@/lib/client";
import { Alert, Button, Spinner } from "./ui";

/**
 * Live status of a background AI/PDF job with cancel & retry.
 * `onDone` fires once when the job reaches a terminal state.
 */
export function JobStatus({ jobId, onDone, title = "در حال آماده‌سازی" }: { jobId: string; onDone?: (j: JobView) => void; title?: string }) {
  const [current, setCurrent] = useState(jobId);
  const job = useJob(current, onDone);
  const [busy, setBusy] = useState(false);
  if (!job) return <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="size-4" /> در حال بررسی وضعیت…</div>;
  const cancel = async () => { setBusy(true); try { await api(`/api/jobs/${job.id}/cancel`, { method: "POST" }); } finally { setBusy(false); } };
  const retry = async () => { setBusy(true); try { const j = await api<JobView>(`/api/jobs/${job.id}/retry`, { method: "POST" }); setCurrent(""); setTimeout(() => setCurrent(j.id), 10); } finally { setBusy(false); } };
  if (job.status === "failed") {
    return (
      <Alert tone="error" title="تولید ناموفق بود">
        <p>{job.error ?? "خطای نامشخص"}</p>
        <p className="mt-1 text-xs opacity-80">برنامه فعلی شما بدون تغییر باقی ماند.</p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={retry} loading={busy}>تلاش دوباره</Button>
      </Alert>
    );
  }
  if (job.status === "cancelled") return <Alert tone="info">درخواست لغو شد.</Alert>;
  if (job.status === "completed") return <Alert tone="success">آماده شد.</Alert>;
  return (
    <div className="rounded-xl bg-brand-50 p-4 ring-1 ring-brand-100 dark:bg-brand-950/40 dark:ring-brand-900" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <Spinner className="size-5 text-brand-600" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title} — {JOB_STATUS_FA[job.status]}</div>
          <div className="text-sm text-slate-600 dark:text-slate-300">{job.progress ?? ""}</div>
          {job.retryAt && <div className="text-xs text-amber-700 dark:text-amber-300">{job.error} — تلاش مجدد حدود ساعت {new Date(job.retryAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</div>}
        </div>
        {job.status === "queued" || job.status === "running" ? <Button size="sm" variant="ghost" onClick={cancel} loading={busy}>لغو</Button> : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">می‌توانید از این صفحه خارج شوید؛ پس از آماده شدن اعلان دریافت می‌کنید.</p>
    </div>
  );
}
