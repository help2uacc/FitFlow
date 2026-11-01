import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { listWorkoutLogs } from "@/domain/tracking/workouts";
import { PageHeader } from "@/components/ui";
import { HistoryList } from "@/components/workout/history-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "تاریخچه تمرین" };

export default async function HistoryPage() {
  const user = await requireOnboardedUser();
  const { items, nextBefore } = listWorkoutLogs(getDb(), user.id, { limit: 20 });
  return (
    <>
      <PageHeader title="تاریخچه تمرین" back="/workouts/today" />
      <HistoryList initial={items.map((i) => ({ id: i.id, title: i.title, date: i.date, status: i.status, durationSec: i.durationSec, totalVolumeKg: i.totalVolumeKg, unscheduled: i.unscheduled }))} nextBefore={nextBefore} />
    </>
  );
}
