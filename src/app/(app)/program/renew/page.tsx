import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { renewalStatus } from "@/domain/adjust/service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { activeJobs } from "@/domain/ai/jobs";
import { Alert, Card, CardHeader, EmptyState, LinkButton, PageHeader, ProgressBar, Stat, faDate, faNum } from "@/components/ui";
import { RenewForm } from "@/components/program/renew";

export const dynamic = "force-dynamic";
export const metadata = { title: "تمدید و دوره جدید" };

export default async function RenewPage({ searchParams }: { searchParams: Promise<{ choice?: string }> }) {
  const user = await requireOnboardedUser();
  const db = getDb();
  const st = renewalStatus(db, user.id);
  const { choice } = await searchParams;
  if (!st) return (<><PageHeader title="دوره جدید" /><EmptyState title="برنامه فعالی ندارید" action={<LinkButton href="/dashboard">ساخت برنامه</LinkButton>} /></>);
  const pending = activeJobs(db, user.id, ["next_cycle"])[0];
  return (
    <div className="space-y-4">
      <PageHeader title="تمدید برنامه / دوره بعد" subtitle="بدون تکرار پرسشنامه؛ بر اساس سوابق و پیشرفت شما." back="/dashboard" />
      <Card>
        <CardHeader title={`دوره ${faNum(st.cycle.cycleNumber)}`} subtitle={`${faDate(st.cycle.startDate)} تا ${faDate(st.cycle.endDate)}`} />
        <ProgressBar value={st.elapsedDays} max={st.totalDays} label="پیشرفت دوره" />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="هفته" value={`${faNum(st.week)} از ${faNum(st.totalWeeks)}`} />
          <Stat label="روزهای باقیمانده" value={faNum(st.daysLeft)} />
          <Stat label="جلسات انجام‌شده" value={faNum(st.adherence.completed)} hint={`از ${faNum(st.adherence.plannedSoFar)} برنامه‌ریزی‌شده تاکنون`} />
          <Stat label="پایبندی" value={st.adherence.adherencePct === null ? "—" : `${faNum(st.adherence.adherencePct)}٪`} />
        </div>
        <Alert tone="info" title="پیشنهاد بر اساس پیشرفت">{st.recommendation.reason}</Alert>
      </Card>
      {st.phase === "active" && st.earlyWarning && <Alert tone="warn" title="تمدید زودهنگام">{st.earlyWarning}</Alert>}
      {st.insufficientData && <Alert tone="warn">کمتر از ۴ جلسه در این دوره ثبت شده؛ برنامه بعدی بیشتر بر اساس پروفایل و کمتر بر اساس عملکرد طراحی می‌شود.</Alert>}
      <RenewForm pendingJobId={pending?.id ?? null} nutritionActive={!!getActiveNutritionVersion(db, user.id)} initialChoice={choice ?? null} />
    </div>
  );
}
