import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { QUESTION_BY_ID, QUESTIONS, visibleQuestions, type Answers } from "@/domain/onboarding/questions";
import { validateAnswer } from "@/domain/onboarding/validate";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { todayISO } from "@/lib/dates";
import { deriveSafetyFlags, emptyProfile, setPath, type ProfileData } from "./model";

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});

export function getProfile(db: DB, userId: string): ProfileData {
  const p = emptyProfile();
  const up = db.select().from(t.userProfiles).where(eq(t.userProfiles.userId, userId)).get();
  if (up) {
    p.personal = obj(up.personal);
    p.lifestyle = obj(up.lifestyle);
    p.ai = obj(up.aiPreferences);
  }
  const g = db.select().from(t.fitnessGoals).where(eq(t.fitnessGoals.userId, userId)).get();
  if (g) p.goals = obj(g.data);
  const tp = db.select().from(t.trainingPreferences).where(eq(t.trainingPreferences.userId, userId)).get();
  if (tp) {
    const d = obj(tp.data);
    p.experience = obj(d.experience);
    p.training = obj(d.training);
    p.preferences = obj(d.preferences);
  }
  const eqp = db.select().from(t.equipmentProfiles).where(eq(t.equipmentProfiles.userId, userId)).get();
  if (eqp) p.equipment = obj(eqp.data);
  const h = db.select().from(t.healthConstraints).where(eq(t.healthConstraints.userId, userId)).get();
  if (h) p.health = obj(h.data);
  const n = db.select().from(t.nutritionPreferences).where(eq(t.nutritionPreferences.userId, userId)).get();
  if (n) p.nutrition = { ...obj(n.data), mode: n.mode === "none" && obj(n.data).mode === "recommend" ? "recommend" : n.mode };
  // latest recorded body weight wins over onboarding weight
  const lastWeight = db.select({ w: t.bodyMeasurements.weightKg }).from(t.bodyMeasurements)
    .where(and(eq(t.bodyMeasurements.userId, userId))).orderBy(desc(t.bodyMeasurements.date), desc(t.bodyMeasurements.createdAt)).all()
    .find((r) => r.w != null);
  if (lastWeight?.w) p.personal.weightKg = lastWeight.w;
  return p;
}

/** Persist the full profile back into its section tables. */
export function saveProfile(db: DB, userId: string, p: ProfileData) {
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(t.userProfiles).values({ userId, personal: p.personal, lifestyle: p.lifestyle, aiPreferences: p.ai, updatedAt: now })
      .onConflictDoUpdate({ target: t.userProfiles.userId, set: { personal: p.personal, lifestyle: p.lifestyle, aiPreferences: p.ai, updatedAt: now } }).run();
    tx.insert(t.fitnessGoals).values({ userId, data: p.goals, updatedAt: now })
      .onConflictDoUpdate({ target: t.fitnessGoals.userId, set: { data: p.goals, updatedAt: now } }).run();
    const tpd = { experience: p.experience, training: p.training, preferences: p.preferences };
    tx.insert(t.trainingPreferences).values({ userId, data: tpd, updatedAt: now })
      .onConflictDoUpdate({ target: t.trainingPreferences.userId, set: { data: tpd, updatedAt: now } }).run();
    tx.insert(t.equipmentProfiles).values({ userId, data: p.equipment, updatedAt: now })
      .onConflictDoUpdate({ target: t.equipmentProfiles.userId, set: { data: p.equipment, updatedAt: now } }).run();
    const flags = deriveSafetyFlags(p);
    tx.insert(t.healthConstraints).values({ userId, data: p.health, safetyFlags: flags, updatedAt: now })
      .onConflictDoUpdate({ target: t.healthConstraints.userId, set: { data: p.health, safetyFlags: flags, updatedAt: now } }).run();
    const mode = p.nutrition.mode === "recommend" || !p.nutrition.mode ? "none" : p.nutrition.mode;
    tx.insert(t.nutritionPreferences).values({ userId, mode, data: p.nutrition, updatedAt: now })
      .onConflictDoUpdate({ target: t.nutritionPreferences.userId, set: { mode, data: p.nutrition, updatedAt: now } }).run();
  });
}

export function getAnswers(db: DB, userId: string): Answers {
  const rows = db.select().from(t.onboardingAnswers).where(eq(t.onboardingAnswers.userId, userId)).all();
  return Object.fromEntries(rows.map((r) => [r.questionId, r.value]));
}

export function getOnboardingState(db: DB, userId: string) {
  const prog = db.select().from(t.onboardingProgress).where(eq(t.onboardingProgress.userId, userId)).get();
  const answers = getAnswers(db, userId);
  return { completed: !!prog?.completedAt, completedAt: prog?.completedAt ?? null, currentQuestionId: prog?.currentQuestionId ?? null, answers };
}

function stable(v: unknown) {
  return JSON.stringify(v ?? null);
}

/**
 * Validate and persist one answer. Updates the corresponding profile field
 * immediately (auto-save). After onboarding, significant changes flag the
 * active plan(s) for review instead of silently changing them.
 */
export function saveAnswer(db: DB, userId: string, questionId: string, raw: unknown, opts: { nextQuestionId?: string | null } = {}) {
  const q = QUESTION_BY_ID.get(questionId);
  if (!q) throw new AppError("unknown_question", "سؤال نامعتبر است.");
  const res = validateAnswer(q, raw);
  if (!res.ok) throw new AppError("invalid_answer", res.error);
  const state = getOnboardingState(db, userId);
  const prev = state.answers[questionId];
  const profile = getProfile(db, userId);
  setPath(profile, q.field, res.value);
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(t.onboardingAnswers).values({ userId, questionId, value: res.value as never, updatedAt: now })
      .onConflictDoUpdate({ target: [t.onboardingAnswers.userId, t.onboardingAnswers.questionId], set: { value: res.value as never, updatedAt: now } }).run();
    tx.insert(t.onboardingProgress).values({ userId, currentQuestionId: opts.nextQuestionId ?? questionId, updatedAt: now })
      .onConflictDoUpdate({ target: t.onboardingProgress.userId, set: { currentQuestionId: opts.nextQuestionId ?? questionId, updatedAt: now } }).run();
  });
  saveProfile(db, userId, profile);
  if (state.completed && q.affects?.length && stable(prev) !== stable(res.value)) {
    flagPlanReview(db, userId, q.affects, [questionId]);
  }
  if (questionId === "weight" && typeof res.value === "number") {
    recordWeight(db, userId, res.value, todayISO());
  }
  return res.value;
}

export function flagPlanReview(db: DB, userId: string, domains: ("workout" | "nutrition")[], fields: string[]) {
  const up = db.select().from(t.userProfiles).where(eq(t.userProfiles.userId, userId)).get();
  const cur = obj(up?.pendingPlanReview);
  const merged = {
    domains: [...new Set([...((cur.domains as string[]) ?? []), ...domains])],
    fields: [...new Set([...((cur.fields as string[]) ?? []), ...fields])],
    since: (cur.since as number) ?? Date.now(),
  };
  db.update(t.userProfiles).set({ pendingPlanReview: merged }).where(eq(t.userProfiles.userId, userId)).run();
}

export function clearPlanReview(db: DB, userId: string) {
  db.update(t.userProfiles).set({ pendingPlanReview: null }).where(eq(t.userProfiles.userId, userId)).run();
}

export function getPlanReview(db: DB, userId: string): { domains: string[]; fields: string[]; since: number } | null {
  const up = db.select({ v: t.userProfiles.pendingPlanReview }).from(t.userProfiles).where(eq(t.userProfiles.userId, userId)).get();
  return (up?.v as never) ?? null;
}

export function recordWeight(db: DB, userId: string, weightKg: number, date: string) {
  const existing = db.select().from(t.bodyMeasurements).where(and(eq(t.bodyMeasurements.userId, userId), eq(t.bodyMeasurements.date, date))).get();
  if (existing) db.update(t.bodyMeasurements).set({ weightKg }).where(eq(t.bodyMeasurements.id, existing.id)).run();
  else db.insert(t.bodyMeasurements).values({ id: newId(), userId, date, weightKg }).run();
}

/** Missing required visible questions. */
export function missingRequired(answers: Answers) {
  return visibleQuestions(answers).filter((q) => !q.optional && (answers[q.id] === undefined || answers[q.id] === null));
}

/** Resolve "recommend me" nutrition choice into a concrete mode. */
export function resolveNutritionMode(p: ProfileData): "none" | "full" | "guidance" {
  const m = p.nutrition.mode;
  if (m === "recommend") return ["fat_loss", "muscle_gain", "recomp"].includes(p.goals.primary ?? "") ? "full" : "guidance";
  return m ?? "none";
}

export function completeOnboarding(db: DB, userId: string) {
  const state = getOnboardingState(db, userId);
  const missing = missingRequired(state.answers);
  if (missing.length) throw new AppError("onboarding_incomplete", "برخی سؤال‌های ضروری پاسخ داده نشده‌اند.", 400, { missing: missing.map((q) => q.id) });
  const profile = getProfile(db, userId);
  const recommended = state.answers["nutrition_mode"] === "recommend";
  profile.nutrition.mode = resolveNutritionMode({ ...profile, nutrition: { ...profile.nutrition, mode: state.answers["nutrition_mode"] as never } });
  if (!profile.preferences.cycleWeeks) profile.preferences.cycleWeeks = "4";
  saveProfile(db, userId, profile);
  if (profile.personal.waistCm) {
    const today = todayISO();
    const row = db.select().from(t.bodyMeasurements).where(and(eq(t.bodyMeasurements.userId, userId), eq(t.bodyMeasurements.date, today))).get();
    if (row) db.update(t.bodyMeasurements).set({ waistCm: profile.personal.waistCm }).where(eq(t.bodyMeasurements.id, row.id)).run();
  }
  db.insert(t.onboardingProgress).values({ userId, completedAt: Date.now(), currentQuestionId: null })
    .onConflictDoUpdate({ target: t.onboardingProgress.userId, set: { completedAt: Date.now(), currentQuestionId: null } }).run();
  return { nutritionMode: profile.nutrition.mode, recommended };
}

/** Questions grouped by category for the profile editor. */
export function profileEditorModel(db: DB, userId: string) {
  const answers = getAnswers(db, userId);
  return QUESTIONS.filter((q) => q.type !== "photo").map((q) => ({ id: q.id, category: q.category, visible: !q.when || q.when(answers), value: answers[q.id] ?? null }));
}
