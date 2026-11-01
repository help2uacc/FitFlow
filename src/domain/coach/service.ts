/**
 * "Ask My AI Coach": natural-language request → controlled intent → a
 * proposed application action (never a raw command). Plan-wide changes always
 * go through preview + confirmation.
 */
import type { DB } from "@/db/client";
import { parseIntent, ORDINAL_FA } from "@/domain/adjust/intent";
import { previewNutritionAdjustment, previewWorkoutAdjustment } from "@/domain/adjust/service";
import { enqueueJob } from "@/domain/ai/jobs";
import { getActiveWorkoutVersion } from "@/domain/plans/workout-service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import type { CoachIntent, WorkoutPlan } from "@/domain/plans/schemas";
import { getProfile } from "@/domain/profile/service";
import { PERSIAN_WEEK_ORDER } from "@/lib/dates";
import { AppError } from "@/lib/errors";

export type CoachAction =
  | { type: "workout_preview"; requestId: string; mode: "instant" | "ai"; jobId?: string }
  | { type: "nutrition_preview"; requestId: string; mode: "instant" | "ai"; jobId?: string }
  | { type: "navigate"; href: string; label: string }
  | { type: "ai_job"; jobId: string }
  | { type: "none" };

const GOAL_FA: Record<string, string> = { fat_loss: "کاهش چربی", muscle_gain: "افزایش عضله", strength: "قدرت", endurance: "استقامت" };

/** Turn a classified intent into a safe, previewable action. */
export function actionForIntent(db: DB, userId: string, it: CoachIntent, rawText: string): { reply: string; action: CoachAction } {
  const p = it.params;
  const hasWorkout = !!getActiveWorkoutVersion(db, userId);
  const hasNutrition = !!getActiveNutritionVersion(db, userId);
  const needWorkout = () => { if (!hasWorkout) throw new AppError("no_plan", "هنوز برنامه تمرینی فعالی ندارید.", 409); };
  const needNutrition = () => { if (!hasNutrition) throw new AppError("no_nutrition", "برنامه غذایی فعال نیست. می‌توانید از تنظیمات آن را فعال کنید.", 409); };
  switch (it.intent) {
    case "adjust_calories": {
      needNutrition();
      const r = p.calorieTarget ? previewNutritionAdjustment(db, userId, { kind: "target", target: p.calorieTarget, source: "coach" }) : previewNutritionAdjustment(db, userId, { kind: "delta", delta: p.calorieDelta ?? 0, source: "coach" });
      return { reply: it.reply || "پیش‌نمایش تغییر کالری آماده است. لطفاً بررسی و تأیید کنید.", action: { type: "nutrition_preview", requestId: r.requestId, mode: r.mode } };
    }
    case "adjust_macros": {
      needNutrition();
      if (p.proteinChange === "increase" || p.proteinChange === "decrease") {
        const r = previewNutritionAdjustment(db, userId, { kind: "protein", protein: p.proteinChange, source: "coach" });
        return { reply: it.reply || "پیش‌نمایش تغییر پروتئین آماده است.", action: { type: "nutrition_preview", requestId: r.requestId, mode: r.mode } };
      }
      const r = previewNutritionAdjustment(db, userId, { kind: "ai", text: rawText, source: "coach" });
      return { reply: it.reply || "درخواست شما برای اصلاح برنامه غذایی به هوش مصنوعی ارسال شد. پس از آماده شدن، پیش‌نمایش را بررسی کنید.", action: { type: "nutrition_preview", requestId: r.requestId, mode: r.mode, jobId: "jobId" in r ? r.jobId : undefined } };
    }
    case "replace_meal": {
      needNutrition();
      const q = new URLSearchParams({ slot: p.mealSlot ?? "", criterion: p.notes ?? "similar", scope: p.scope ?? "today" });
      return { reply: it.reply || "گزینه‌های جایگزین را در صفحه ثبت غذا ببینید.", action: { type: "navigate", href: `/nutrition/log?replace=1&${q}`, label: "دیدن جایگزین‌ها" } };
    }
    case "adjust_workout_intensity": {
      needWorkout();
      const plan = getActiveWorkoutVersion(db, userId)!.plan as WorkoutPlan;
      let sessionKey: string | undefined;
      const m = (p.notes ?? "").match(/^session:(.+)$/);
      if (m) {
        const n = ORDINAL_FA[m[1]] ?? Number(m[1]);
        const ordered = [...plan.sessions].sort((a, b) => PERSIAN_WEEK_ORDER.indexOf(a.dayOfWeek) - PERSIAN_WEEK_ORDER.indexOf(b.dayOfWeek));
        sessionKey = ordered[n - 1]?.key;
      }
      const notes = p.notes ?? "";
      const input = {
        source: "coach" as const,
        difficultyDelta: p.difficultyDelta ?? undefined,
        emphasis: notes === "strength" || notes === "hypertrophy" ? (notes as "strength" | "hypertrophy") : undefined,
        cardio: notes === "cardio_add" ? ("add" as const) : notes === "cardio_reduce" ? ("reduce" as const) : undefined,
        muscleFocus: !p.difficultyDelta && p.muscleFocus?.length ? (p.muscleFocus as never) : undefined,
        muscleScope: p.difficultyDelta && p.muscleFocus?.length ? (p.muscleFocus as never) : undefined,
        sessionKey,
        sessionMinutes: notes === "strength" ? undefined : undefined,
      };
      if (!input.difficultyDelta && !input.emphasis && !input.cardio && !input.muscleFocus) {
        const r = previewWorkoutAdjustment(db, userId, { source: "coach", text: rawText });
        return { reply: it.reply || "درخواست برای طراحی اصلاحیه به هوش مصنوعی ارسال شد.", action: { type: "workout_preview", requestId: r.requestId, mode: r.mode, jobId: "jobId" in r ? r.jobId : undefined } };
      }
      const r = previewWorkoutAdjustment(db, userId, input);
      return { reply: it.reply || "پیش‌نمایش تغییرات تمرین آماده است. قبل از اعمال بررسی کنید.", action: { type: "workout_preview", requestId: r.requestId, mode: r.mode } };
    }
    case "adjust_workout_frequency": {
      needWorkout();
      const r = previewWorkoutAdjustment(db, userId, { source: "coach", daysPerWeek: p.daysPerWeek ?? undefined });
      return { reply: it.reply || `برنامه برای ${p.daysPerWeek} روز در هفته بازطراحی می‌شود؛ پس از آماده شدن، پیش‌نمایش را تأیید کنید.`, action: { type: "workout_preview", requestId: r.requestId, mode: r.mode, jobId: "jobId" in r ? r.jobId : undefined } };
    }
    case "adjust_session_duration": {
      needWorkout();
      const r = previewWorkoutAdjustment(db, userId, { source: "coach", sessionMinutes: p.sessionMinutes ?? undefined });
      return { reply: it.reply || `جلسات برای حدود ${p.sessionMinutes} دقیقه تنظیم می‌شوند.${p.notes === "temporary" ? " بعد از این هفته می‌توانید از تاریخچه، نسخه قبلی را دوباره اعمال کنید." : ""}`, action: { type: "workout_preview", requestId: r.requestId, mode: r.mode } };
    }
    case "replace_exercise":
      needWorkout();
      return { reply: it.reply || "در صفحه برنامه، روی «جایگزینی حرکت» کنار حرکت موردنظر بزنید.", action: { type: "navigate", href: "/program/workout", label: "رفتن به برنامه" } };
    case "change_goal":
      return { reply: it.reply || (p.goal ? `برای تغییر هدف به «${GOAL_FA[p.goal] ?? p.goal}»، هدف را در پروفایل تغییر دهید؛ سپس گزینه به‌روزرسانی برنامه نمایش داده می‌شود.` : "هدف جدید را در پروفایل انتخاب کنید."), action: { type: "navigate", href: "/profile?section=goals", label: "تغییر هدف" } };
    case "analyze_progress": {
      const { job } = enqueueJob(db, { userId, type: "analyze_progress", payload: {}, dedupeKey: "analyze_progress" });
      return { reply: it.reply || "تحلیل پیشرفت شما شروع شد.", action: { type: "ai_job", jobId: job.id } };
    }
    case "generate_next_cycle":
      return { reply: it.reply || "برای ساخت دوره بعد، گزینه‌های تمدید را ببینید.", action: { type: "navigate", href: `/program/renew${p.difficultyDelta ? `?choice=${p.difficultyDelta > 0 ? "harder" : "easier"}` : ""}`, label: "تمدید / دوره جدید" } };
    case "explain_plan":
      return { reply: it.reply, action: { type: "none" } };
    default:
      return { reply: it.reply || "متوجه درخواست نشدم. می‌توانید مثلاً بگویید «کالری را ۲۰۰ تا بیشتر کن» یا «تمرین را سبک‌تر کن».", action: { type: "none" } };
  }
}

export function handleCoachMessage(db: DB, userId: string, text: string) {
  const clean = text.trim().slice(0, 1000);
  if (!clean) throw new AppError("empty", "متن درخواست خالی است.");
  const local = parseIntent(clean, { sessionMinutes: getProfile(db, userId).training.sessionMinutes });
  if (local.confidence >= 0.7 && local.intent !== "explain_plan") {
    return { source: "local" as const, intent: local.intent, ...actionForIntent(db, userId, local, clean) };
  }
  const { job } = enqueueJob(db, { userId, type: "coach", payload: { text: clean } });
  return { source: "ai" as const, intent: null, reply: "در حال بررسی درخواست شما…", action: { type: "ai_job", jobId: job.id } as CoachAction };
}
