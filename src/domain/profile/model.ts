/**
 * Canonical in-memory profile model assembled from the profile tables.
 * Sections are stored as JSON and parsed leniently: unknown keys are kept,
 * known keys are type-coerced.
 */
import { normalizeBirthYear } from "@/domain/onboarding/validate";

export interface ProfileData {
  personal: {
    birthYear?: number; sex?: "male" | "female"; heightCm?: number; weightKg?: number; bodyFatKnown?: boolean; bodyFatPct?: number | null;
    desiredShape?: string; improveAreas?: string[]; recentWeightChange?: string; waistCm?: number | null; hasPhoto?: boolean | null;
  };
  goals: {
    primary?: string; secondary?: string[]; priorityOrder?: string[]; musclePriorities?: string[]; strengthFocus?: string[];
    enduranceGoal?: string; targetWeightKg?: number | null; timeframeWeeks?: string; reference?: string | null;
  };
  experience: {
    years?: string; activityLevel?: string; previousTypes?: string[]; level?: "beginner" | "intermediate" | "advanced";
    resistanceFamiliarity?: string; maxPushups?: string; knowsLifts?: boolean; benchKg?: number | null; squatKg?: number | null; deadliftKg?: number | null;
    successfulMethods?: string | null; dislikedExercises?: string | null; adherenceIssues?: string[];
  };
  health: {
    redFlags?: string[]; conditions?: string[]; injuries?: string[]; currentPain?: string[]; surgeries?: string | null;
    restrictions?: string | null; medications?: string | null;
  };
  training: {
    location?: string; daysPerWeek?: string; preferredDays?: string[]; sessionMinutes?: number; preferredTime?: string;
    intensity?: string; style?: string; cardioPrefs?: string[];
  };
  equipment: { items?: string[] };
  lifestyle: {
    occupation?: string; dailySteps?: string; sleepHours?: number; sleepQuality?: string; stress?: string; foodHabits?: string; hydration?: string; challenges?: string[];
  };
  preferences: { split?: string; machinesVsFree?: string; difficulty?: number; tracking?: string; cycleWeeks?: string };
  nutrition: {
    mode?: "none" | "full" | "guidance" | "recommend"; goal?: string; mealsPerDay?: string; wakeTime?: string; bedTime?: string; appetite?: string;
    favorites?: string[]; dislikes?: string | null; allergies?: string[]; restrictions?: string[]; cuisine?: string; region?: string; budget?: string;
    cookingMinutes?: string; mealPrep?: boolean; eatOut?: string; fastFood?: string; sweets?: string; nightEating?: boolean; supplements?: string[];
    digestive?: string[]; measurement?: string; flexibility?: string; treats?: string | null;
    /** Explicit calorie override set by the user via "Adjust my calories". */
    calorieOverride?: number | null;
    proteinPreference?: "normal" | "high" | null;
  };
  ai: { notes?: string | null };
}

export const SECTIONS = ["personal", "goals", "experience", "health", "training", "equipment", "lifestyle", "preferences", "nutrition", "ai"] as const;
export type SectionId = (typeof SECTIONS)[number];

export function emptyProfile(): ProfileData {
  return { personal: {}, goals: {}, experience: {}, health: {}, training: {}, equipment: {}, lifestyle: {}, preferences: {}, nutrition: {}, ai: {} };
}

export const FULL_GYM_EQUIPMENT = ["barbell", "dumbbell", "bench", "machine", "cable", "pullup_bar", "dip_bar", "kettlebell", "bands", "cardio_machine", "ezbar", "box"];

export function ageOf(p: ProfileData, now = new Date()): number | null {
  if (!p.personal.birthYear) return null;
  return now.getFullYear() - normalizeBirthYear(p.personal.birthYear);
}

/** Equipment the user can actually use (bodyweight is always available). */
export function availableEquipment(p: ProfileData): string[] {
  const base = p.training.location === "gym" ? FULL_GYM_EQUIPMENT : (p.equipment.items ?? []);
  return [...new Set(["bodyweight", ...base])];
}

export interface SafetyFlags {
  /** Joint-stress tags to avoid entirely (current pain). */
  avoidStress: string[];
  /** Joint-stress tags to use cautiously (previous injuries). */
  cautionStress: string[];
  /** Serious warning signs reported → require medical clearance messaging, cap intensity. */
  redFlags: string[];
  avoidHighImpact: boolean;
  capIntensity: boolean;
}

const JOINT_TO_STRESS: Record<string, string[]> = {
  shoulder: ["shoulder"], knee: ["knee"], lower_back: ["lower_back"], wrist: ["wrist"], elbow: ["elbow"], hip: ["hip"], ankle: ["high_impact"], neck: [],
};

/** Deterministic safety flags derived from the health section. */
export function deriveSafetyFlags(p: ProfileData): SafetyFlags {
  const clean = (xs?: string[]) => (xs ?? []).filter((x) => x !== "none");
  const pain = clean(p.health.currentPain);
  const injuries = clean(p.health.injuries);
  const redFlags = clean(p.health.redFlags);
  const conditions = clean(p.health.conditions);
  const avoidStress = [...new Set(pain.flatMap((j) => JOINT_TO_STRESS[j] ?? []))];
  const cautionStress = [...new Set(injuries.flatMap((j) => JOINT_TO_STRESS[j] ?? []))].filter((s) => !avoidStress.includes(s));
  const avoidHighImpact = pain.includes("knee") || pain.includes("ankle") || conditions.includes("pregnancy") || (p.personal.weightKg ?? 0) > 130;
  const capIntensity = redFlags.length > 0 || conditions.includes("heart") || conditions.includes("pregnancy");
  return { avoidStress, cautionStress, redFlags, avoidHighImpact, capIntensity };
}

export function nutritionEnabled(p: ProfileData) {
  return p.nutrition.mode === "full" || p.nutrition.mode === "recommend";
}

export function setPath(p: ProfileData, field: string, value: unknown) {
  const [section, key] = field.split(".") as [SectionId, string];
  (p[section] as Record<string, unknown>)[key] = value;
}
