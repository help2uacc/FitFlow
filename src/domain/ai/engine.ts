/**
 * AI planning engine: builds prompts, calls the provider, validates outputs
 * against schemas + business rules, and runs a bounded repair loop when the
 * model returns something invalid. Nothing is published from here — callers
 * persist only validated results.
 */
import { createHash } from "node:crypto";
import type { z } from "zod";
import { CoachIntent, ProgressAnalysis, toStrictJsonSchema, AiWorkoutPlan, AiNutritionPlan, type NutritionPlan, type WorkoutPlan } from "@/domain/plans/schemas";
import { validateWorkoutPlan, type ValidationResult, type WorkoutConstraints } from "@/domain/plans/validate-workout";
import { validateAndBuildNutritionPlan, type FoodRow, type PlanTargets } from "@/domain/plans/nutrition-build";
import type { ProfileData } from "@/domain/profile/model";
import { PROMPTS } from "./prompts";
import { AiError, type AIProvider } from "./types";

export interface AttemptMeta {
  provider: string; providerVersion: string | null; attempt: number; durationMs: number; promptChars: number; promptSha256: string;
  outputChars: number | null; outcome: string; validationErrors: string[] | null;
}
export interface RunControl { jobId: string; signal?: AbortSignal; onProgress?: (msg: string, phase?: "running" | "validating") => void; onAttempt?: (m: AttemptMeta) => void }

const SCHEMA_CACHE = new Map<string, Record<string, unknown>>();
function jsonSchemaFor(name: string, s: z.ZodType) {
  if (!SCHEMA_CACHE.has(name)) SCHEMA_CACHE.set(name, toStrictJsonSchema(s));
  return SCHEMA_CACHE.get(name)!;
}

export class AiEngine {
  constructor(private provider: AIProvider, private opts: { timeoutMs: number; maxRepairs?: number }) {}

  get providerName() {
    return this.provider.name;
  }

  private async runValidated<T>(
    task: string, schemaName: string, schema: z.ZodType, basePrompt: string, context: Record<string, unknown>,
    validate: (raw: unknown) => ValidationResult<T>, ctl: RunControl,
  ): Promise<{ value: T; warnings: string[] }> {
    const maxRepairs = this.opts.maxRepairs ?? 1;
    let prompt = basePrompt;
    let lastErrors: string[] = [];
    for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
      const meta: AttemptMeta = {
        provider: this.provider.name, providerVersion: null, attempt, durationMs: 0, promptChars: prompt.length,
        promptSha256: createHash("sha256").update(prompt).digest("hex"), outputChars: null, outcome: "pending", validationErrors: null,
      };
      const t0 = Date.now();
      try {
        ctl.onProgress?.(attempt === 1 ? "در حال تولید برنامه با هوش مصنوعی…" : "در حال اصلاح خروجی هوش مصنوعی…", "running");
        const res = await this.provider.generate({
          jobId: ctl.jobId, task, prompt, schema, jsonSchema: jsonSchemaFor(schemaName, schema), context,
          timeoutMs: this.opts.timeoutMs, signal: ctl.signal, onProgress: (m) => ctl.onProgress?.(m, "running"),
        });
        meta.providerVersion = res.providerVersion;
        meta.outputChars = res.text.length;
        ctl.onProgress?.("در حال اعتبارسنجی برنامه…", "validating");
        const v = validate(res.raw);
        meta.durationMs = Date.now() - t0;
        if (v.ok && v.plan !== undefined) {
          meta.outcome = "valid";
          meta.validationErrors = v.warnings.length ? v.warnings : null;
          ctl.onAttempt?.(meta);
          return { value: v.plan, warnings: v.warnings };
        }
        lastErrors = v.errors;
        meta.outcome = "invalid";
        meta.validationErrors = v.errors;
        ctl.onAttempt?.(meta);
        prompt = `${basePrompt}\n\nYOUR PREVIOUS OUTPUT FAILED VALIDATION. Fix ALL of these problems and return the complete corrected JSON:\n- ${v.errors.slice(0, 20).join("\n- ")}\n`;
      } catch (e) {
        meta.durationMs = Date.now() - t0;
        meta.outcome = e instanceof AiError ? e.code : "error";
        ctl.onAttempt?.(meta);
        if (e instanceof AiError && e.code === "invalid_output" && attempt <= maxRepairs) {
          lastErrors = [e.message];
          prompt = `${basePrompt}\n\nYOUR PREVIOUS OUTPUT WAS NOT VALID JSON. Return only the JSON object.\n`;
          continue;
        }
        throw e;
      }
    }
    throw new AiError("invalid_output", "AI output failed validation: " + lastErrors.slice(0, 5).join("; "), false, { errors: lastErrors });
  }

  generateInitialProgram(context: Record<string, unknown>, constraints: WorkoutConstraints, ctl: RunControl) {
    return this.runValidated<WorkoutPlan>("initial_program", "workout", AiWorkoutPlan, PROMPTS.initialProgram(context), context, (raw) => validateWorkoutPlan(raw, constraints), ctl);
  }

  reviseWorkoutPlan(context: Record<string, unknown>, constraints: WorkoutConstraints, ctl: RunControl) {
    return this.runValidated<WorkoutPlan>("revise_workout", "workout", AiWorkoutPlan, PROMPTS.reviseWorkout(context), context, (raw) => validateWorkoutPlan(raw, constraints), ctl);
  }

  generateNextCycle(context: Record<string, unknown>, constraints: WorkoutConstraints, ctl: RunControl) {
    return this.runValidated<WorkoutPlan>("next_cycle", "workout", AiWorkoutPlan, PROMPTS.nextCycle(context), context, (raw) => validateWorkoutPlan(raw, constraints), ctl);
  }

  generateNutritionPlan(context: Record<string, unknown>, deps: { foods: FoodRow[]; profile: ProfileData; targets: PlanTargets }, ctl: RunControl) {
    return this.runValidated<NutritionPlan>("nutrition_plan", "nutrition", AiNutritionPlan, PROMPTS.nutritionPlan(context), context, (raw) => validateAndBuildNutritionPlan(raw, deps), ctl);
  }

  reviseNutritionPlan(context: Record<string, unknown>, deps: { foods: FoodRow[]; profile: ProfileData; targets: PlanTargets }, ctl: RunControl) {
    return this.runValidated<NutritionPlan>("revise_nutrition", "nutrition", AiNutritionPlan, PROMPTS.reviseNutrition(context), context, (raw) => validateAndBuildNutritionPlan(raw, deps), ctl);
  }

  analyzeProgress(context: Record<string, unknown>, ctl: RunControl) {
    return this.runValidated<ProgressAnalysis>("analyze_progress", "progress", ProgressAnalysis, PROMPTS.analyzeProgress(context), context, (raw) => schemaOnly(ProgressAnalysis, raw), ctl);
  }

  /** Classify a free-text coach request (and draft a reply / explanation). */
  explainAdjustment(context: Record<string, unknown>, ctl: RunControl) {
    return this.runValidated<CoachIntent>("coach", "coach", CoachIntent, PROMPTS.coach(context), context, (raw) => schemaOnly(CoachIntent, raw), ctl);
  }

  /** Deterministic consistency check between a nutrition plan and its targets. */
  checkNutritionConsistency(plan: NutritionPlan) {
    const issues: string[] = [];
    for (const d of plan.days) {
      const dev = (d.totals.kcal - plan.targets.kcal) / plan.targets.kcal;
      if (Math.abs(dev) > 0.1) issues.push(`day ${d.dayOfWeek}: ${Math.round(dev * 100)}% from calorie target`);
      if (d.totals.proteinG < plan.targets.proteinG * 0.8) issues.push(`day ${d.dayOfWeek}: protein below 80% of target`);
    }
    return { ok: issues.length === 0, issues };
  }
}

function schemaOnly<T>(s: z.ZodType<T>, raw: unknown): ValidationResult<T> {
  const r = s.safeParse(raw);
  return r.success ? { ok: true, plan: r.data, errors: [], warnings: [] } : { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`), warnings: [] };
}
