import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ProgressPage } from "@/components/progress/progress-page";
import { requireUser } from "@/server/auth";
import { todayISO } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "پیشرفت" };

export default async function Page() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="پیشرفت" subtitle="روند تمرین، تغذیه و بدن" action={<Link href="/check-in" className="text-sm font-medium text-brand-700 dark:text-brand-300">چک‌این هفتگی</Link>} />
      <ProgressPage today={todayISO(user.timezone)} />
    </>
  );
}
