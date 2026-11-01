import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { diffNutritionPlans, getActiveNutritionVersion, getNutritionVersion } from "@/domain/plans/nutrition-service";
import { MEAL_SLOT_FA, type NutritionPlan } from "@/domain/plans/schemas";
import { WEEKDAY_FA, PERSIAN_WEEK_ORDER } from "@/lib/dates";
import { Alert, Card, CardHeader, PageHeader, Stat, faNum } from "@/components/ui";
import { DraftDecision } from "@/components/program/decision";

export const dynamic = "force-dynamic";
export const metadata = { title: "بررسی برنامه غذایی جدید" };

export default async function ReviewNutritionDraft({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const db = getDb();
  const { id } = await params;
  let v;
  try { v = getNutritionVersion(db, user.id, id); } catch { notFound(); }
  const plan = v.plan as NutritionPlan;
  const active = getActiveNutritionVersion(db, user.id);
  const diff = active && active.id !== v.id ? diffNutritionPlans(active.plan as NutritionPlan, plan) : null;
  const days = [...plan.days].sort((a, b) => PERSIAN_WEEK_ORDER.indexOf(a.dayOfWeek) - PERSIAN_WEEK_ORDER.indexOf(b.dayOfWeek));
  return (
    <div className="space-y-4">
      <PageHeader title="پیش‌نویس برنامه غذایی" subtitle={v.revisionReason} back="/program/nutrition" />
      {v.status !== "draft" && <Alert tone="info">این نسخه دیگر پیش‌نویس نیست.</Alert>}
      <Card>
        <CardHeader title="اهداف روزانه" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="کالری" value={faNum(plan.targets.kcal)} hint={active ? `فعلی ${faNum(active.targetKcal)}` : undefined} />
          <Stat label="پروتئین" value={`${faNum(plan.targets.proteinG)} گرم`} hint={active ? `فعلی ${faNum(active.proteinG)}` : undefined} />
          <Stat label="کربوهیدرات" value={`${faNum(plan.targets.carbsG)} گرم`} /><Stat label="چربی" value={`${faNum(plan.targets.fatG)} گرم`} />
        </div>
        {plan.coachMessage && <p className="mt-3 text-sm leading-7">{plan.coachMessage}</p>}
      </Card>
      {diff && diff.lines.length > 0 && <Card><CardHeader title="تغییرات" /><ul className="space-y-1 text-sm">{diff.lines.map((l) => <li key={l} className="num">{l}</li>)}</ul></Card>}
      {days.map((d) => (
        <Card key={d.dayOfWeek}>
          <div className="mb-2 flex justify-between font-bold"><span>{WEEKDAY_FA[d.dayOfWeek]}</span><span className="num text-sm text-slate-500">{faNum(d.totals.kcal)} kcal · P {faNum(d.totals.proteinG)}</span></div>
          <ul className="space-y-1 text-sm">{d.meals.map((m, i) => <li key={i}><b>{MEAL_SLOT_FA[m.slot as keyof typeof MEAL_SLOT_FA] ?? m.slot}:</b> {m.title} — <span className="text-slate-500">{m.items.map((it) => `${it.nameFa} ${faNum(it.grams)}g`).join("، ")}</span></li>)}</ul>
        </Card>
      ))}
      {v.status === "draft" && <DraftDecision versionId={v.id} domain="nutrition" />}
    </div>
  );
}
