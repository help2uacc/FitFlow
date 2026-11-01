import type { DB } from "@/db/client";
import { AppError } from "@/lib/errors";
import { enqueueJob, activeJobs } from "@/domain/ai/jobs";
import { getActiveWorkoutVersion } from "@/domain/plans/workout-service";
import { archiveActiveNutrition, getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { getOnboardingState, getProfile, saveProfile } from "@/domain/profile/service";
import { QUESTIONS, isVisible } from "@/domain/onboarding/questions";

export function requestInitialProgram(db: DB, userId: string) {
  if (!getOnboardingState(db, userId).completed) throw new AppError("onboarding_incomplete", "ابتدا پرسشنامه را کامل کنید.", 409);
  if (getActiveWorkoutVersion(db, userId)) throw new AppError("plan_exists", "برنامه فعال دارید؛ برای برنامه جدید از تمدید دوره یا اصلاح برنامه استفاده کنید.", 409);
  const { job, duplicate } = enqueueJob(db, { userId, type: "initial_program", payload: {}, dedupeKey: "initial_program" });
  return { job, duplicate };
}

/** Questions of the nutrition section that still need an answer. */
export function missingNutritionQuestions(db: DB, userId: string) {
  const st = getOnboardingState(db, userId);
  const answers = { ...st.answers, nutrition_mode: "full" };
  return QUESTIONS.filter((q) => q.category === "nutrition" && isVisible(q, answers) && !q.optional && (st.answers[q.id] === undefined || st.answers[q.id] === null)).map((q) => q.id);
}

export function setNutritionMode(db: DB, userId: string, mode: "none" | "full" | "guidance") {
  const p = getProfile(db, userId);
  p.nutrition.mode = mode;
  saveProfile(db, userId, p);
  if (mode !== "full") archiveActiveNutrition(db, userId);
  return { mode, missing: mode === "full" ? missingNutritionQuestions(db, userId) : [] };
}

export function requestNutritionPlan(db: DB, userId: string) {
  const p = getProfile(db, userId);
  if (p.nutrition.mode !== "full") throw new AppError("nutrition_disabled", "برنامه غذایی غیرفعال است.", 409);
  const missing = missingNutritionQuestions(db, userId);
  if (missing.length) throw new AppError("nutrition_onboarding", "ابتدا سؤالات تغذیه را پاسخ دهید.", 409, { missing });
  const activate = !getActiveNutritionVersion(db, userId);
  return enqueueJob(db, { userId, type: "nutrition_plan", payload: { reason: activate ? "برنامه غذایی اولیه" : "برنامه غذایی جدید", activate }, dedupeKey: "nutrition_plan" });
}

export function pendingPlanJobs(db: DB, userId: string) {
  return activeJobs(db, userId, ["initial_program", "nutrition_plan", "revise_workout", "revise_nutrition", "next_cycle"]);
}
