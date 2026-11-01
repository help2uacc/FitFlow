import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { diffWorkoutPlans, getActiveWorkoutVersion, getWorkoutVersion } from "@/domain/plans/workout-service";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { Card, CardHeader, PageHeader, faDateTime, faNum } from "@/components/ui";
import { ChangeSummaryCard, WorkoutPlanSummary } from "@/components/program/plan-summary";
import { RestoreVersion } from "@/components/program/decision";

export const dynamic = "force-dynamic";

export default async function VersionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ compare?: string }> }) {
  const user = await requireOnboardedUser();
  const db = getDb();
  const { id } = await params;
  const { compare } = await searchParams;
  let v;
  try { v = getWorkoutVersion(db, user.id, id); } catch { notFound(); }
  const plan = v.plan as WorkoutPlan;
  const active = getActiveWorkoutVersion(db, user.id);
  let other = null;
  try { other = compare ? getWorkoutVersion(db, user.id, compare) : v.previousVersionId ? getWorkoutVersion(db, user.id, v.previousVersionId) : null; } catch { other = null; }
  const diff = other ? diffWorkoutPlans(other.plan as WorkoutPlan, plan) : null;
  return (
    <div className="space-y-4">
      <PageHeader title={`نسخه ${faNum(v.version)}: ${plan.title}`} subtitle={`${v.revisionReason} · ${faDateTime(v.createdAt)}`} back="/program/history" />
      {diff && (
        <Card>
          <CardHeader title={`مقایسه با نسخه ${faNum(other!.version)}`} subtitle="قبل ← بعد" />
          {diff.lines.length ? <ul className="space-y-1 text-sm">{diff.lines.map((l) => <li key={l} className="num rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800/60">{l}</li>)}</ul> : <p className="text-sm text-slate-500">تفاوت ساختاری ندارد.</p>}
        </Card>
      )}
      <ChangeSummaryCard cs={plan.changeSummary} coachMessage={plan.coachMessage} />
      <WorkoutPlanSummary plan={plan} />
      {active && active.id !== v.id && v.status !== "draft" && <RestoreVersion versionId={v.id} />}
    </div>
  );
}
