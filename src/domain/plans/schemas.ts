/**
 * Structured contracts between the AI engine and the application.
 * AI outputs are validated by these Zod schemas (and exported as JSON Schema
 * for `codex exec --output-schema`). All fields are required (nullable where
 * optional) to satisfy strict structured-output mode.
 */
import { z } from "zod";

const str = (max = 600) => z.string().max(max);
const strList = (maxItems = 12, max = 400) => z.array(z.string().max(max)).max(maxItems);

export const AiPrescription = z.object({
  exerciseId: z.string().max(120),
  sets: z.number().int().min(1).max(8),
  unit: z.enum(["reps", "seconds", "minutes"]),
  repMin: z.number().int().min(1).max(90),
  repMax: z.number().int().min(1).max(120),
  restSec: z.number().int().min(0).max(600),
  targetRir: z.number().int().min(0).max(5).nullable(),
  loadGuidance: str(300),
  notes: str(300),
  alternatives: z.array(z.string().max(120)).max(4),
});
export type AiPrescription = z.infer<typeof AiPrescription>;

export const AiSession = z.object({
  key: z.string().max(40),
  dayOfWeek: z.number().int().min(0).max(6),
  title: str(80),
  focus: strList(6, 40),
  estimatedMinutes: z.number().int().min(10).max(180),
  warmup: strList(8, 200),
  cooldown: strList(6, 200),
  exercises: z.array(AiPrescription).min(1).max(12),
});
export type AiSession = z.infer<typeof AiSession>;

export const ChangeSummary = z.object({
  kept: strList(8),
  changed: strList(10),
  reasons: strList(10),
  targets: strList(8),
});

export const AiWorkoutPlan = z.object({
  title: str(100),
  objective: str(400),
  split: str(80),
  durationWeeks: z.number().int().min(4).max(6),
  difficulty: z.number().int().min(1).max(5),
  sessions: z.array(AiSession).min(1).max(7),
  progressionRules: strList(8),
  recoveryGuidance: strList(8),
  intensityGuidance: str(400),
  safetyNotes: strList(6),
  changeSummary: ChangeSummary,
  coachMessage: str(800),
});
export type AiWorkoutPlan = z.infer<typeof AiWorkoutPlan>;
/** Stored workout plan = validated AI plan (may later be transformed deterministically). */
export type WorkoutPlan = AiWorkoutPlan;

export const MEAL_SLOTS = ["breakfast", "snack_am", "lunch", "snack_pm", "pre_workout", "post_workout", "dinner", "snack_night"] as const;
export const MealSlot = z.enum(MEAL_SLOTS);
export const MEAL_SLOT_FA: Record<(typeof MEAL_SLOTS)[number], string> = {
  breakfast: "صبحانه", snack_am: "میان‌وعده صبح", lunch: "ناهار", snack_pm: "میان‌وعده عصر",
  pre_workout: "قبل از تمرین", post_workout: "بعد از تمرین", dinner: "شام", snack_night: "میان‌وعده شب",
};

export const AiMealItem = z.object({ foodId: z.string().max(80), grams: z.number().min(1).max(1500) });
export const AiMeal = z.object({
  slot: MealSlot,
  title: str(100),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  items: z.array(AiMealItem).min(1).max(10),
  prepMinutes: z.number().int().min(0).max(240),
  instructions: str(600),
});
export const AiNutritionDay = z.object({ dayOfWeek: z.number().int().min(0).max(6), meals: z.array(AiMeal).min(1).max(8) });
export const AiNutritionPlan = z.object({
  title: str(100),
  days: z.array(AiNutritionDay).length(7),
  alternatives: z.array(z.object({ slot: MealSlot, title: str(100), items: z.array(AiMealItem).min(1).max(10) })).max(16),
  hydrationGuidance: str(400),
  rationale: strList(8),
  changeSummary: ChangeSummary,
  coachMessage: str(800),
});
export type AiNutritionPlan = z.infer<typeof AiNutritionPlan>;
export type AiMeal = z.infer<typeof AiMeal>;

/** Stored nutrition plan: AI meal selection + deterministic nutrient totals. */
export interface MealItemComputed { foodId: string; grams: number; nameFa: string; serving: string; kcal: number; proteinG: number; carbsG: number; fatG: number }
export interface MealComputed { slot: string; title: string; time: string; prepMinutes: number; instructions: string; items: MealItemComputed[]; totals: { kcal: number; proteinG: number; carbsG: number; fatG: number } }
export interface DayComputed { dayOfWeek: number; meals: MealComputed[]; totals: { kcal: number; proteinG: number; carbsG: number; fatG: number } }
export interface NutritionPlan {
  title: string;
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number; bmr: number; tdee: number; waterMl: number; assumptions: string[]; method: string; floorKcal: number; ceilingKcal: number };
  days: DayComputed[];
  alternatives: { slot: string; title: string; items: MealItemComputed[]; totals: { kcal: number; proteinG: number; carbsG: number; fatG: number } }[];
  groceryList: { foodId: string; nameFa: string; category: string; grams: number; label: string }[];
  hydrationGuidance: string;
  rationale: string[];
  changeSummary: z.infer<typeof ChangeSummary>;
  coachMessage: string;
}

/** Natural-language request → controlled action schema. */
export const COACH_INTENTS = [
  "adjust_calories", "adjust_macros", "replace_meal", "adjust_workout_intensity", "adjust_workout_frequency",
  "adjust_session_duration", "replace_exercise", "change_goal", "analyze_progress", "generate_next_cycle", "explain_plan", "unsupported",
] as const;
export const CoachIntent = z.object({
  intent: z.enum(COACH_INTENTS),
  confidence: z.number().min(0).max(1),
  params: z.object({
    calorieDelta: z.number().int().min(-1000).max(1000).nullable(),
    calorieTarget: z.number().int().min(800).max(6000).nullable(),
    proteinChange: z.enum(["increase", "decrease", "keep"]).nullable(),
    difficultyDelta: z.number().int().min(-2).max(2).nullable(),
    daysPerWeek: z.number().int().min(1).max(7).nullable(),
    sessionMinutes: z.number().int().min(15).max(180).nullable(),
    muscleFocus: z.array(z.string().max(40)).max(4).nullable(),
    exerciseId: z.string().max(120).nullable(),
    mealSlot: MealSlot.nullable(),
    goal: z.string().max(40).nullable(),
    scope: z.enum(["today", "plan"]).nullable(),
    notes: z.string().max(400).nullable(),
  }),
  reply: str(1200),
});
export type CoachIntent = z.infer<typeof CoachIntent>;

export const ProgressAnalysis = z.object({
  summary: str(800),
  wins: strList(6),
  concerns: strList(6),
  recommendations: z.array(z.object({
    title: str(120), detail: str(400),
    action: z.enum(["none", "increase_difficulty", "decrease_difficulty", "increase_calories", "decrease_calories", "deload", "next_cycle", "keep"]),
  })).max(6),
  dataQuality: z.enum(["insufficient", "limited", "good"]),
});
export type ProgressAnalysis = z.infer<typeof ProgressAnalysis>;

/** Convert a Zod schema to a strict JSON Schema accepted by structured-output mode. */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete js.$schema;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties) {
      n.additionalProperties = false;
      n.required = Object.keys(n.properties as object);
    }
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  };
  walk(js);
  return js;
}
