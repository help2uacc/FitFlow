import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { getProfile } from "@/domain/profile/service";
import { missingNutritionQuestions } from "@/domain/program/service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { activeJobs } from "@/domain/ai/jobs";
import { PageHeader } from "@/components/ui";
import { NutritionSetup } from "@/components/nutrition/setup";

export const dynamic = "force-dynamic";
export const metadata = { title: "تنظیمات برنامه غذایی" };

export default async function NutritionSetupPage() {
  const user = await requireOnboardedUser();
  const db = getDb();
  const mode = getProfile(db, user.id).nutrition.mode ?? "none";
  return (
    <div>
      <PageHeader title="برنامه غذایی" subtitle="فعال یا غیرفعال کردن برنامه غذایی؛ تنظیمات تغذیه مستقل از برنامه تمرینی است." back="/nutrition/log" />
      <NutritionSetup
        currentMode={mode === "recommend" ? "full" : mode}
        hasPlan={!!getActiveNutritionVersion(db, user.id)}
        initialMissing={mode === "full" ? missingNutritionQuestions(db, user.id) : []}
        pendingJobId={activeJobs(db, user.id, ["nutrition_plan"])[0]?.id ?? null}
      />
    </div>
  );
}
