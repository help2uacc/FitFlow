/** Read models for the workout UI (exercise catalog from DB, workout detail with previous performance). */
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { notFound } from "@/lib/errors";
import { getWorkoutDetail, previousPerformance } from "./workouts";

export function listExercises(db: DB, f: { q?: string; muscle?: string; equipment?: string } = {}) {
  const rows = db.select().from(t.exercises).where(eq(t.exercises.isActive, true)).orderBy(asc(t.exercises.nameFa)).all();
  const media = db.select().from(t.exerciseMedia).orderBy(asc(t.exerciseMedia.sortOrder)).all();
  const q = f.q?.trim().toLowerCase();
  return rows
    .filter((e) => !q || e.nameFa.includes(q) || e.nameEn.toLowerCase().includes(q))
    .filter((e) => !f.muscle || e.primaryMuscles.includes(f.muscle) || e.secondaryMuscles.includes(f.muscle))
    .filter((e) => !f.equipment || e.equipment.includes(f.equipment))
    .map((e) => ({
      id: e.id, nameFa: e.nameFa, nameEn: e.nameEn, pattern: e.pattern, level: e.level, equipment: e.equipment,
      primaryMuscles: e.primaryMuscles, image: media.find((m) => m.exerciseId === e.id && m.verified)?.localPath ?? null,
    }));
}

export function exerciseDetail(db: DB, id: string) {
  const ex = db.select().from(t.exercises).where(and(eq(t.exercises.id, id), eq(t.exercises.isActive, true))).get();
  if (!ex) throw notFound("حرکت");
  const media = db.select().from(t.exerciseMedia).where(eq(t.exerciseMedia.exerciseId, id)).orderBy(asc(t.exerciseMedia.sortOrder)).all();
  const sources = db.select().from(t.exerciseSources).where(eq(t.exerciseSources.exerciseId, id)).all();
  return { exercise: ex, media, sources };
}

export function workoutDetailWithPrevious(db: DB, userId: string, id: string) {
  const d = getWorkoutDetail(db, userId, id);
  const ids = new Set<string>(d.session?.exercises.map((e) => e.exerciseId) ?? []);
  for (const s of d.sets) ids.add(s.exerciseId);
  const previous: Record<string, ReturnType<typeof previousPerformance>> = {};
  for (const exId of ids) previous[exId] = previousPerformance(db, userId, exId, id);
  return { ...d, previous };
}
