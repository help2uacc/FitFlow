import Link from "next/link";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { cyclePhase, getCycle, getActiveWorkoutVersion, latestDraft } from "@/domain/plans/workout-service";
import { getCatalogExercise } from "@/domain/plans/validate-workout";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { PERSIAN_WEEK_ORDER, WEEKDAY_FA, todayISO } from "@/lib/dates";
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, ProgressBar, faDate, faNum } from "@/components/ui";
import { PlanReplaceButton } from "@/components/workout/plan-replace-button";
import { PlanSnapshot } from "@/components/workout/plan-snapshot";

export const dynamic = "force-dynamic";
export const metadata = { title: "برنامه تمرینی" };

const unitFa = (u: string) => (u === "seconds" ? "ثانیه" : u === "minutes" ? "دقیقه" : "تکرار");
const PHASE_FA = { active: "در حال اجرا", ending_soon: "رو به پایان", ended: "پایان یافته" } as const;

export default async function WorkoutProgramPage() {
  const user = await requireOnboardedUser();
  const db = getDb();
  const v = getActiveWorkoutVersion(db, user.id);
  const draft = latestDraft(db, user.id);
  if (!v) {
    return (
      <>
        <PageHeader title="برنامه تمرینی" />
        {draft && <div className="mb-4"><Alert tone="info">یک پیش‌نویس برنامه آماده بررسی است. <Link className="underline" href={`/program/review/${draft.id}`}>بررسی</Link></Alert></div>}
        <EmptyState title="برنامه فعالی وجود ندارد" action={<LinkButton href="/dashboard">ساخت برنامه</LinkButton>}>از صفحه خانه اولین برنامه را بسازید.</EmptyState>
      </>
    );
  }
  const plan = v.plan as WorkoutPlan;
  const cycle = getCycle(db, user.id, v.cycleId);
  const ph = cycle ? cyclePhase(cycle, todayISO(user.timezone)) : null;
  const sessions = [...plan.sessions].sort((a, b) => PERSIAN_WEEK_ORDER.indexOf(a.dayOfWeek) - PERSIAN_WEEK_ORDER.indexOf(b.dayOfWeek));

  return (
    <div className="space-y-4">
      <PlanSnapshot data={{ versionId: v.id, plan, cycle }} />
      <PageHeader title={plan.title} subtitle={plan.objective} action={<LinkButton href="/program/adjust" size="sm" variant="soft">تنظیم برنامه</LinkButton>} />
      {draft && <Alert tone="info" title="پیش‌نویس جدید آماده است">یک نسخه پیشنهادی برای برنامه شما ساخته شده است. <Link className="font-semibold underline" href={`/program/review/${draft.id}`}>بررسی و تأیید</Link></Alert>}

      {cycle && ph && (
        <Card>
          <CardHeader title={`دوره ${faNum(cycle.cycleNumber)} — نسخه ${faNum(v.version)}`} subtitle={`${faDate(cycle.startDate)} تا ${faDate(cycle.endDate)} · بازبینی ${faDate(cycle.reviewDate)}`} action={<Badge tone={ph.phase === "active" ? "brand" : ph.phase === "ending_soon" ? "amber" : "rose"}>{PHASE_FA[ph.phase]}</Badge>} />
          <ProgressBar value={ph.elapsedDays} max={ph.totalDays} label="پیشرفت دوره" />
          <p className="mt-2 text-sm text-slate-500">هفته {faNum(ph.week)} از {faNum(ph.totalWeeks)} · {faNum(ph.daysLeft)} روز باقی‌مانده</p>
          {ph.phase !== "active" && <div className="mt-3"><LinkButton href="/program/renew" size="sm">تمدید یا دوره بعد</LinkButton></div>}
        </Card>
      )}

      <Card>
        <CardHeader title="خلاصه" />
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge>تقسیم‌بندی: {plan.split}</Badge>
          <Badge tone="amber">سختی {faNum(plan.difficulty)} از ۵</Badge>
          <Badge tone="brand">{faNum(plan.sessions.length)} جلسه در هفته</Badge>
        </div>
        <p className="mt-3 text-sm">{plan.intensityGuidance}</p>
        {plan.coachMessage && <p className="mt-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-950/40">💬 {plan.coachMessage}</p>}
      </Card>

      <Card>
        <CardHeader title="برنامه هفتگی" />
        <ul className="grid grid-cols-7 gap-1 text-center text-xs">
          {PERSIAN_WEEK_ORDER.map((d) => {
            const s = plan.sessions.find((x) => x.dayOfWeek === d);
            return (
              <li key={d} className={s ? "rounded-lg bg-brand-50 p-1.5 dark:bg-brand-950/40" : "rounded-lg bg-slate-50 p-1.5 text-slate-400 dark:bg-slate-800/50"}>
                <div className="font-semibold">{WEEKDAY_FA[d].replace("‌شنبه", "").slice(0, 3)}</div>
                <div className="mt-0.5 truncate">{s ? s.title : "استراحت"}</div>
              </li>
            );
          })}
        </ul>
      </Card>

      {sessions.map((s) => (
        <Card key={s.key} as="article">
          <CardHeader title={`${WEEKDAY_FA[s.dayOfWeek]} — ${s.title}`} subtitle={`${s.focus.join("، ")} · حدود ${faNum(s.estimatedMinutes)} دقیقه`} />
          {s.warmup.length > 0 && <details className="mb-2 text-sm"><summary className="cursor-pointer font-medium">گرم کردن</summary><ul className="mt-1 list-disc pr-5 text-slate-600 dark:text-slate-300">{s.warmup.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-right text-xs text-slate-500"><th className="p-1">حرکت</th><th className="p-1">ست</th><th className="p-1">تکرار</th><th className="p-1">استراحت</th><th className="p-1">RIR</th><th className="p-1"></th></tr></thead>
              <tbody>
                {s.exercises.map((e, i) => {
                  const ex = getCatalogExercise(e.exerciseId);
                  return (
                    <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                      <td className="p-1.5">
                        <Link href={`/exercises/${encodeURIComponent(e.exerciseId)}`} className="font-medium hover:underline">{ex?.nameFa ?? e.exerciseId}</Link>
                        <div className="ltr text-[11px] text-slate-500">{ex?.nameEn}</div>
                        {e.loadGuidance && <div className="text-xs text-slate-500">{e.loadGuidance}</div>}
                        {e.alternatives.length > 0 && <div className="text-[11px] text-slate-400">جایگزین‌ها: {e.alternatives.map((a) => getCatalogExercise(a)?.nameFa ?? a).join("، ")}</div>}
                      </td>
                      <td className="num p-1.5">{faNum(e.sets)}</td>
                      <td className="num p-1.5">{faNum(e.repMin)}–{faNum(e.repMax)} {unitFa(e.unit)}</td>
                      <td className="num p-1.5">{faNum(e.restSec)}ث</td>
                      <td className="num p-1.5">{e.targetRir === null ? "—" : faNum(e.targetRir)}</td>
                      <td className="p-1.5"><PlanReplaceButton exerciseId={e.exerciseId} exerciseName={ex?.nameFa ?? e.exerciseId} sessionKey={s.key} index={i} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {s.cooldown.length > 0 && <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">سرد کردن</summary><ul className="mt-1 list-disc pr-5 text-slate-600 dark:text-slate-300">{s.cooldown.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
        </Card>
      ))}

      <Card>
        <CardHeader title="قوانین پیشرفت و ریکاوری" />
        <h3 className="text-sm font-semibold">پیشرفت</h3>
        <ul className="mb-3 list-disc pr-5 text-sm">{plan.progressionRules.map((r, i) => <li key={i}>{r}</li>)}</ul>
        <h3 className="text-sm font-semibold">ریکاوری</h3>
        <ul className="mb-3 list-disc pr-5 text-sm">{plan.recoveryGuidance.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {plan.safetyNotes.length > 0 && <><h3 className="text-sm font-semibold">نکات ایمنی</h3><ul className="list-disc pr-5 text-sm">{plan.safetyNotes.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
      </Card>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/program/adjust" variant="secondary">تنظیم سختی و زمان</LinkButton>
        <LinkButton href="/program/history" variant="secondary">نسخه‌های قبلی</LinkButton>
        <LinkButton href="/reports" variant="secondary">دانلود PDF</LinkButton>
      </div>
    </div>
  );
}
