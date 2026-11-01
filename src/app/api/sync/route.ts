import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { authed, body } from "@/server/api";
import { AppError } from "@/lib/errors";
import { LogSetInput, StartWorkoutInput, WorkoutStatusInput, logSet, startWorkout, updateWorkoutStatus } from "@/domain/tracking/workouts";
import { LogFoodInput, LogPlannedMealInput, logFood, logPlannedMeal } from "@/domain/tracking/food";
import { recordWeight } from "@/domain/profile/service";

const Op = z.object({ type: z.string(), payload: z.record(z.string(), z.unknown()), createdAt: z.number().optional() });
const Body = z.object({ ops: z.array(Op).max(200) });

/**
 * Offline outbox synchronisation. Ops are applied in order and idempotently
 * (client IDs). Conflicts (server copy newer) keep the server version.
 */
export const POST = authed(async ({ req, db, user }) => {
  const { ops } = await body(req, Body);
  const results: { id: string; ok: boolean; conflict?: boolean; retry?: boolean; error?: string }[] = [];
  const workoutIdFor = (p: Record<string, unknown>) => {
    if (typeof p.completedWorkoutId === "string") return p.completedWorkoutId;
    if (typeof p.workoutId === "string") return p.workoutId;
    const cid = p.workoutClientId;
    if (typeof cid !== "string") throw new AppError("bad_op", "missing workout reference");
    const w = db.select().from(t.completedWorkouts).where(and(eq(t.completedWorkouts.userId, user.id), eq(t.completedWorkouts.clientId, cid))).get();
    if (!w) throw new AppError("missing_parent", "workout not synced yet");
    return w.id;
  };
  for (const op of ops) {
    const id = String(op.payload.clientId ?? "");
    try {
      switch (op.type) {
        case "start_workout":
          startWorkout(db, user.id, StartWorkoutInput.parse(op.payload));
          results.push({ id, ok: true });
          break;
        case "log_set": {
          const p = { ...op.payload, completedWorkoutId: workoutIdFor(op.payload), clientUpdatedAt: op.createdAt };
          const r = logSet(db, user.id, LogSetInput.parse(p));
          results.push({ id, ok: true, conflict: r.conflict });
          break;
        }
        case "workout_status": {
          const wid = workoutIdFor(op.payload);
          const w = db.select().from(t.completedWorkouts).where(eq(t.completedWorkouts.id, wid)).get();
          const input = WorkoutStatusInput.parse(op.payload);
          if (w && w.status === "completed" && input.action === "complete") results.push({ id, ok: true });
          else { updateWorkoutStatus(db, user.id, wid, input); results.push({ id, ok: true }); }
          break;
        }
        case "log_food":
          logFood(db, user.id, LogFoodInput.parse(op.payload));
          results.push({ id, ok: true });
          break;
        case "log_planned_meal":
          logPlannedMeal(db, user.id, LogPlannedMealInput.parse(op.payload));
          results.push({ id, ok: true });
          break;
        case "log_weight": {
          const p = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), weightKg: z.number().min(25).max(350) }).parse(op.payload);
          recordWeight(db, user.id, p.weightKg, p.date);
          results.push({ id, ok: true });
          break;
        }
        default:
          results.push({ id, ok: false, error: "unknown op" });
      }
    } catch (e) {
      const retry = e instanceof AppError && e.code === "missing_parent";
      results.push({ id, ok: false, retry, error: e instanceof Error ? e.message : "error" });
    }
  }
  return { results };
});
