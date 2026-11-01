import { PageHeader } from "@/components/ui";
import { ReportsPanel } from "@/components/settings/reports-panel";
import { getDb } from "@/db/client";
import { getActiveWorkoutVersion } from "@/domain/plans/workout-service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { requireUser } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "گزارش‌های PDF" };

export default async function Page() {
  const user = await requireUser();
  const db = getDb();
  return (
    <>
      <PageHeader title="گزارش‌های PDF" subtitle="فایل‌های قابل چاپ و دانلود با پشتیبانی کامل فارسی" />
      <ReportsPanel hasWorkout={!!getActiveWorkoutVersion(db, user.id)} hasNutrition={!!getActiveNutritionVersion(db, user.id)} />
    </>
  );
}
