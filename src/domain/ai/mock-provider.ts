/**
 * MockAIProvider — deterministic stand-in for Codex used by automated tests and
 * local development without AI access. It is refused in production unless
 * FITFLOW_ALLOW_MOCK_AI=1 is set explicitly (see provider factory).
 *
 * Failure modes can be injected via the `mock_ai_mode` app setting:
 *   ok | auth_error | usage_limit | invalid_json | invalid_plan | timeout | slow
 */
import { parseIntent } from "@/domain/adjust/intent";
import { applyCardio, applyDifficulty, applyEmphasis, applyMuscleFocus, applySessionMinutes } from "@/domain/adjust/workout";
import type { WorkoutConstraints } from "@/domain/plans/validate-workout";
import type { AiNutritionPlan, AiPrescription, AiSession, AiWorkoutPlan, CoachIntent, ProgressAnalysis } from "@/domain/plans/schemas";
import { AiError, type AIProvider, type AiDiagnostic, type AiRequest, type AiResponse } from "./types";

type Ex = { id: string; fa: string; pattern: string; mechanic: string | null; level: string; equipment: string[]; primary: string[] };
type Food = { id: string; cat: string; tags: string[]; serving: string; per100g: { kcal: number; p: number } };
type Ctx = Record<string, unknown> & {
  constraints?: WorkoutConstraints & { preferredDays?: number[] };
  exerciseCatalog?: Ex[];
  profile?: { goals?: { primary?: string }; experience?: { level?: string }; training?: { cardioPrefs?: string[] }; preferences?: { cycleWeeks?: string; split?: string; difficulty?: number } };
  currentPlan?: unknown;
  request?: Record<string, unknown>;
  foodCatalog?: Food[];
  nutrition?: { mealsPerDay?: string; wakeTime?: string };
  cycle?: { cycleNumber?: number } | null;
  history?: unknown;
};

const DEFAULT_DAYS: Record<number, number[]> = { 1: [1], 2: [6, 2], 3: [6, 1, 3], 4: [6, 0, 2, 3], 5: [6, 0, 1, 3, 4], 6: [6, 0, 1, 2, 3, 4], 7: [0, 1, 2, 3, 4, 5, 6] };
const TEMPLATES: Record<string, { title: string; focus: string[]; slots: string[] }> = {
  fullA: { title: "تمام بدن A", focus: ["تمام بدن"], slots: ["squat", "horizontal_push", "horizontal_pull", "hinge", "vertical_push", "core"] },
  fullB: { title: "تمام بدن B", focus: ["تمام بدن"], slots: ["hinge", "vertical_pull", "lunge", "horizontal_push", "upper_isolation:shoulders", "core"] },
  fullC: { title: "تمام بدن C", focus: ["تمام بدن"], slots: ["squat", "horizontal_pull", "horizontal_push", "lunge", "upper_isolation:biceps", "core"] },
  upper: { title: "بالاتنه", focus: ["سینه", "پشت", "سرشانه", "بازو"], slots: ["horizontal_push", "horizontal_pull", "vertical_push", "vertical_pull", "upper_isolation:biceps", "upper_isolation:triceps"] },
  lower: { title: "پایین‌تنه", focus: ["پا", "باسن", "میان‌تنه"], slots: ["squat", "hinge", "lunge", "lower_isolation:hamstrings", "lower_isolation:calves", "core"] },
  push: { title: "پوش (سینه، سرشانه، پشت بازو)", focus: ["سینه", "سرشانه", "پشت بازو"], slots: ["horizontal_push", "vertical_push", "horizontal_push", "upper_isolation:shoulders", "upper_isolation:triceps"] },
  pull: { title: "پول (پشت، جلوبازو)", focus: ["پشت", "جلوبازو"], slots: ["vertical_pull", "horizontal_pull", "horizontal_pull", "upper_isolation:shoulders", "upper_isolation:biceps"] },
  legs: { title: "پا و میان‌تنه", focus: ["پا", "باسن", "میان‌تنه"], slots: ["squat", "hinge", "lunge", "lower_isolation:quadriceps", "lower_isolation:calves", "core"] },
};
const SPLITS: Record<number, string[]> = {
  1: ["fullA"], 2: ["fullA", "fullB"], 3: ["fullA", "fullB", "fullC"], 4: ["upper", "lower", "upper", "lower"],
  5: ["push", "pull", "legs", "upper", "lower"], 6: ["push", "pull", "legs", "push", "pull", "legs"], 7: ["push", "pull", "legs", "upper", "lower", "fullA", "fullB"],
};
const LEVEL = { beginner: 1, intermediate: 2, expert: 3, advanced: 3 } as Record<string, number>;
const TIMED = new Set(["Plank", "Superman", "Farmers_Walk"]);

function buildWorkout(ctx: Ctx, variety = 0, daysOverride?: number): AiWorkoutPlan {
  const c = ctx.constraints!;
  const days = daysOverride ?? c.daysPerWeek;
  const cat = ctx.exerciseCatalog ?? [];
  const level = LEVEL[ctx.profile?.experience?.level ?? "beginner"] ?? 1;
  const goal = ctx.profile?.goals?.primary ?? "general";
  const pref = (c.preferredDays ?? []).length === days ? [...c.preferredDays!].sort((a, b) => ((a + 1) % 7) - ((b + 1) % 7)) : DEFAULT_DAYS[days];
  const split = SPLITS[days];
  const scheme = goal === "strength" ? { sets: 4, repMin: 4, repMax: 6, rest: 150, rir: 2 }
    : goal === "endurance" ? { sets: 2, repMin: 12, repMax: 20, rest: 60, rir: 3 }
    : goal === "fat_loss" ? { sets: 3, repMin: 10, repMax: 15, rest: 75, rir: 2 }
    : { sets: 3, repMin: 8, repMax: 12, rest: 90, rir: 2 };
  if (level === 1) scheme.rir = 3;
  const sessions: AiSession[] = split.map((tpl, i) => {
    const T = TEMPLATES[tpl];
    const used = new Set<string>();
    const exercises: AiPrescription[] = [];
    T.slots.forEach((slot, si) => {
      const [pattern, muscle] = slot.split(":");
      const pool = cat.filter((e) => e.pattern === pattern && (LEVEL[e.level] ?? 1) <= Math.max(level, 2) && !used.has(e.id) && (!muscle || e.primary.includes(muscle)));
      if (!pool.length) return;
      const ex = pool[(i + si + variety) % pool.length];
      used.add(ex.id);
      const timed = TIMED.has(ex.id);
      const compound = ex.mechanic === "compound";
      exercises.push({
        exerciseId: ex.id, sets: compound ? scheme.sets : Math.min(3, scheme.sets), unit: timed ? "seconds" : "reps",
        repMin: timed ? 30 : compound ? scheme.repMin : Math.max(scheme.repMin, 10), repMax: timed ? 45 : compound ? scheme.repMax : Math.max(scheme.repMax, 15),
        restSec: compound ? scheme.rest : 60, targetRir: timed ? null : scheme.rir,
        loadGuidance: compound ? `وزنه‌ای انتخاب کنید که پس از آخرین تکرار حدود ${scheme.rir} تکرار دیگر توان داشته باشید.` : "وزنه سبک تا متوسط با کنترل کامل.",
        notes: "", alternatives: cat.filter((x) => x.pattern === ex.pattern && x.id !== ex.id).slice(0, 2).map((x) => x.id),
      });
    });
    const wantsCardio = !(ctx.profile?.training?.cardioPrefs ?? []).includes("none") && ["fat_loss", "endurance", "general"].includes(goal);
    const cardio = cat.find((e) => e.pattern === "cardio");
    if (wantsCardio && cardio) exercises.push({ exerciseId: cardio.id, sets: 1, unit: "minutes", repMin: 10, repMax: 15, restSec: 0, targetRir: null, loadGuidance: "شدت متوسط", notes: "", alternatives: [] });
    return {
      key: `s${i + 1}`, dayOfWeek: pref[i], title: T.title, focus: T.focus, estimatedMinutes: c.sessionMinutes,
      warmup: ["۵ دقیقه فعالیت هوازی سبک", "حرکات کششی پویا برای مفاصل درگیر", "۱ تا ۲ ست گرم‌کردن سبک برای اولین حرکت"],
      cooldown: ["۳ تا ۵ دقیقه راه رفتن آرام", "کشش ایستا برای عضلات تمرین‌داده‌شده"], exercises,
    };
  });
  const diff = Math.min(5, Math.max(1, ctx.profile?.preferences?.difficulty ?? 3));
  return {
    title: days <= 3 ? "برنامه تمام بدن" : days === 4 ? "برنامه بالاتنه/پایین‌تنه" : "برنامه پوش/پول/پا",
    objective: "پیشرفت تدریجی و پایدار متناسب با هدف و زمان در دسترس.", split: days <= 3 ? "full_body" : days === 4 ? "upper_lower" : "ppl",
    durationWeeks: Math.min(6, Math.max(4, Number(ctx.profile?.preferences?.cycleWeeks ?? 4))), difficulty: diff, sessions,
    progressionRules: ["پیشرفت دوگانه: وقتی در همه ست‌ها به سقف تکرار رسیدید، وزنه را ۲.۵ تا ۵٪ افزایش دهید.", "اگر RIR هدف حفظ نشد، وزنه را ثابت نگه دارید."],
    recoveryGuidance: ["۷ تا ۹ ساعت خواب", "بین جلسات یک گروه عضلانی حداقل ۴۸ ساعت فاصله"],
    intensityGuidance: "بیشتر ست‌ها با ۱ تا ۳ تکرار ذخیره (RIR) انجام شوند.", safetyNotes: ["در صورت درد تیز مفصل، حرکت را متوقف و جایگزین کنید."],
    changeSummary: { kept: [], changed: [], reasons: ["طراحی بر اساس پرسشنامه اولیه"], targets: ["ایجاد عادت تمرینی منظم", "پیشرفت قدرت در حرکات اصلی"] },
    coachMessage: "این برنامه بر اساس هدف، زمان و تجهیزات شما طراحی شده است. با وزنه‌های قابل‌کنترل شروع کنید و هر هفته کمی پیشرفت داشته باشید.",
  };
}

function reviseWorkout(ctx: Ctx): AiWorkoutPlan {
  const req = (ctx.request ?? {}) as { difficultyDelta?: number | null; daysPerWeek?: number | null; sessionMinutes?: number | null; emphasis?: string | null; muscleFocus?: string[] | null; cardio?: "add" | "reduce" | null };
  const c = ctx.constraints!;
  const cur = ctx.currentPlan as AiWorkoutPlan | undefined;
  let plan = cur?.sessions?.[0]?.exercises?.[0]?.exerciseId ? structuredClone(cur) : buildWorkout(ctx);
  if (req.daysPerWeek && req.daysPerWeek !== plan.sessions.length) plan = buildWorkout({ ...ctx, constraints: { ...c, daysPerWeek: req.daysPerWeek } }, 0, req.daysPerWeek);
  if (req.difficultyDelta) plan = applyDifficulty(plan, req.difficultyDelta).plan;
  if (req.sessionMinutes) plan = applySessionMinutes(plan, req.sessionMinutes).plan;
  if (req.emphasis === "strength" || req.emphasis === "hypertrophy") plan = applyEmphasis(plan, req.emphasis).plan;
  if (req.muscleFocus?.length) plan = applyMuscleFocus(plan, req.muscleFocus, c).plan;
  if (req.cardio) plan = applyCardio(plan, req.cardio, c).plan;
  return { ...plan, changeSummary: { kept: ["ساختار کلی برنامه"], changed: ["اعمال تغییرات درخواستی"], reasons: ["درخواست کاربر"], targets: ["تناسب بهتر با شرایط فعلی"] }, coachMessage: "برنامه طبق درخواست شما اصلاح شد." };
}

function nextCycle(ctx: Ctx): AiWorkoutPlan {
  const req = (ctx.request ?? {}) as { difficultyDelta?: number | null; daysPerWeek?: number | null };
  let plan = buildWorkout(ctx, (ctx.cycle?.cycleNumber ?? 1) + 1, req.daysPerWeek ?? undefined);
  if (req.difficultyDelta) plan = applyDifficulty(plan, req.difficultyDelta).plan;
  return { ...plan, title: plan.title + " — دوره جدید", changeSummary: { kept: ["تقسیم‌بندی و حرکات اصلی"], changed: ["تنوع در حرکات کمکی", "تنظیم حجم بر اساس پیشرفت"], reasons: ["جلوگیری از رکود و حفظ انگیزه"], targets: ["افزایش قدرت در حرکات اصلی"] }, coachMessage: "دوره جدید بر اساس عملکرد دوره قبل طراحی شد." };
}

function buildNutrition(ctx: Ctx): AiNutritionPlan {
  const foods = ctx.foodCatalog ?? [];
  const has = (f: Food, ...tags: string[]) => tags.every((t) => f.tags.includes(t));
  const pick = (pred: (f: Food) => boolean, i: number, avoid: string[] = []) => {
    const pool = foods.filter((f) => pred(f) && !avoid.includes(f.id));
    return pool.length ? pool[i % pool.length] : undefined;
  };
  const grams = (f: Food | undefined, mult = 1) => (f ? Math.round(Number(f.serving.split("g")[0]) * mult) : 0);
  const n = Number(ctx.nutrition?.mealsPerDay ?? 4);
  const slots = n <= 2 ? ["lunch", "dinner"] : n === 3 ? ["breakfast", "lunch", "dinner"] : n === 4 ? ["breakfast", "lunch", "snack_pm", "dinner"] : ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];
  const times: Record<string, string> = { breakfast: "08:00", snack_am: "10:30", lunch: "13:30", snack_pm: "17:00", dinner: "20:30" };
  const meal = (slot: string, d: number) => {
    const items: { foodId: string; grams: number }[] = [];
    const add = (f: Food | undefined, mult = 1) => { if (f && !items.some((x) => x.foodId === f.id)) items.push({ foodId: f.id, grams: Math.max(5, grams(f, mult)) }); };
    if (slot === "breakfast") {
      add(pick((f) => has(f, "breakfast", "carb") && !has(f, "fruit"), d));
      add(pick((f) => has(f, "breakfast") && (has(f, "protein") || has(f, "dairy")), d));
      add(pick((f) => has(f, "fruit"), d));
    } else if (slot === "lunch" || slot === "dinner") {
      const off = slot === "dinner" ? 3 : 0;
      add(pick((f) => has(f, "protein", "main") && !has(f, "stew"), d + off), 1.2);
      add(pick((f) => has(f, "carb", "main") && !has(f, "protein"), d + off), 1);
      add(pick((f) => has(f, "veg"), d + off));
    } else {
      add(pick((f) => has(f, "snack") && (has(f, "fruit") || has(f, "dairy")), d + (slot === "snack_am" ? 2 : 0)));
      add(pick((f) => has(f, "snack") && (has(f, "fat") || has(f, "protein")), d));
    }
    if (!items.length && foods[0]) items.push({ foodId: foods[0].id, grams: 100 });
    return { slot: slot as AiNutritionPlan["days"][0]["meals"][0]["slot"], title: slot === "breakfast" ? "صبحانه مقوی" : slot.startsWith("snack") ? "میان‌وعده" : slot === "lunch" ? "ناهار متعادل" : "شام سبک", time: times[slot], items, prepMinutes: slot.startsWith("snack") ? 2 : 20, instructions: "مواد را طبق مقادیر آماده کنید؛ پخت با روغن کم." };
  };
  return {
    title: "برنامه غذایی هفتگی",
    days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, meals: slots.map((s) => meal(s, d)) })),
    alternatives: slots.slice(0, 3).map((s, i) => { const m = meal(s, i + 5); return { slot: m.slot, title: m.title + " (جایگزین)", items: m.items }; }),
    hydrationGuidance: "روزانه حدود ۳۵ میلی‌لیتر آب به ازای هر کیلوگرم وزن، و در روزهای تمرین کمی بیشتر.",
    rationale: ["پروتئین در هر وعده اصلی", "کربوهیدرات بیشتر در وعده‌های نزدیک تمرین"],
    changeSummary: { kept: [], changed: [], reasons: ["طراحی اولیه"], targets: ["رسیدن به کالری و پروتئین هدف"] },
    coachMessage: "این برنامه با غذاهای در دسترس و ترجیحات شما تنظیم شده است.",
  };
}

function analyze(ctx: Ctx): ProgressAnalysis {
  const h = (ctx.history ?? {}) as { last30Days?: { completed?: number; adherencePct?: number | null }; weightTrendKgPerWeek?: number | null };
  const completed = h.last30Days?.completed ?? 0;
  return {
    summary: completed ? `در ۳۰ روز گذشته ${completed} جلسه تمرین ثبت شده است.` : "هنوز داده کافی برای تحلیل ثبت نشده است.",
    wins: completed ? ["ثبت منظم تمرینات"] : [], concerns: (h.last30Days?.adherencePct ?? 100) < 60 ? ["پایبندی کمتر از ۶۰٪"] : [],
    recommendations: [{ title: "ادامه برنامه فعلی", detail: "با اضافه‌بار تدریجی ادامه دهید.", action: "keep" }],
    dataQuality: completed >= 4 ? "good" : completed > 0 ? "limited" : "insufficient",
  };
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  constructor(private getMode: () => string = () => "ok") {}

  async generate(req: AiRequest): Promise<AiResponse> {
    const started = Date.now();
    const mode = this.getMode();
    const wait = (ms: number) => new Promise<void>((res, rej) => {
      const t = setTimeout(res, ms);
      req.signal?.addEventListener("abort", () => { clearTimeout(t); rej(new AiError("cancelled", "cancelled")); }, { once: true });
    });
    req.onProgress?.("در حال طراحی برنامه (حالت آزمایشی)…");
    if (mode === "auth_error") throw new AiError("auth", "mock: not logged in");
    if (mode === "usage_limit") throw new AiError("usage_limit", "mock: usage limit reached", true);
    if (mode === "timeout") { await Promise.race([wait(req.timeoutMs + 50), wait(30000)]); throw new AiError("timeout", "mock timeout", true); }
    if (mode === "slow") await wait(3000);
    else await wait(150);
    if (mode === "invalid_json") throw new AiError("invalid_output", "output is not valid JSON", false, { sample: "{not json" });
    const ctx = req.context as Ctx;
    let raw: unknown;
    switch (req.task) {
      case "initial_program": raw = buildWorkout(ctx); break;
      case "revise_workout": raw = reviseWorkout(ctx); break;
      case "next_cycle": raw = nextCycle(ctx); break;
      case "nutrition_plan":
      case "revise_nutrition": raw = buildNutrition(ctx); break;
      case "coach": {
        const text = String((ctx.request as { text?: string })?.text ?? "");
        const p = parseIntent(text);
        raw = { ...p, confidence: Math.max(p.confidence, 0.6), reply: p.intent === "unsupported" ? "این درخواست خارج از حوزه مربی تمرین و تغذیه است." : "درخواست شما بررسی شد." } satisfies CoachIntent;
        break;
      }
      case "analyze_progress": raw = analyze(ctx); break;
      case "smoke": raw = { ok: true }; break;
      default: throw new AiError("process", `mock: unsupported task ${req.task}`);
    }
    if (mode === "invalid_plan" && typeof raw === "object" && raw && "sessions" in raw) {
      (raw as AiWorkoutPlan).sessions[0].exercises[0].exerciseId = "Invented_Exercise_That_Does_Not_Exist";
    }
    return { raw, text: JSON.stringify(raw), durationMs: Date.now() - started, providerVersion: "mock-1" };
  }

  async diagnose(): Promise<AiDiagnostic> {
    return { provider: this.name, binaryFound: true, binaryPath: null, version: "mock-1", loggedIn: this.getMode() !== "auth_error", loginStatusText: "mock provider (tests/development only)", smokeTest: { ok: true, durationMs: 1 }, osUser: "n/a", workdir: "n/a", checkedAt: Date.now(), problems: [] };
  }
}
