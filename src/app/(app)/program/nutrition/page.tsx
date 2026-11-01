import Link from "next/link";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { getProfile } from "@/domain/profile/service";
import { getActiveNutritionVersion, latestNutritionDraft } from "@/domain/plans/nutrition-service";
import { activeJobs } from "@/domain/ai/jobs";
import type { NutritionPlan } from "@/domain/plans/schemas";
import { MEAL_SLOT_FA } from "@/domain/plans/schemas";
import { dayOfWeek, todayISO } from "@/lib/dates";
import { Alert, Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat, faDateTime, faNum } from "@/components/ui";
import { GeneratePlan, GroceryList, WeekMenu } from "@/components/nutrition/plan-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "برنامه غذایی" };

export default async function NutritionProgramPage() {
  const user = await requireOnboardedUser();
  const db = getDb();
  const profile = getProfile(db, user.id);
  const active = getActiveNutritionVersion(db, user.id);
  const draft = latestNutritionDraft(db, user.id);
  const pending = activeJobs(db, user.id, ["nutrition_plan", "revise_nutrition"])[0];

  if (profile.nutrition.mode !== "full" && !active) {
    return (
      <div className="space-y-4">
        <PageHeader title="برنامه غذایی" />
        <EmptyState title="برنامه غذایی غیرفعال است" action={<LinkButton href="/nutrition/setup">فعال‌سازی برنامه غذایی</LinkButton>}>
          برنامه غذایی اختیاری است و هر زمان می‌توانید آن را فعال یا غیرفعال کنید.
        </EmptyState>
      </div>
    );
  }
  if (!active) {
    return (
      <div className="space-y-4">
        <PageHeader title="برنامه غذایی" />
        <Card>
          <CardHeader title="هنوز برنامه غذایی ندارید" subtitle="برنامه هفت‌روزه بر اساس هدف، ترجیحات و برنامه تمرینی شما ساخته می‌شود." />
          <GeneratePlan pendingJobId={pending?.type === "nutrition_plan" ? pending.id : null} />
        </Card>
      </div>
    );
  }

  const plan = active.plan as NutritionPlan;
  const tg = plan.targets;
  return (
    <div className="space-y-4">
      <PageHeader title={plan.title} subtitle={`نسخه ${faNum(active.version)} · ${active.revisionReason} · ${faDateTime(active.activatedAt ?? active.createdAt)}`}
        action={<LinkButton href="/program/adjust?tab=nutrition" size="sm" variant="soft">تنظیم کالری</LinkButton>} />
      {profile.nutrition.mode !== "full" && <Alert tone="warn">برنامه غذایی در تنظیمات غیرفعال شده است؛ این آخرین برنامه شماست.</Alert>}
      {draft && (
        <Alert tone="info" title="پیشنهاد اصلاح برنامه آماده است">
          <Link className="underline" href={`/program/review-nutrition/${draft.id}`}>بررسی و تأیید پیش‌نویس</Link>
        </Alert>
      )}
      {pending && <Alert tone="info">یک درخواست برنامه غذایی در حال پردازش است.</Alert>}

      <Card>
        <CardHeader title="هدف‌های روزانه" subtitle="تخمینی؛ روند وزن در ۲ تا ۳ هفته معیار اصلی تنظیم است." />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="کالری" value={faNum(tg.kcal)} hint="کیلوکالری" />
          <Stat label="پروتئین" value={faNum(tg.proteinG)} hint="گرم" />
          <Stat label="کربوهیدرات" value={faNum(tg.carbsG)} hint="گرم" />
          <Stat label="چربی" value={faNum(tg.fatG)} hint="گرم" />
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">فرضیات محاسبه</summary>
          <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
            <li>متابولیسم پایه (تخمینی): <span className="num">{faNum(tg.bmr)}</span> کیلوکالری</li>
            <li>نیاز نگهداری روزانه (تخمینی): <span className="num">{faNum(tg.tdee)}</span> کیلوکالری</li>
            {tg.assumptions.map((a, i) => <li key={i}>• {a}</li>)}
          </ul>
        </details>
        <p className="mt-3 text-sm">💧 {plan.hydrationGuidance} <span className="num text-slate-500">(حدود {faNum(tg.waterMl / 1000, 1)} لیتر)</span></p>
      </Card>

      {plan.coachMessage && <Card><p className="text-sm leading-7">{plan.coachMessage}</p>{plan.rationale.length > 0 && <ul className="mt-2 list-inside list-disc text-sm text-slate-600 dark:text-slate-300">{plan.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul>}</Card>}

      <section aria-label="منوی هفتگی" className="space-y-2">
        <h2 className="font-bold">منوی هفت‌روزه</h2>
        <WeekMenu plan={plan} todayDow={dayOfWeek(todayISO(user.timezone))} />
      </section>

      {plan.alternatives.length > 0 && (
        <Card>
          <CardHeader title="وعده‌های جایگزین" subtitle="از صفحه تغذیه روزانه با دکمه «جایگزین» قابل انتخاب‌اند." />
          <ul className="space-y-2 text-sm">
            {plan.alternatives.map((a, i) => (
              <li key={i} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
                <div className="font-medium">{MEAL_SLOT_FA[a.slot as keyof typeof MEAL_SLOT_FA] ?? a.slot}: {a.title}</div>
                <div className="text-xs text-slate-500">{a.items.map((x) => `${x.nameFa} ${faNum(x.grams)} گرم`).join("، ")}</div>
                <div className="num text-xs">{faNum(a.totals.kcal)} کیلوکالری · پروتئین {faNum(a.totals.proteinG)} گرم</div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="فهرست خرید هفتگی" subtitle="مقادیر تقریبی برای یک هفته" />
        <GroceryList items={plan.groceryList} versionId={active.id} />
      </Card>

      <div className="flex flex-wrap gap-2">
        <LinkButton href="/nutrition/log">ثبت غذای امروز</LinkButton>
        <LinkButton href="/program/history" variant="secondary">تاریخچه نسخه‌ها</LinkButton>
        <LinkButton href="/reports" variant="secondary">دانلود PDF</LinkButton>
        <LinkButton href="/nutrition/setup" variant="ghost">تنظیمات برنامه غذایی</LinkButton>
      </div>
    </div>
  );
}
