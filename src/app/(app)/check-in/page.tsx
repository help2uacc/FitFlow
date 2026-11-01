import { PageHeader } from "@/components/ui";
import { CheckinWizard } from "@/components/progress/checkin-wizard";
import { getDb } from "@/db/client";
import { getProfile } from "@/domain/profile/service";
import { nutritionEnabled } from "@/domain/profile/model";
import { requireUser } from "@/server/auth";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "چک‌این هفتگی" };

export default async function Page() {
  const user = await requireUser();
  const p = getProfile(getDb(), user.id);
  return (
    <>
      <PageHeader title="چک‌این هفتگی" subtitle="کمتر از یک دقیقه — هر سؤال را می‌توانید رد کنید." />
      <CheckinWizard today={todayISO(user.timezone)} nutritionEnabled={nutritionEnabled(p) || p.nutrition.mode === "full"} />
    </>
  );
}
