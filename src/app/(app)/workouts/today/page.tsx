import Link from "next/link";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { plannedSessionFor } from "@/domain/tracking/workouts";
import { getCatalogExercise } from "@/domain/plans/validate-workout";
import { MUSCLE_FA } from "@/domain/exercises/catalog";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { WEEKDAY_FA, todayISO } from "@/lib/dates";
import { Badge, Card, EmptyState, LinkButton, PageHeader, faDate, faNum } from "@/components/ui";
import { TodayActions } from "@/components/workout/today-actions";
import { PlanSnapshot } from "@/components/workout/plan-snapshot";

export const dynamic = "force-dynamic";
export const metadata = { title: "تمرین امروز" };

const STATUS_FA: Record<string, string> = { completed: "انجام شد", in_progress: "در حال اجرا", paused: "متوقف", missed: "از دست رفت", skipped: "رد شد" };

export default async function TodayPage() {
  const user = await requireOnboardedUser();
  const db = getDb();
  const date = todayISO(user.timezone);
  const { version, session, row, next, log } = plannedSessionFor(db, user.id, date);

  if (!version) {
    return (
      <>
        <PageHeader title="تمرین امروز" subtitle={faDate(date)} />
        <EmptyState title="هنوز برنامه تمرینی فعالی ندارید" action={<LinkButton href="/dashboard">ساخت برنامه</LinkButton>}>
          از صفحه خانه، اولین برنامه شخصی خود را بسازید.
        </EmptyState>
        <div className="mt-4"><TodayActions date={date} sessionId={null} existingId={null} existingStatus={null} /></div>
      </>
    );
  }
  const plan = version.plan as WorkoutPlan;
  return (
    <>
      <PlanSnapshot data={{ versionId: version.id, plan, savedFor: date }} />
      <PageHeader title="تمرین امروز" subtitle={`${WEEKDAY_FA[new Date(date + "T00:00:00Z").getUTCDay()]}، ${faDate(date)}`} action={<Link href="/workouts/history" className="text-sm text-brand-700 dark:text-brand-300">تاریخچه</Link>} />
      {session && row ? (
        <Card className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold">{session.title}</h2>
              {log && <Badge tone={log.status === "completed" ? "brand" : log.status === "missed" ? "rose" : "amber"}>{STATUS_FA[log.status]}</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-500">{session.focus.join("، ")} · حدود {faNum(session.estimatedMinutes)} دقیقه · {faNum(session.exercises.length)} حرکت</p>
          </div>
          <ol className="space-y-2">
            {session.exercises.map((e, i) => {
              const ex = getCatalogExercise(e.exerciseId);
              return (
                <li key={i} className="flex items-center gap-3">
                  {ex?.media[0] ? <img src={ex.media[0].localPath} alt="" loading="lazy" className="size-12 rounded-lg object-cover" /> : <div className="size-12 rounded-lg bg-slate-100 dark:bg-slate-800" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{ex?.nameFa ?? e.exerciseId}</div>
                    <div className="text-xs text-slate-500">{faNum(e.sets)} × {faNum(e.repMin)}–{faNum(e.repMax)} · {ex?.primaryMuscles.map((m) => MUSCLE_FA[m] ?? m).join("، ")}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          <TodayActions date={date} sessionId={row.id} existingId={log?.id ?? null} existingStatus={log?.status ?? null} />
        </Card>
      ) : (
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">امروز روز استراحت است 🌿</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">ریکاوری بخشی از پیشرفت است. پیاده‌روی سبک و خواب کافی کمک می‌کند.</p>
          {next && <p className="text-sm">جلسه بعدی: <b>{next.title}</b> — {WEEKDAY_FA[next.dayOfWeek]} ({next.inDays === 1 ? "فردا" : `${faNum(next.inDays)} روز دیگر`})</p>}
          <TodayActions date={date} sessionId={null} existingId={null} existingStatus={null} />
        </Card>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/program/workout" variant="secondary">کل برنامه</LinkButton>
        <LinkButton href="/program/adjust" variant="ghost">تنظیم سختی</LinkButton>
        <LinkButton href="/exercises" variant="ghost">کتابخانه حرکات</LinkButton>
      </div>
      <p className="mt-3 text-xs text-slate-500">{plan.title}</p>
    </>
  );
}
