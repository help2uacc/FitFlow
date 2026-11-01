/** Personal data export and full account deletion. */
import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { AppError } from "@/lib/errors";
import { verifyPassword } from "@/domain/auth/password";
import { deleteReports } from "@/domain/pdf/export";
import { deleteAllPhotos } from "@/domain/progress/photos";

export function exportUserData(db: DB, userId: string) {
  const u = db.select().from(t.users).where(eq(t.users.id, userId)).get();
  if (!u) throw new AppError("not_found", "کاربر پیدا نشد.", 404);
  const { passwordHash: _ph, ...user } = u;
  const completed = db.select().from(t.completedWorkouts).where(eq(t.completedWorkouts.userId, userId)).all();
  const nVersions = db.select().from(t.nutritionPlanVersions).where(eq(t.nutritionPlanVersions.userId, userId)).all();
  const wVersions = db.select().from(t.workoutPlanVersions).where(eq(t.workoutPlanVersions.userId, userId)).all();
  return {
    exportedAt: new Date().toISOString(),
    format: "fitflow-export-v1",
    user,
    profile: {
      userProfile: db.select().from(t.userProfiles).where(eq(t.userProfiles.userId, userId)).get() ?? null,
      fitnessGoals: db.select().from(t.fitnessGoals).where(eq(t.fitnessGoals.userId, userId)).get() ?? null,
      trainingPreferences: db.select().from(t.trainingPreferences).where(eq(t.trainingPreferences.userId, userId)).get() ?? null,
      equipment: db.select().from(t.equipmentProfiles).where(eq(t.equipmentProfiles.userId, userId)).get() ?? null,
      healthConstraints: db.select().from(t.healthConstraints).where(eq(t.healthConstraints.userId, userId)).get() ?? null,
      nutritionPreferences: db.select().from(t.nutritionPreferences).where(eq(t.nutritionPreferences.userId, userId)).get() ?? null,
    },
    onboardingAnswers: db.select().from(t.onboardingAnswers).where(eq(t.onboardingAnswers.userId, userId)).all(),
    bodyMeasurements: db.select().from(t.bodyMeasurements).where(eq(t.bodyMeasurements.userId, userId)).all(),
    programCycles: db.select().from(t.programCycles).where(eq(t.programCycles.userId, userId)).all(),
    workoutPlanVersions: wVersions,
    nutritionPlanVersions: nVersions,
    completedWorkouts: completed,
    completedSets: db.select().from(t.completedSets).where(eq(t.completedSets.userId, userId)).all(),
    workoutFeedback: db.select().from(t.workoutFeedback).where(eq(t.workoutFeedback.userId, userId)).all(),
    customFoods: db.select().from(t.foods).where(eq(t.foods.userId, userId)).all(),
    recipes: db.select().from(t.recipes).where(eq(t.recipes.userId, userId)).all().map((r) => ({ ...r, ingredients: db.select().from(t.recipeIngredients).where(eq(t.recipeIngredients.recipeId, r.id)).all() })),
    foodLog: db.select().from(t.foodLogEntries).where(eq(t.foodLogEntries.userId, userId)).all(),
    nutritionDailySummaries: db.select().from(t.nutritionDailySummaries).where(eq(t.nutritionDailySummaries.userId, userId)).all(),
    mealSubstitutions: db.select().from(t.mealSubstitutions).where(eq(t.mealSubstitutions.userId, userId)).all(),
    checkins: db.select().from(t.progressCheckins).where(eq(t.progressCheckins.userId, userId)).all(),
    progressPhotos: db.select().from(t.progressPhotos).where(eq(t.progressPhotos.userId, userId)).all().map(({ fileName: _f, ...p }) => p),
    adjustmentRequests: db.select().from(t.planAdjustmentRequests).where(eq(t.planAdjustmentRequests.userId, userId)).all(),
    planChangeHistory: db.select().from(t.planChangeHistory).where(eq(t.planChangeHistory.userId, userId)).all(),
    aiJobs: db.select({ id: t.aiJobs.id, type: t.aiJobs.type, status: t.aiJobs.status, createdAt: t.aiJobs.createdAt, finishedAt: t.aiJobs.finishedAt, result: t.aiJobs.result })
      .from(t.aiJobs).where(eq(t.aiJobs.userId, userId)).all(),
    notifications: db.select().from(t.notifications).where(eq(t.notifications.userId, userId)).all(),
    reports: db.select().from(t.exportedReports).where(eq(t.exportedReports.userId, userId)).all().map(({ fileName: _f, ...r }) => r),
  };
}

export async function deleteAccount(db: DB, userId: string, password: string) {
  const u = db.select().from(t.users).where(eq(t.users.id, userId)).get();
  if (!u || !(await verifyPassword(u.passwordHash, password))) throw new AppError("invalid_credentials", "رمز عبور اشتباه است.", 400);
  await deleteReports(db, userId);
  await deleteAllPhotos(db, userId);
  db.transaction((tx) => {
    // rows whose FK to users is nullable / not cascading
    tx.delete(t.foods).where(eq(t.foods.userId, userId)).run();
    const jobs = tx.select({ id: t.aiJobs.id }).from(t.aiJobs).where(eq(t.aiJobs.userId, userId)).all().map((j) => j.id);
    if (jobs.length) tx.delete(t.aiGenerationMetadata).where(inArray(t.aiGenerationMetadata.jobId, jobs)).run();
    tx.delete(t.appSettings).where(eq(t.appSettings.key, `notif_prefs:${userId}`)).run();
    tx.delete(t.users).where(eq(t.users.id, userId)).run();
  });
}
