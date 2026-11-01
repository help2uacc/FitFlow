import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { getProfile } from "@/domain/profile/service";
import { nutritionDay } from "@/domain/tracking/food";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { computeTargets } from "@/domain/nutrition/calc";
import { isValidISODate, todayISO } from "@/lib/dates";
import { Card, CardHeader, LinkButton, PageHeader, faNum } from "@/components/ui";
import { NutritionDayView } from "@/components/nutrition/day-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "تغذیه امروز" };

export default async function NutritionLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireOnboardedUser();
  const sp = await searchParams;
  const db = getDb();
  const today = todayISO(user.timezone);
  const date = sp.date && isValidISODate(sp.date) && sp.date <= today ? sp.date : today;
  const profile = getProfile(db, user.id);
  const mode = profile.nutrition.mode;

  if (mode !== "full") {
    const tg = computeTargets(profile);
    return (
      <div className="space-y-4">
        <PageHeader title="تغذیه" subtitle={mode === "guidance" ? "راهنمای کلی تغذیه" : "برنامه غذایی غیرفعال است"} />
        {mode === "guidance" && (
          <Card>
            <CardHeader title="راهنمای کلی روزانه" subtitle="اعداد تخمینی‌اند و بر اساس پروفایل شما محاسبه شده‌اند." />
            <ul className="space-y-1.5 text-sm">
              <li>انرژی تخمینی موردنیاز: حدود <b className="num">{faNum(tg.kcal)}</b> کیلوکالری</li>
              <li>پروتئین: حدود <b className="num">{faNum(tg.proteinG)}</b> گرم، تقسیم بین ۳ تا ۴ وعده</li>
              <li>آب: حدود <b className="num">{faNum(tg.waterMl / 1000, 1)}</b> لیتر در روز</li>
              <li>در هر وعده اصلی یک منبع پروتئین، سبزیجات و یک منبع کربوهیدرات کامل بگذارید.</li>
            </ul>
          </Card>
        )}
        <Card>
          <CardHeader title="برنامه غذایی کامل می‌خواهید؟" subtitle="منوی هفت‌روزه با مقادیر دقیق، فهرست خرید و ثبت یک‌لمسی وعده‌ها؛ هماهنگ با برنامه تمرینی." />
          <LinkButton href="/nutrition/setup">فعال‌سازی برنامه غذایی</LinkButton>
        </Card>
      </div>
    );
  }

  if (!getActiveNutritionVersion(db, user.id)) {
    return (
      <div className="space-y-4">
        <PageHeader title="تغذیه" />
        <Card>
          <CardHeader title="برنامه غذایی هنوز ساخته نشده" subtitle="برنامه غذایی را بسازید تا وعده‌ها و هدف‌های روزانه اینجا نمایش داده شوند." />
          <LinkButton href="/program/nutrition">ساخت برنامه غذایی</LinkButton>
        </Card>
      </div>
    );
  }

  const day = nutritionDay(db, user.id, date);
  return (
    <div>
      <PageHeader title="تغذیه" subtitle="ثبت وعده‌ها و پیگیری کالری و درشت‌مغذی‌ها" />
      <NutritionDayView key={date} initial={day} today={today}
        replaceQuery={sp.replace ? { slot: sp.slot, criterion: sp.criterion, scope: sp.scope } : undefined} />
    </div>
  );
}
