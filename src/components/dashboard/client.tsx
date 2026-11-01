"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { JobStatus } from "@/components/job-status";
import { Alert, Button } from "@/components/ui";
import { QUESTION_BY_ID } from "@/domain/onboarding/questions";

export function GenerateFirstProgram({ initialJobId }: { initialJobId: string | null }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ job: { id: string } }>("/api/programs/initial", { method: "POST" });
      setJobId(r.job.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطا");
    } finally {
      setLoading(false);
    }
  };
  if (jobId) return <JobStatus jobId={jobId} title="ساخت برنامه شخصی" onDone={(j) => { if (j.status === "completed") router.refresh(); }} />;
  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <Button block size="lg" onClick={start} loading={loading}>ساخت اولین برنامه من</Button>
    </div>
  );
}

export function PlanReviewBanner({ fields }: { fields: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: "update" | "dismiss") => {
    setBusy(true);
    try {
      await api("/api/profile/plan-review", { body: { action } });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطا");
    } finally {
      setBusy(false);
    }
  };
  const labels = fields.map((f) => QUESTION_BY_ID.get(f)?.title.replace(/[؟?]$/, "")).filter(Boolean).slice(0, 3);
  return (
    <Alert tone="warn" title="پروفایل شما تغییر کرده است">
      <p>تغییرات ({labels.join("، ")}) ممکن است روی برنامه اثر بگذارد. برنامه فعلی تا تأیید نسخه جدید حفظ می‌شود.</p>
      {error && <p className="mt-1 text-rose-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => act("update")} loading={busy}>به‌روزرسانی برنامه بر اساس این تغییرات</Button>
        <Button size="sm" variant="ghost" onClick={() => act("dismiss")} disabled={busy}>نیازی نیست</Button>
      </div>
    </Alert>
  );
}

const JOB_FA: Record<string, string> = { initial_program: "ساخت برنامه", nutrition_plan: "ساخت برنامه غذایی", revise_workout: "اصلاح برنامه تمرینی", revise_nutrition: "اصلاح برنامه غذایی", next_cycle: "ساخت دوره جدید", coach: "پاسخ مربی", analyze_progress: "تحلیل پیشرفت" };
export function PendingJobs({ jobs }: { jobs: { id: string; type: string }[] }) {
  const router = useRouter();
  return (
    <div className="space-y-2">
      {jobs.map((j) => <JobStatus key={j.id} jobId={j.id} title={JOB_FA[j.type] ?? "پردازش"} onDone={() => router.refresh()} />)}
    </div>
  );
}
