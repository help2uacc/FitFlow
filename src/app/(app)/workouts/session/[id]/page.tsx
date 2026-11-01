import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { workoutDetailWithPrevious, listExercises } from "@/domain/tracking/workout-views";
import { getCatalogExercise } from "@/domain/plans/validate-workout";
import { getProfile } from "@/domain/profile/service";
import { AppError } from "@/lib/errors";
import { WorkoutLogger, type LoggedSet, type SlotInit } from "@/components/workout/workout-logger";

export const dynamic = "force-dynamic";
export const metadata = { title: "جلسه تمرین" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOnboardedUser();
  const db = getDb();
  let d;
  try {
    d = workoutDetailWithPrevious(db, user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const info = (exId: string) => {
    const ex = getCatalogExercise(exId);
    return { nameFa: ex?.nameFa ?? exId, nameEn: ex?.nameEn ?? "", image: ex?.media[0]?.localPath ?? null, muscles: ex?.primaryMuscles ?? [] };
  };
  const slots: SlotInit[] = [];
  if (d.session) {
    d.session.exercises.forEach((e, i) => {
      const row = d.session!.exerciseRows.find((r) => r.sortOrder === i) ?? null;
      slots.push({
        slot: String(i), workoutExerciseId: row?.id ?? null, exerciseId: e.exerciseId, ...info(e.exerciseId), sets: e.sets, repMin: e.repMin, repMax: e.repMax,
        unit: e.unit, restSec: e.restSec, targetRir: e.targetRir, loadGuidance: e.loadGuidance, notes: e.notes, sessionKey: d.session!.key, index: i,
        previous: d.previous[e.exerciseId] ?? null,
      });
    });
  }
  // unscheduled exercises (or ones added during the session)
  const extra = [...new Set(d.sets.filter((s) => !s.workoutExerciseId).map((s) => s.exerciseId))];
  extra.forEach((exId, i) => {
    slots.push({
      slot: `x${i}`, workoutExerciseId: null, exerciseId: exId, ...info(exId), sets: 0, repMin: 8, repMax: 12, unit: "reps", restSec: 90, targetRir: null,
      loadGuidance: "", notes: "", sessionKey: null, index: null, previous: d.previous[exId] ?? null,
    });
  });
  const catalog = listExercises(db).map((e) => ({ id: e.id, nameFa: e.nameFa, nameEn: e.nameEn, image: e.image, muscles: e.primaryMuscles }));
  const w = d.workout;
  return (
    <WorkoutLogger
      workout={{ id: w.id, clientId: w.clientId, title: w.title, date: w.date, status: w.status, startedAt: w.startedAt, durationSec: w.durationSec, unscheduled: w.unscheduled, totalVolumeKg: w.totalVolumeKg }}
      slots={slots}
      logged={d.sets as LoggedSet[]}
      detailed={getProfile(db, user.id).preferences.tracking === "detailed"}
      catalog={catalog}
    />
  );
}
