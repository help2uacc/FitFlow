/**
 * FitFlow database schema (SQLite via Drizzle ORM).
 *
 * Conventions:
 *  - Primary keys are text UUIDs (stable IDs).
 *  - Timestamps are integer epoch milliseconds (`*_at`).
 *  - Calendar days are ISO `YYYY-MM-DD` strings in the user's local time zone.
 *  - Every user-owned row carries `user_id` even in the single-user deployment.
 *  - Published plan versions are immutable; revisions create new rows.
 */
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () => integer("created_at").notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = () => integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`);
const userId = () => text("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

// ---------------------------------------------------------------- identity
export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "user"] }).notNull().default("user"),
  timezone: text("timezone").notNull().default("Asia/Tehran"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const sessions = sqliteTable("sessions", {
  id: id(), // sha256(token) — raw token only ever lives in the cookie
  userId: userId(),
  createdAt: createdAt(),
  expiresAt: integer("expires_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  remember: integer("remember", { mode: "boolean" }).notNull().default(false),
  userAgent: text("user_agent"),
  ip: text("ip"),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

/** Single-use registration invites. `id` is sha256(token); the raw token only lives in the link. */
export const invites = sqliteTable("invites", {
  id: id(),
  createdBy: userId(),
  createdAt: createdAt(),
  expiresAt: integer("expires_at").notNull(),
  usedBy: text("used_by").references(() => users.id, { onDelete: "set null" }),
  usedAt: integer("used_at"),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- profile
/** Personal + lifestyle + AI preferences sections (validated JSON per section). */
export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  personal: text("personal", { mode: "json" }).notNull().default(sql`'{}'`),
  lifestyle: text("lifestyle", { mode: "json" }).notNull().default(sql`'{}'`),
  aiPreferences: text("ai_preferences", { mode: "json" }).notNull().default(sql`'{}'`),
  /** Set when a significant profile change may require a plan update. */
  pendingPlanReview: text("pending_plan_review", { mode: "json" }),
  updatedAt: updatedAt(),
});

export const fitnessGoals = sqliteTable("fitness_goals", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().default(sql`'{}'`),
  updatedAt: updatedAt(),
});

export const trainingPreferences = sqliteTable("training_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().default(sql`'{}'`),
  updatedAt: updatedAt(),
});

export const equipmentProfiles = sqliteTable("equipment_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().default(sql`'{}'`),
  updatedAt: updatedAt(),
});

export const healthConstraints = sqliteTable("health_constraints", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).notNull().default(sql`'{}'`),
  /** Derived deterministic safety flags (joint stress tags to avoid, red flags). */
  safetyFlags: text("safety_flags", { mode: "json" }).notNull().default(sql`'{}'`),
  updatedAt: updatedAt(),
});

export const nutritionPreferences = sqliteTable("nutrition_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode", { enum: ["none", "full", "guidance"] }).notNull().default("none"),
  data: text("data", { mode: "json" }).notNull().default(sql`'{}'`),
  updatedAt: updatedAt(),
});

export const bodyMeasurements = sqliteTable("body_measurements", {
  id: id(),
  userId: userId(),
  date: text("date").notNull(),
  weightKg: real("weight_kg"),
  bodyFatPct: real("body_fat_pct"),
  waistCm: real("waist_cm"),
  chestCm: real("chest_cm"),
  armCm: real("arm_cm"),
  hipCm: real("hip_cm"),
  thighCm: real("thigh_cm"),
  energy: integer("energy"), // 1..5 subjective
  notes: text("notes"),
  clientId: text("client_id"),
  createdAt: createdAt(),
}, (t) => [index("body_meas_user_date_idx").on(t.userId, t.date), uniqueIndex("body_meas_client_uq").on(t.userId, t.clientId)]);

export const onboardingAnswers = sqliteTable("onboarding_answers", {
  userId: userId(),
  questionId: text("question_id").notNull(),
  /** null = optional question explicitly skipped */
  value: text("value", { mode: "json" }),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("onb_answers_pk").on(t.userId, t.questionId)]);

export const onboardingProgress = sqliteTable("onboarding_progress", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  currentQuestionId: text("current_question_id"),
  completedAt: integer("completed_at"),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------- exercise catalog
export const exercises = sqliteTable("exercises", {
  id: id(),
  nameFa: text("name_fa").notNull(),
  nameEn: text("name_en").notNull(),
  pattern: text("pattern").notNull(),
  category: text("category").notNull(),
  level: text("level").notNull(),
  mechanic: text("mechanic"),
  equipment: text("equipment", { mode: "json" }).$type<string[]>().notNull(),
  stress: text("stress", { mode: "json" }).$type<string[]>().notNull(),
  primaryMuscles: text("primary_muscles", { mode: "json" }).$type<string[]>().notNull(),
  secondaryMuscles: text("secondary_muscles", { mode: "json" }).$type<string[]>().notNull(),
  instructionsEn: text("instructions_en", { mode: "json" }).$type<string[]>().notNull(),
  cuesFa: text("cues_fa", { mode: "json" }).$type<string[]>().notNull(),
  mistakesFa: text("mistakes_fa", { mode: "json" }).$type<string[]>().notNull(),
  safetyFa: text("safety_fa"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastValidatedAt: text("last_validated_at"),
  createdAt: createdAt(),
}, (t) => [index("exercises_pattern_idx").on(t.pattern)]);

export const exerciseMedia = sqliteTable("exercise_media", {
  id: id(),
  exerciseId: text("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["image", "gif", "video", "illustration"] }).notNull(),
  /** Same-origin path when the asset is stored locally (licensed for embedding). */
  localPath: text("local_path"),
  url: text("url").notNull(),
  license: text("license").notNull(),
  embeddable: integer("embeddable", { mode: "boolean" }).notNull().default(false),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  verifiedAt: text("verified_at"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("exercise_media_ex_idx").on(t.exerciseId)]);

export const exerciseSources = sqliteTable("exercise_sources", {
  id: id(),
  exerciseId: text("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["reference", "video", "video_search", "dataset"] }).notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  attribution: text("attribution").notNull(),
  license: text("license"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  verifiedAt: text("verified_at"),
}, (t) => [index("exercise_sources_ex_idx").on(t.exerciseId)]);

export const exerciseAlternatives = sqliteTable("exercise_alternatives", {
  exerciseId: text("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
  alternativeId: text("alternative_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
  score: real("score").notNull(),
}, (t) => [uniqueIndex("exercise_alt_pk").on(t.exerciseId, t.alternativeId)]);

// ---------------------------------------------------------------- training
export const programCycles = sqliteTable("program_cycles", {
  id: id(),
  userId: userId(),
  cycleNumber: integer("cycle_number").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reviewDate: text("review_date").notNull(),
  status: text("status", { enum: ["draft", "active", "completed", "expired", "superseded", "archived"] }).notNull(),
  createdAt: createdAt(),
  completedAt: integer("completed_at"),
}, (t) => [index("cycles_user_idx").on(t.userId, t.status)]);

export const workoutPlanVersions = sqliteTable("workout_plan_versions", {
  id: id(),
  userId: userId(),
  cycleId: text("cycle_id").notNull().references(() => programCycles.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: text("status", { enum: ["draft", "active", "superseded", "archived", "rejected"] }).notNull(),
  revisionReason: text("revision_reason").notNull(),
  previousVersionId: text("previous_version_id"),
  plan: text("plan", { mode: "json" }).notNull(),
  profileSnapshot: text("profile_snapshot", { mode: "json" }).notNull(),
  aiJobId: text("ai_job_id"),
  createdAt: createdAt(),
  activatedAt: integer("activated_at"),
}, (t) => [index("wpv_user_status_idx").on(t.userId, t.status), index("wpv_cycle_idx").on(t.cycleId)]);

/** Materialised session templates of a plan version (referenced by logs). */
export const workoutSessions = sqliteTable("workout_sessions", {
  id: id(),
  userId: userId(),
  planVersionId: text("plan_version_id").notNull().references(() => workoutPlanVersions.id, { onDelete: "cascade" }),
  sessionKey: text("session_key").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday … 6=Saturday
  title: text("title").notNull(),
  focus: text("focus", { mode: "json" }).$type<string[]>().notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (t) => [index("ws_version_idx").on(t.planVersionId)]);

export const workoutExercises = sqliteTable("workout_exercises", {
  id: id(),
  sessionId: text("session_id").notNull().references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id").notNull().references(() => exercises.id),
  slotKey: text("slot_key").notNull(),
  sortOrder: integer("sort_order").notNull(),
  sets: integer("sets").notNull(),
  repMin: integer("rep_min").notNull(),
  repMax: integer("rep_max").notNull(),
  restSec: integer("rest_sec").notNull(),
  targetRir: integer("target_rir"),
}, (t) => [index("we_session_idx").on(t.sessionId)]);

export const prescribedSets = sqliteTable("prescribed_sets", {
  id: id(),
  workoutExerciseId: text("workout_exercise_id").notNull().references(() => workoutExercises.id, { onDelete: "cascade" }),
  setIndex: integer("set_index").notNull(),
  repMin: integer("rep_min").notNull(),
  repMax: integer("rep_max").notNull(),
  targetRir: integer("target_rir"),
});

export const completedWorkouts = sqliteTable("completed_workouts", {
  id: id(),
  userId: userId(),
  clientId: text("client_id").notNull(),
  planVersionId: text("plan_version_id"),
  workoutSessionId: text("workout_session_id"),
  title: text("title").notNull(),
  date: text("date").notNull(),
  status: text("status", { enum: ["in_progress", "paused", "completed", "missed", "skipped"] }).notNull(),
  unscheduled: integer("unscheduled", { mode: "boolean" }).notNull().default(false),
  startedAt: integer("started_at"),
  finishedAt: integer("finished_at"),
  durationSec: integer("duration_sec"),
  totalVolumeKg: real("total_volume_kg"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cw_client_uq").on(t.userId, t.clientId), index("cw_user_date_idx").on(t.userId, t.date)]);

export const completedSets = sqliteTable("completed_sets", {
  id: id(),
  userId: userId(),
  clientId: text("client_id").notNull(),
  completedWorkoutId: text("completed_workout_id").notNull().references(() => completedWorkouts.id, { onDelete: "cascade" }),
  workoutExerciseId: text("workout_exercise_id"),
  exerciseId: text("exercise_id").notNull().references(() => exercises.id),
  /** When the user swapped the exercise for this session only. */
  substitutedFromId: text("substituted_from_id"),
  setIndex: integer("set_index").notNull(),
  weightKg: real("weight_kg"),
  reps: integer("reps"),
  rpe: real("rpe"),
  rir: integer("rir"),
  status: text("status", { enum: ["done", "skipped"] }).notNull(),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("cs_client_uq").on(t.userId, t.clientId), index("cs_workout_idx").on(t.completedWorkoutId), index("cs_user_ex_idx").on(t.userId, t.exerciseId)]);

export const workoutFeedback = sqliteTable("workout_feedback", {
  id: id(),
  userId: userId(),
  completedWorkoutId: text("completed_workout_id").notNull().references(() => completedWorkouts.id, { onDelete: "cascade" }),
  difficulty: integer("difficulty"), // 1..5
  energy: integer("energy"),
  pain: integer("pain", { mode: "boolean" }).notNull().default(false),
  painNotes: text("pain_notes"),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("wf_workout_uq").on(t.completedWorkoutId)]);

// ---------------------------------------------------------------- nutrition
export const foodSources = sqliteTable("food_sources", {
  id: id(),
  name: text("name").notNull(),
  url: text("url"),
  license: text("license").notNull(),
  notes: text("notes"),
});

export const foods = sqliteTable("foods", {
  id: id(),
  /** null = shared catalog food; set = user-defined food. */
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  nameFa: text("name_fa").notNull(),
  nameEn: text("name_en").notNull(),
  category: text("category").notNull(),
  state: text("state", { enum: ["raw", "cooked", "prepared", "na"] }).notNull().default("na"),
  servingG: real("serving_g").notNull(),
  servingLabel: text("serving_label").notNull(),
  kcal100: real("kcal_100").notNull(),
  protein100: real("protein_100").notNull(),
  carbs100: real("carbs_100").notNull(),
  fat100: real("fat_100").notNull(),
  fiber100: real("fiber_100"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  costLevel: integer("cost_level").notNull().default(2), // 1 cheap … 3 expensive
  sourceId: text("source_id").references(() => foodSources.id),
  confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("foods_user_idx").on(t.userId), index("foods_name_idx").on(t.nameFa)]);

export const recipes = sqliteTable("recipes", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  servings: real("servings").notNull().default(1),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const recipeIngredients = sqliteTable("recipe_ingredients", {
  id: id(),
  recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
  foodId: text("food_id").notNull().references(() => foods.id),
  grams: real("grams").notNull(),
});

export const nutritionPlanVersions = sqliteTable("nutrition_plan_versions", {
  id: id(),
  userId: userId(),
  cycleId: text("cycle_id").references(() => programCycles.id, { onDelete: "set null" }),
  version: integer("version").notNull(),
  status: text("status", { enum: ["draft", "active", "superseded", "archived", "rejected"] }).notNull(),
  revisionReason: text("revision_reason").notNull(),
  previousVersionId: text("previous_version_id"),
  targetKcal: integer("target_kcal").notNull(),
  proteinG: integer("protein_g").notNull(),
  carbsG: integer("carbs_g").notNull(),
  fatG: integer("fat_g").notNull(),
  plan: text("plan", { mode: "json" }).notNull(),
  profileSnapshot: text("profile_snapshot", { mode: "json" }).notNull(),
  aiJobId: text("ai_job_id"),
  createdAt: createdAt(),
  activatedAt: integer("activated_at"),
}, (t) => [index("npv_user_status_idx").on(t.userId, t.status)]);

export const plannedMeals = sqliteTable("planned_meals", {
  id: id(),
  userId: userId(),
  planVersionId: text("plan_version_id").notNull().references(() => nutritionPlanVersions.id, { onDelete: "cascade" }),
  dayIndex: integer("day_index").notNull(), // 0=Sunday … 6=Saturday (JS getDay)
  slot: text("slot").notNull(),
  title: text("title").notNull(),
  time: text("time"),
  sortOrder: integer("sort_order").notNull(),
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
}, (t) => [index("pm_version_day_idx").on(t.planVersionId, t.dayIndex)]);

export const plannedMealItems = sqliteTable("planned_meal_items", {
  id: id(),
  plannedMealId: text("planned_meal_id").notNull().references(() => plannedMeals.id, { onDelete: "cascade" }),
  foodId: text("food_id").notNull().references(() => foods.id),
  grams: real("grams").notNull(),
});

export const foodLogEntries = sqliteTable("food_log_entries", {
  id: id(),
  userId: userId(),
  clientId: text("client_id").notNull(),
  date: text("date").notNull(),
  mealSlot: text("meal_slot").notNull(),
  planVersionId: text("plan_version_id"),
  plannedMealId: text("planned_meal_id"),
  foodId: text("food_id").references(() => foods.id),
  recipeId: text("recipe_id").references(() => recipes.id),
  label: text("label").notNull(),
  grams: real("grams").notNull(),
  // nutrient snapshot at log time — immune to later food/plan edits
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  status: text("status", { enum: ["eaten", "partial", "skipped"] }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("fle_client_uq").on(t.userId, t.clientId), index("fle_user_date_idx").on(t.userId, t.date)]);

export const nutritionDailySummaries = sqliteTable("nutrition_daily_summaries", {
  userId: userId(),
  date: text("date").notNull(),
  planVersionId: text("plan_version_id"),
  targetKcal: integer("target_kcal"),
  targetProteinG: integer("target_protein_g"),
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g").notNull(),
  carbsG: real("carbs_g").notNull(),
  fatG: real("fat_g").notNull(),
  entries: integer("entries").notNull(),
  plannedMeals: integer("planned_meals").notNull().default(0),
  loggedMeals: integer("logged_meals").notNull().default(0),
  /** "complete" only when the user marked the day as fully logged. */
  completeness: text("completeness", { enum: ["none", "partial", "complete"] }).notNull(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("nds_pk").on(t.userId, t.date)]);

export const mealSubstitutions = sqliteTable("meal_substitutions", {
  id: id(),
  userId: userId(),
  planVersionId: text("plan_version_id").notNull().references(() => nutritionPlanVersions.id, { onDelete: "cascade" }),
  plannedMealId: text("planned_meal_id").notNull(),
  /** null → applied to every week (a new plan version was created instead). */
  date: text("date"),
  items: text("items", { mode: "json" }).notNull(),
  title: text("title").notNull(),
  createdAt: createdAt(),
}, (t) => [index("ms_user_date_idx").on(t.userId, t.date)]);

// ---------------------------------------------------------------- progress & AI
export const progressCheckins = sqliteTable("progress_checkins", {
  id: id(),
  userId: userId(),
  date: text("date").notNull(),
  workoutDifficulty: integer("workout_difficulty"),
  recovery: integer("recovery"),
  consistency: integer("consistency"),
  pain: integer("pain", { mode: "boolean" }),
  painNotes: text("pain_notes"),
  appetite: integer("appetite"),
  energy: integer("energy"),
  dietAdherence: integer("diet_adherence"),
  scheduleChanged: integer("schedule_changed", { mode: "boolean" }),
  notes: text("notes"),
  createdAt: createdAt(),
}, (t) => [index("checkins_user_date_idx").on(t.userId, t.date)]);

export const progressPhotos = sqliteTable("progress_photos", {
  id: id(),
  userId: userId(),
  date: text("date").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  pose: text("pose"),
  createdAt: createdAt(),
});

export const planAdjustmentRequests = sqliteTable("plan_adjustment_requests", {
  id: id(),
  userId: userId(),
  domain: text("domain", { enum: ["workout", "nutrition", "both"] }).notNull(),
  intent: text("intent").notNull(),
  source: text("source", { enum: ["controls", "coach", "profile_change", "renewal"] }).notNull(),
  rawText: text("raw_text"),
  params: text("params", { mode: "json" }).notNull(),
  status: text("status", { enum: ["previewed", "generating", "ready", "applied", "rejected", "failed", "cancelled"] }).notNull(),
  preview: text("preview", { mode: "json" }),
  resultVersionId: text("result_version_id"),
  aiJobId: text("ai_job_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("par_user_idx").on(t.userId, t.createdAt)]);

export const aiJobs = sqliteTable("ai_jobs", {
  id: id(),
  userId: userId(),
  type: text("type").notNull(),
  lane: text("lane", { enum: ["ai", "pdf", "system"] }).notNull().default("ai"),
  status: text("status", { enum: ["queued", "running", "validating", "completed", "failed", "cancelled"] }).notNull(),
  dedupeKey: text("dedupe_key"),
  input: text("input", { mode: "json" }).notNull(),
  result: text("result", { mode: "json" }),
  progressMessage: text("progress_message"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAfter: integer("run_after").notNull(),
  cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
  heartbeatAt: integer("heartbeat_at"),
  startedAt: integer("started_at"),
  finishedAt: integer("finished_at"),
  createdAt: createdAt(),
}, (t) => [index("jobs_status_idx").on(t.status, t.lane, t.runAfter), index("jobs_user_idx").on(t.userId, t.createdAt), index("jobs_dedupe_idx").on(t.userId, t.dedupeKey)]);

export const aiGenerationMetadata = sqliteTable("ai_generation_metadata", {
  id: id(),
  jobId: text("job_id").notNull().references(() => aiJobs.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerVersion: text("provider_version"),
  attempt: integer("attempt").notNull(),
  durationMs: integer("duration_ms").notNull(),
  promptChars: integer("prompt_chars").notNull(),
  promptSha256: text("prompt_sha256").notNull(),
  outputChars: integer("output_chars"),
  outcome: text("outcome").notNull(),
  validationErrors: text("validation_errors", { mode: "json" }),
  createdAt: createdAt(),
}, (t) => [index("agm_job_idx").on(t.jobId)]);

export const planChangeHistory = sqliteTable("plan_change_history", {
  id: id(),
  userId: userId(),
  domain: text("domain", { enum: ["workout", "nutrition"] }).notNull(),
  fromVersionId: text("from_version_id"),
  toVersionId: text("to_version_id").notNull(),
  summary: text("summary").notNull(),
  changes: text("changes", { mode: "json" }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("pch_user_idx").on(t.userId, t.createdAt)]);

export const notifications = sqliteTable("notifications", {
  id: id(),
  userId: userId(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  dedupeKey: text("dedupe_key"),
  readAt: integer("read_at"),
  pushedAt: integer("pushed_at"),
  createdAt: createdAt(),
}, (t) => [index("notif_user_idx").on(t.userId, t.createdAt), uniqueIndex("notif_dedupe_uq").on(t.userId, t.dedupeKey)]);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: id(),
  userId: userId(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("push_endpoint_uq").on(t.endpoint)]);

export const exportedReports = sqliteTable("exported_reports", {
  id: id(),
  userId: userId(),
  kind: text("kind", { enum: ["workout", "nutrition", "combined", "progress"] }).notNull(),
  status: text("status", { enum: ["queued", "ready", "failed"] }).notNull(),
  fileName: text("file_name"),
  sizeBytes: integer("size_bytes"),
  jobId: text("job_id"),
  params: text("params", { mode: "json" }).notNull(),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [index("reports_user_idx").on(t.userId, t.createdAt)]);

export const systemStatus = sqliteTable("system_status", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: updatedAt(),
});
