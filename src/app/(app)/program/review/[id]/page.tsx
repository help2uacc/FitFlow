import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { diffWorkoutPlans, getActiveWorkoutVersion, getCycle, getWorkoutVersion } from "@/domain/plans/workout-service";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { Alert, Card, CardHeader, PageHeader, faDate, faNum } from "@/components/ui";
import { DraftDecision } from "@/components/program/decision";
import { ChangeSummaryCard, WorkoutPlanSummary } from "@/components/program/plan-summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "بررسی برنامه جدید" };

export default async function ReviewWorkoutDraft({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const db = getDb();
  const { id } = await params;
  let v;
  try { v = getWorkoutVersion(db, user.id, id); } catch { notFound(); }
  const active = getActiveWorkoutVersion(db, user.id);
  const plan = v.plan as WorkoutPlan;
  const diff = active && active.id !== v.id ? diffWorkoutPlans(active.plan as WorkoutPlan, plan) : null;
  const cycle = getCycle(db, user.id, v.cycleId);
  const newCycle = cycle?.status === "draft";
  return (
    <div className="space-y-4">
      <PageHeader title={newCycle ? "برنامه دوره جدید" : "پیش‌نویس اصلاح برنامه"} subtitle={`${v.revisionReason} · ${faDate(new Date(v.createdAt).toISOString().slice(0, 10))}`} back="/dashboard" />
      {v.status !== "draft" && <Alert tone="info">این نسخه دیگر پیش‌نویس نیست (وضعیت: {v.status === "active" ? "فعال" : v.status === "rejected" ? "رد شده" : "جایگزین شده"}).</Alert>}
      {newCycle && <Alert tone="info">با تأیید، دوره {faNum(cycle!.cycleNumber)} از امروز شروع می‌شود و دوره قبلی با همه سوابق در تاریخچه می‌ماند.</Alert>}
      <ChangeSummaryCard cs={plan.changeSummary} coachMessage={plan.coachMessage} />
      {diff && (
        <Card>
          <CardHeader title="مقایسه با برنامه فعلی" subtitle="قبل ← بعد" />
          {diff.lines.length ? <ul className="space-y-1 text-sm">{diff.lines.map((l) => <li key={l} className="num rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800/60">{l}</li>)}</ul> : <p className="text-sm text-slate-500">تفاوت ساختاری ندارد.</p>}
        </Card>
      )}
      <h2 className="text-lg font-bold">{plan.title}</h2>
      <WorkoutPlanSummary plan={plan} />
      {v.status === "draft" && <DraftDecision versionId={v.id} domain="workout" />}
    </div>
  );
}
