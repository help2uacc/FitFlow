import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, setDbForTests, type DB } from "@/db/client";
import * as t from "@/db/schema";
import { ensureCatalogSeeded } from "@/domain/catalog/seed";
import { registerUser } from "@/domain/auth/service";
import { QUESTIONS, visibleQuestions, type Answers } from "@/domain/onboarding/questions";
import { completeOnboarding, saveAnswer, getAnswers } from "@/domain/profile/service";
import { MockAIProvider } from "@/domain/ai/mock-provider";
import { AiEngine } from "@/domain/ai/engine";
import { JobRunner } from "@/worker/runner";

export function createTestDb() {
  const conn = openDatabase(":memory:");
  runMigrations(conn.db);
  ensureCatalogSeeded(conn.db);
  setDbForTests(conn);
  return conn.db;
}

export async function createUser(db: DB, email = "owner@example.com") {
  return registerUser(db, { email, displayName: "Test User", password: "StrongPass123" }, false);
}

export const DEFAULT_ANSWERS: Answers = {
  birth_year: 1993, sex: "male", height: 178, weight: 82, bodyfat_known: false, desired_shape: "lean_athletic", improve_areas: ["chest", "abs"],
  recent_weight_change: "stable", waist: 88, photo: null, primary_goal: "recomp", secondary_goals: ["strength"], goal_priority: null,
  muscle_priorities: ["chest"], strength_lifts: ["bench"], target_weight: 78, timeframe: "12", physique_reference: null,
  experience: "1", activity_level: "light", previous_types: ["gym"], level: "intermediate", resistance_familiarity: "basic", pushups: "15",
  lifts_known: false, successful_methods: null, disliked_exercises: null, adherence_issues: ["time"],
  red_flags: ["none"], conditions: ["none"], injuries: ["none"], current_pain: ["none"], movement_restrictions: null, medications: null,
  location: "gym", days_per_week: "3", preferred_days: ["6", "1", "3"], session_minutes: 60, workout_time: "afternoon", intensity_pref: "moderate",
  training_style: "ai", cardio_prefs: ["walking"], occupation: "desk", daily_steps: "6000", sleep_hours: 7, sleep_quality: "fair", stress: "moderate",
  food_habits: "home", hydration: "mid", motivation: ["time"], split_pref: "ai", machines_vs_free: "mixed", difficulty_pref: 3, tracking_pref: "standard",
  review_frequency: "4", nutrition_mode: "none",
  nutrition_goal: "auto", meals_per_day: "4", wake_time: "07:00", bed_time: "23:30", appetite: "normal", favorite_foods: ["rice", "chicken"], disliked_foods: null,
  allergies: ["none"], diet_restrictions: ["none"], cuisine: "iranian", region: "IR", budget: "medium", cooking_time: "30", meal_prep: true, eat_out: "2",
  fast_food: "rare", sweets: "moderate", night_eating: false, supplements: ["none"], digestive: ["none"], measurement_pref: "household", flexibility: "balanced", treats: null,
};

/** Answer every visible question (in order, like the wizard) then complete onboarding. */
export function completeOnboardingFor(db: DB, userId: string, overrides: Answers = {}) {
  const answers = { ...DEFAULT_ANSWERS, ...overrides };
  for (let guard = 0; guard < 200; guard++) {
    const current = getAnswers(db, userId);
    const q = visibleQuestions(current).find((x) => !(x.id in current));
    if (!q) break;
    const v = q.id in answers ? answers[q.id] : null;
    saveAnswer(db, userId, q.id, v === undefined ? null : v);
  }
  return completeOnboarding(db, userId);
}

export function makeRunner(db: DB) {
  const provider = new MockAIProvider(() => {
    const row = db.select().from(t.appSettings).where(eq(t.appSettings.key, "mock_ai_mode")).get();
    return typeof row?.value === "string" ? row.value : "ok";
  });
  const engine = new AiEngine(provider, { timeoutMs: 2000, maxRepairs: 1 });
  return new JobRunner(db, engine, provider, { ai: 1, pdf: 1, system: 1 }, 50);
}

export function setMockMode(db: DB, mode: string) {
  db.insert(t.appSettings).values({ key: "mock_ai_mode", value: mode }).onConflictDoUpdate({ target: t.appSettings.key, set: { value: mode } }).run();
}

export const cid = (p = "c") => `${p}-${Math.random().toString(36).slice(2, 12)}`;
export { QUESTIONS };
