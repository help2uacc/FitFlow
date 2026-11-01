import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { getAnswers, getPlanReview, getProfile } from "@/domain/profile/service";
import { computeTargets } from "@/domain/nutrition/calc";
import { ageOf, deriveSafetyFlags, nutritionEnabled } from "@/domain/profile/model";
import { Card, CardHeader, PageHeader, Stat, faNum } from "@/components/ui";
import { ProfileEditor } from "@/components/profile/editor";
import { PlanReviewBanner } from "@/components/dashboard/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "پروفایل" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await requireOnboardedUser();
  const db = getDb();
  const profile = getProfile(db, user.id);
  const est = computeTargets(profile);
  const flags = deriveSafetyFlags(profile);
  const review = getPlanReview(db, user.id);
  const { section } = await searchParams;
  return (
    <div className="space-y-4">
      <PageHeader title="پروفایل من" subtitle={user.email} />
      {review && <PlanReviewBanner fields={review.fields} />}
      <Card>
        <CardHeader title="خلاصه" subtitle="تخمین‌ها بر اساس پروفایل فعلی؛ دقیق نیستند و با روند وزن اصلاح می‌شوند." />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="سن" value={faNum(ageOf(profile))} />
          <Stat label="وزن فعلی" value={`${faNum(profile.personal.weightKg, 1)} کیلوگرم`} />
          <Stat label="متابولیسم پایه (تخمینی)" value={faNum(est.bmr)} hint="کیلوکالری" />
          <Stat label="نیاز روزانه (تخمینی)" value={faNum(est.tdee)} hint="کیلوکالری" />
        </div>
        {flags.redFlags.length > 0 && <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">به دلیل علائم هشدار گزارش‌شده، شدت تمرین محافظه‌کارانه تنظیم می‌شود. پیشنهاد می‌شود پیش از تمرینات شدید، ارزیابی پزشکی انجام دهید.</p>}
        <p className="mt-3 text-sm text-slate-500">برنامه غذایی: {nutritionEnabled(profile) ? "فعال" : profile.nutrition.mode === "guidance" ? "راهنمای کلی" : "غیرفعال"} — تغییر از <a className="text-brand-700 underline" href="/nutrition/setup">تنظیمات تغذیه</a></p>
      </Card>
      <ProfileEditor answers={getAnswers(db, user.id)} openSection={section ?? null} />
    </div>
  );
}
