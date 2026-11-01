import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { listExercises } from "@/domain/tracking/workout-views";
import { PageHeader } from "@/components/ui";
import { ExerciseLibrary } from "@/components/workout/exercise-library";

export const dynamic = "force-dynamic";
export const metadata = { title: "کتابخانه حرکات" };

export default async function ExercisesPage() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader title="کتابخانه حرکات" subtitle="راهنمای تصویری با منبع معتبر برای هر حرکت" />
      <ExerciseLibrary items={listExercises(getDb())} />
    </>
  );
}
