import Link from "next/link";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { addDays, dayOfWeek, todayISO, WEEKDAY_FA } from "@/lib/dates";
import { Alert, Badge, Card, CardHeader, EmptyState, LinkButton, ProgressBar, Stat, faDate, faNum } from "@/components/ui";
import { cyclePhase, getActiveWorkoutVersion, getCycle, getSessionsForVersion, latestDraft } from "@/domain/plans/workout-service";
import { latestNutritionDraft } from "@/domain/plans/nutrition-service";
import { plannedSessionFor } from "@/domain/tracking/workouts";
import { nutritionDay } from "@/domain/tracking/food";
import { getPlanReview, getProfile } from "@/domain/profile/service";
import { nutritionEnabled } from "@/domain/profile/model";
import { weightSeries, workoutAdherence, rangeFor } from "@/domain/progress/analytics";
import { activeJobs, jobView } from "@/domain/ai/jobs";
import { MEAL_SLOT_FA, type WorkoutPlan } from "@/domain/plans/schemas";
import { GenerateFirstProgram, PlanReviewBanner, PendingJobs } from "@/components/dashboard/client";
import { DashboardSnapshot } from "@/components/dashboard/snapshot";

export const dynamic = "force-dynamic";
export const metadata = { title: "داشبورد" };

export default async function Dashboard() {
  const user = await requireOnboardedUser();
  const db = getDb();
  const today = todayISO(user.timezone);
  const profile = getProfile(db, user.id);
  const active = getActiveWorkoutVersion(db, user.id);
  const jobs = activeJobs(db, user.id).filter((j) => j.lane === "ai").map(jobView);
  const review = getPlanReview(db, user.id);
  const greeting = `سلام ${user.displayName}`;

  if (!active) {
    const initialJob = jobs.find((j) => j.type === "initial_program");
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold">{greeting} 👋</h1>
        <Card>
          <CardHeader title="آماده ساخت اولین برنامه" subtitle="بر اساس پروفایل شما، برنامه تمرینی شخصی (و در صورت انتخاب، برنامه غذایی) ساخته می‌شود." />
          <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
            <Stat label="هدف" value={GOAL_FA[profile.goals.primary ?? ""] ?? "—"} />
            <Stat label="جلسات در هفته" value={faNum(Number(profile.training.daysPerWeek))} />
            <Stat label="مدت هر جلسه" value={`${faNum(profile.training.sessionMinutes)} دقیقه`} />
            <Stat label="برنامه غذایی" value={nutritionEnabled(profile) ? "فعال" : profile.nutrition.mode === "guidance" ? "راهنمای کلی" : "غیرفعال"} />
          </dl>
          <GenerateFirstProgram initialJobId={initialJob?.id ?? null} />
          <p className="mt-3 text-xs text-slate-500">می‌خواهید چیزی را قبل از ساخت تغییر دهید؟ <Link href="/profile" className="text-brand-700 underline">ویرایش پروفایل</Link></p>
        </Card>
      </div>
    );
  }

  const plan = active.plan as WorkoutPlan;
  const cycle = getCycle(db, user.id, active.cycleId)!;
  const phase = cyclePhase(cycle, today);
  const todays = plannedSessionFor(db, user.id, today);
  const nut = nutritionEnabled(profile) ? nutritionDay(db, user.id, today) : null;
  const weekStart = addDays(today, -((dayOfWeek(today) + 1) % 7));
  const week = workoutAdherence(db, user.id, weekStart, addDays(weekStart, 6));
  const weight = weightSeries(db, user.id, rangeFor("30").from, today);
  const draft = latestDraft(db, user.id);
  const nDraft = latestNutritionDraft(db, user.id);
  const nextMeal = nut?.meals.find((m) => m.status === "pending");

  return (
    <div className="space-y-4">
      <DashboardSnapshot data={{ today, plan, cycle, nutrition: nut, sessionIds: Object.fromEntries(getSessionsForVersion(db, active.id).map((r) => [r.sessionKey, r.id])) }} />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{greeting} 👋</h1>
          <p className="text-sm text-slate-500">{faDate(today, { dateStyle: "full" })}</p>
        </div>
      </div>

      {review && <PlanReviewBanner fields={review.fields} />}
      {draft && <Alert tone="info" title="پیش‌نویس برنامه آماده بررسی است"><Link className="font-semibold underline" href={`/program/review/${draft.id}`}>مشاهده تغییرات و تأیید</Link></Alert>}
      {nDraft && <Alert tone="info" title="پیش‌نویس برنامه غذایی آماده بررسی است"><Link className="font-semibold underline" href={`/program/review-nutrition/${nDraft.id}`}>مشاهده و تأیید</Link></Alert>}
      {jobs.length > 0 && <PendingJobs jobs={jobs.map((j) => ({ id: j.id, type: j.type }))} />}
      {(phase.phase === "ending_soon" || phase.phase === "ended") && (
        <Alert tone="warn" title={phase.phase === "ended" ? "دوره برنامه شما به پایان رسید" : "دوره برنامه شما رو به پایان است"}>
          <p>پیشرفت را بررسی کنید و برای دوره بعد تصمیم بگیرید — بدون نیاز به پرسشنامه دوباره.</p>
          <div className="mt-2 flex flex-wrap gap-2"><LinkButton size="sm" href="/program/renew">برنامه دوره بعد</LinkButton><LinkButton size="sm" variant="secondary" href="/progress">بررسی پیشرفت</LinkButton></div>
        </Alert>
      )}

      <Card>
        <CardHeader title="تمرین امروز" subtitle={WEEKDAY_FA[dayOfWeek(today)]} action={todays.log ? <Badge tone={todays.log.status === "completed" ? "brand" : "amber"}>{todays.log.status === "completed" ? "انجام شد" : todays.log.status === "missed" ? "از دست رفت" : "در جریان"}</Badge> : null} />
        {todays.session ? (
          <div className="space-y-3">
            <div className="text-lg font-bold">{todays.session.title}</div>
            <div className="flex flex-wrap gap-1.5">{todays.session.focus.map((f) => <Badge key={f}>{f}</Badge>)}</div>
            <div className="grid grid-cols-2 gap-2"><Stat label="مدت تقریبی" value={`${faNum(todays.session.estimatedMinutes)} دقیقه`} /><Stat label="تعداد حرکات" value={faNum(todays.session.exercises.length)} /></div>
            <LinkButton href={todays.log ? `/workouts/session/${todays.log.id}` : "/workouts/today"} block size="lg">{todays.log ? (todays.log.status === "completed" ? "مشاهده جلسه" : "ادامه تمرین") : "شروع تمرین"}</LinkButton>
          </div>
        ) : (
          <EmptyState title="امروز روز استراحت است">{todays.next ? `جلسه بعد: ${todays.next.title} — ${WEEKDAY_FA[todays.next.dayOfWeek]}` : null}</EmptyState>
        )}
      </Card>

      {nut && (
        <Card>
          <CardHeader title="تغذیه امروز" action={<Link href="/nutrition/log" className="text-sm font-semibold text-brand-700 dark:text-brand-300">ثبت غذا</Link>} />
          {nut.target ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="کالری مصرفی" value={`${faNum(nut.consumed.kcal)}`} hint={`از ${faNum(nut.target.kcal)}`} />
                <Stat label="باقیمانده" value={faNum(nut.remainingKcal)} hint="کیلوکالری (تخمینی)" />
              </div>
              <div className="space-y-1"><div className="flex justify-between text-xs"><span>پروتئین</span><span className="num">{faNum(nut.consumed.proteinG)} / {faNum(nut.target.proteinG)} گرم</span></div><ProgressBar value={nut.consumed.proteinG} max={nut.target.proteinG} label="پروتئین" /></div>
              {nextMeal && <p className="text-sm">وعده بعدی: <b>{MEAL_SLOT_FA[nextMeal.slot as keyof typeof MEAL_SLOT_FA]}</b> — {nextMeal.title}</p>}
            </div>
          ) : (
            <EmptyState title="برنامه غذایی هنوز آماده نیست"><Link href="/program/nutrition" className="text-brand-700 underline">ساخت برنامه غذایی</Link></EmptyState>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="پیشرفت این هفته" />
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span>جلسات انجام‌شده</span><span className="num font-bold">{faNum(week.completedPlanned)} / {faNum(week.planned)}</span></div>
            <ProgressBar value={week.completedPlanned} max={Math.max(1, week.planned)} label="جلسات هفته" />
            <div className="text-sm text-slate-500">{weight.trendKgPerWeek === null ? "برای روند وزن، وزن خود را چند بار در هفته ثبت کنید." : `روند وزن: ${faNum(weight.trendKgPerWeek, 2)} کیلوگرم در هفته`}</div>
            <Link href="/progress" className="text-sm font-semibold text-brand-700 dark:text-brand-300">نمودارهای پیشرفت ←</Link>
          </div>
        </Card>
        <Card>
          <CardHeader title="برنامه فعلی" subtitle={`دوره ${faNum(cycle.cycleNumber)} · نسخه ${faNum(active.version)}`} />
          <div className="space-y-2 text-sm">
            <div className="font-semibold">{plan.title}</div>
            <div className="flex justify-between"><span className="text-slate-500">هفته</span><span className="num">{faNum(phase.week)} از {faNum(phase.totalWeeks)}</span></div>
            <ProgressBar value={phase.elapsedDays} max={phase.totalDays} label="پیشرفت دوره" />
            <div className="flex justify-between"><span className="text-slate-500">روزهای باقیمانده</span><span className="num">{faNum(phase.daysLeft)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">تاریخ بازبینی</span><span>{faDate(cycle.reviewDate)}</span></div>
            <LinkButton href="/program/adjust" variant="soft" size="sm" block>تغییر برنامه</LinkButton>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="دسترسی سریع" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {[
            ["/workouts/today", "شروع تمرین"], ["/nutrition/log", "ثبت وعده"], ["/progress#weight", "ثبت وزن"], ["/program/adjust?tab=nutrition", "تنظیم کالری"],
            ["/program/adjust", "تنظیم سختی"], ["/coach", "مربی هوشمند"], ["/program/renew", "دوره بعد"], ["/check-in", "چک‌این هفتگی"],
          ].filter(([href]) => nut || !href.includes("nutrition")).map(([href, label]) => (
            <Link key={href} href={href} className="grid min-h-16 place-items-center rounded-xl bg-slate-50 p-2 text-center text-sm font-medium hover:bg-brand-50 dark:bg-slate-800/60 dark:hover:bg-brand-900/30">{label}</Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

const GOAL_FA: Record<string, string> = { muscle_gain: "افزایش عضله", fat_loss: "کاهش چربی", recomp: "ترکیب بدنی", strength: "قدرت", endurance: "استقامت", general: "تناسب عمومی", mobility: "تحرک", maintain: "حفظ وزن" };
