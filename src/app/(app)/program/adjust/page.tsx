import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { getActiveWorkoutVersion } from "@/domain/plans/workout-service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { getProfile } from "@/domain/profile/service";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { AdjustTabs } from "@/components/program/adjust";

export const dynamic = "force-dynamic";
export const metadata = { title: "تنظیم برنامه" };

export default async function AdjustPage({ searchParams }: { searchParams: Promise<{ tab?: string; request?: string }> }) {
  const user = await requireOnboardedUser();
  const db = getDb();
  const sp = await searchParams;
  const w = getActiveWorkoutVersion(db, user.id);
  const n = getActiveNutritionVersion(db, user.id);
  const p = getProfile(db, user.id);
  if (!w) return (<><PageHeader title="تنظیم برنامه" /><EmptyState title="هنوز برنامه‌ای ندارید" action={<LinkButton href="/dashboard">ساخت برنامه</LinkButton>} /></>);
  const plan = w.plan as WorkoutPlan;
  return (
    <div>
      <PageHeader title="تنظیم برنامه" subtitle="تغییرات ابتدا پیش‌نمایش می‌شوند و نسخه قبلی حفظ می‌شود." back="/dashboard" />
      <AdjustTabs
        initialTab={sp.tab === "nutrition" ? "nutrition" : "workout"}
        requestId={sp.request ?? null}
        workout={{
          days: plan.sessions.length, split: plan.split, difficulty: plan.difficulty, title: plan.title,
          minutes: Math.round(plan.sessions.reduce((s, x) => s + x.estimatedMinutes, 0) / plan.sessions.length),
          goal: p.goals.primary ?? null,
        }}
        nutrition={n ? { kcal: n.targetKcal, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG, goal: p.nutrition.goal ?? null, mealsPerDay: Number(p.nutrition.mealsPerDay ?? 4) } : null}
      />
    </div>
  );
}
