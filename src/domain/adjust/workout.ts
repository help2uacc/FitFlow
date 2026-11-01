/**
 * Deterministic workout-plan transformations used for instant previews.
 * Difficulty is multidimensional: sets, proximity to failure (RIR), rep
 * ranges, exercise count and duration — never just "heavier weights".
 */
import { AREA_TO_MUSCLES, CATALOG } from "@/domain/exercises/catalog";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { estimateSessionMinutes, getCatalogExercise, isEligible, type WorkoutConstraints } from "@/domain/plans/validate-workout";

const clone = <T,>(x: T): T => structuredClone(x);
const isCompound = (id: string) => getCatalogExercise(id)?.mechanic === "compound";
const isCardioOrMobility = (id: string) => ["cardio", "mobility"].includes(getCatalogExercise(id)?.pattern ?? "");

export interface AdjustOutcome { plan: WorkoutPlan; notes: string[]; warnings: string[] }

export function applyDifficulty(plan: WorkoutPlan, delta: number, opts: { recoveryConcern?: boolean; sessionKey?: string; muscles?: string[] } = {}): AdjustOutcome {
  const p = clone(plan);
  const notes: string[] = [];
  const warnings: string[] = [];
  let d = Math.max(-2, Math.min(2, Math.round(delta)));
  if (d > 0 && opts.recoveryConcern) {
    warnings.push("به‌دلیل گزارش درد یا ریکاوری ضعیف، به‌جای افزایش ست فقط شدت کمی بالا می‌رود.");
  }
  if (d > 0 && p.difficulty >= 5) {
    warnings.push("برنامه در بالاترین سطح سختی است؛ افزایش بیشتر توصیه نمی‌شود.");
    d = 0;
  }
  const targetMuscles = opts.muscles?.length ? new Set(opts.muscles.flatMap((a) => AREA_TO_MUSCLES[a] ?? [a])) : null;
  for (const s of p.sessions) {
    if (opts.sessionKey && s.key !== opts.sessionKey) continue;
    for (const e of s.exercises) {
      if (isCardioOrMobility(e.exerciseId)) continue;
      if (targetMuscles && !getCatalogExercise(e.exerciseId)?.primaryMuscles.some((m) => targetMuscles.has(m))) continue;
      const compound = isCompound(e.exerciseId);
      if (d > 0) {
        if (!opts.recoveryConcern && (d === 2 || compound)) e.sets = Math.min(5, e.sets + 1);
        if (e.targetRir !== null) e.targetRir = Math.max(compound ? 1 : 0, e.targetRir - (d === 2 ? 2 : 1));
        if (d === 2 && e.unit === "seconds") e.repMax = Math.min(120, e.repMax + 10);
      } else if (d < 0) {
        e.sets = Math.max(d === -2 ? 1 : 2, e.sets - 1);
        if (e.targetRir !== null) e.targetRir = Math.min(4, e.targetRir + (d === -2 ? 2 : 1));
        if (d === -2 && compound) e.restSec = Math.min(240, e.restSec + 30);
      }
    }
    if (d === -2 && s.exercises.length > 4 && !targetMuscles) {
      const idx = [...s.exercises.keys()].reverse().find((i) => !isCompound(s.exercises[i].exerciseId));
      if (idx !== undefined) {
        notes.push(`حذف ${getCatalogExercise(s.exercises[idx].exerciseId)?.nameFa} از ${s.title}`);
        s.exercises.splice(idx, 1);
      }
    }
    s.estimatedMinutes = estimateSessionMinutes(s.exercises);
  }
  if (!opts.sessionKey && !targetMuscles) p.difficulty = Math.max(1, Math.min(5, p.difficulty + d));
  if (d > 0) notes.push("ست‌های حرکات چندمفصلی بیشتر و فاصله تا ناتوانی (RIR) کمتر شد.");
  if (d < 0) notes.push("حجم تمرین کمتر و فاصله تا ناتوانی (RIR) بیشتر شد تا ریکاوری بهتر شود.");
  return { plan: p, notes, warnings };
}

/** Fit every session into a new time budget by adjusting sets / accessories. */
export function applySessionMinutes(plan: WorkoutPlan, minutes: number, c?: WorkoutConstraints): AdjustOutcome {
  const p = clone(plan);
  const notes: string[] = [];
  for (const s of p.sessions) {
    let est = estimateSessionMinutes(s.exercises);
    let guard = 0;
    while (est > minutes && guard++ < 60) {
      const idx = [...s.exercises.keys()].reverse().find((i) => s.exercises[i].sets > 2);
      if (idx !== undefined) s.exercises[idx].sets -= 1;
      else if (s.exercises.length > 3) {
        const rm = [...s.exercises.keys()].reverse().find((i) => !isCompound(s.exercises[i].exerciseId)) ?? s.exercises.length - 1;
        s.exercises.splice(rm, 1);
      } else {
        for (const e of s.exercises) e.restSec = Math.max(45, e.restSec - 15);
        if (s.exercises.every((e) => e.restSec <= 45)) break;
      }
      est = estimateSessionMinutes(s.exercises);
    }
    guard = 0;
    while (est < minutes - 12 && guard++ < 20) {
      const e = s.exercises.find((x) => x.sets < 4 && !isCardioOrMobility(x.exerciseId));
      if (!e) break;
      e.sets += 1;
      est = estimateSessionMinutes(s.exercises);
    }
    s.estimatedMinutes = est;
  }
  void c;
  notes.push(`جلسات برای حدود ${minutes} دقیقه تنظیم شدند.`);
  return { plan: p, notes, warnings: [] };
}

export function applyEmphasis(plan: WorkoutPlan, emphasis: "strength" | "hypertrophy"): AdjustOutcome {
  const p = clone(plan);
  for (const s of p.sessions) {
    for (const e of s.exercises) {
      if (isCardioOrMobility(e.exerciseId) || e.unit !== "reps") continue;
      const compound = isCompound(e.exerciseId);
      if (emphasis === "strength" && compound) Object.assign(e, { repMin: 3, repMax: 6, restSec: Math.max(e.restSec, 150), targetRir: 2 });
      else if (emphasis === "strength") Object.assign(e, { repMin: 6, repMax: 10, restSec: Math.max(e.restSec, 90) });
      else Object.assign(e, compound ? { repMin: 6, repMax: 10, restSec: Math.min(Math.max(e.restSec, 90), 150) } : { repMin: 10, repMax: 15, restSec: 75 });
    }
    s.estimatedMinutes = estimateSessionMinutes(s.exercises);
  }
  return { plan: p, notes: [emphasis === "strength" ? "تکرار کمتر و استراحت بیشتر در حرکات اصلی برای تمرکز قدرتی." : "دامنه تکرار متوسط برای تمرکز بر رشد عضله (هایپرتروفی)."], warnings: [] };
}

/** Add weekly sets for priority areas (extra sets or one extra exercise). */
export function applyMuscleFocus(plan: WorkoutPlan, areas: string[], c: WorkoutConstraints): AdjustOutcome {
  const p = clone(plan);
  const notes: string[] = [];
  const muscles = new Set(areas.flatMap((a) => AREA_TO_MUSCLES[a] ?? [a]));
  let added = 0;
  for (const s of p.sessions) {
    const hits = s.exercises.filter((e) => getCatalogExercise(e.exerciseId)?.primaryMuscles.some((m) => muscles.has(m)));
    for (const e of hits) if (e.sets < 5) { e.sets += 1; added++; }
  }
  if (added < 3) {
    const candidate = CATALOG.find((e) => isEligible(e, c) && e.primaryMuscles.some((m) => muscles.has(m)) && e.mechanic !== "compound" &&
      !p.sessions.some((s) => s.exercises.some((x) => x.exerciseId === e.id)));
    const target = [...p.sessions].sort((a, b) => a.exercises.length - b.exercises.length)[0];
    if (candidate && target && target.exercises.length < 10) {
      target.exercises.push({ exerciseId: candidate.id, sets: 3, unit: "reps", repMin: 10, repMax: 15, restSec: 75, targetRir: 2, loadGuidance: "وزنه‌ای که ۲ تکرار ذخیره بماند.", notes: "حرکت اضافه برای عضله اولویت‌دار", alternatives: [] });
      notes.push(`${candidate.nameFa} به ${target.title} اضافه شد.`);
    }
  }
  for (const s of p.sessions) s.estimatedMinutes = estimateSessionMinutes(s.exercises);
  notes.push(`${added} ست هفتگی برای عضلات اولویت‌دار اضافه شد.`);
  return { plan: p, notes, warnings: [] };
}

export function applyCardio(plan: WorkoutPlan, change: "add" | "reduce", c: WorkoutConstraints): AdjustOutcome {
  const p = clone(plan);
  const notes: string[] = [];
  if (change === "reduce") {
    for (const s of p.sessions) s.exercises = s.exercises.filter((e) => getCatalogExercise(e.exerciseId)?.pattern !== "cardio" || s.exercises.length <= 1);
    notes.push("فعالیت‌های هوازی از انتهای جلسات حذف شد.");
  } else {
    const cardio = CATALOG.find((e) => e.pattern === "cardio" && isEligible(e, c) && !e.stress.includes("high_impact"));
    if (cardio) for (const s of p.sessions) {
      if (!s.exercises.some((e) => getCatalogExercise(e.exerciseId)?.pattern === "cardio")) {
        s.exercises.push({ exerciseId: cardio.id, sets: 1, unit: "minutes", repMin: 12, repMax: 15, restSec: 0, targetRir: null, loadGuidance: "شدت متوسط؛ بتوانید صحبت کنید.", notes: "هوازی انتهای جلسه", alternatives: [] });
      }
    }
    notes.push(cardio ? `${cardio.nameFa} ۱۲ تا ۱۵ دقیقه به انتهای جلسات اضافه شد.` : "تجهیزات مناسب هوازی در دسترس نیست.");
  }
  for (const s of p.sessions) s.estimatedMinutes = estimateSessionMinutes(s.exercises);
  return { plan: p, notes, warnings: [] };
}

export function replaceExerciseInPlan(plan: WorkoutPlan, sessionKey: string, index: number, newId: string): AdjustOutcome {
  const p = clone(plan);
  const s = p.sessions.find((x) => x.key === sessionKey);
  if (!s || !s.exercises[index]) throw new Error("exercise slot not found");
  const old = s.exercises[index].exerciseId;
  s.exercises[index] = { ...s.exercises[index], exerciseId: newId, alternatives: [old, ...s.exercises[index].alternatives.filter((a) => a !== newId)].slice(0, 4) };
  return { plan: p, notes: [`${getCatalogExercise(old)?.nameFa} با ${getCatalogExercise(newId)?.nameFa} جایگزین شد.`], warnings: [] };
}

/** Suggest a difficulty change from recent training data (deterministic heuristic). */
export function recommendDifficulty(stats: { adherencePct: number | null; avgDifficulty: number | null; painReports: number; completed: number }) {
  if (stats.completed < 3) return { delta: 0, reason: "داده کافی از جلسات اخیر ثبت نشده؛ فعلاً همین سطح حفظ شود." };
  if (stats.painReports > 0) return { delta: -1, reason: "درد یا ناراحتی گزارش شده؛ کاهش موقت حجم و شدت توصیه می‌شود." };
  if (stats.avgDifficulty !== null && stats.avgDifficulty >= 4.5) return { delta: -1, reason: "جلسات اخیر خیلی سخت ارزیابی شده‌اند." };
  if (stats.adherencePct !== null && stats.adherencePct < 60) return { delta: -1, reason: "پایبندی به برنامه پایین بوده؛ برنامه سبک‌تر احتمال ثبات را بیشتر می‌کند." };
  if ((stats.adherencePct ?? 0) >= 80 && (stats.avgDifficulty ?? 3) <= 3) return { delta: 1, reason: "جلسات منظم و با سختی قابل‌تحمل انجام شده‌اند؛ پیشرفت تدریجی مناسب است." };
  return { delta: 0, reason: "روند فعلی مناسب است؛ ادامه با اضافه‌بار تدریجی طبق قوانین پیشرفت." };
}
