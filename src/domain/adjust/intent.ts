/**
 * Fast local Persian intent parser for coach requests. Produces the same
 * controlled action schema as the AI classifier; low-confidence requests are
 * escalated to the AI. User text never becomes a command — only one of the
 * whitelisted intents with validated parameters.
 */
import type { CoachIntent } from "@/domain/plans/schemas";

export function normalizeFa(s: string) {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").trim();
}

const WORD_NUMS: [RegExp, number][] = [
  [/پانصد|پونصد/, 500], [/چهارصد/, 400], [/سیصد/, 300], [/دویست/, 200], [/صد و پنجاه|صدوپنجاه/, 150], [/(^|\s)صد(\s|$)/, 100],
];

function firstNumber(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (m) return Number(m[1]);
  for (const [re, n] of WORD_NUMS) if (re.test(s)) return n;
  return null;
}

const AREAS: [RegExp, string][] = [
  [/سرشانه|شانه/, "shoulders"], [/سینه/, "chest"], [/پشت(?! بازو)|زیربغل|کمر/, "back"], [/بازو|جلوبازو|پشت بازو/, "arms"],
  [/شکم|میان ?تنه/, "abs"], [/باسن/, "glutes"], [/پا(?!ی?ین)|ران/, "legs"], [/ساق/, "calves"],
];
const SLOTS: [RegExp, NonNullable<CoachIntent["params"]["mealSlot"]>][] = [
  [/صبحانه/, "breakfast"], [/ناهار|نهار/, "lunch"], [/شام/, "dinner"], [/میان ?وعده/, "snack_pm"],
];

const emptyParams = (): CoachIntent["params"] => ({
  calorieDelta: null, calorieTarget: null, proteinChange: null, difficultyDelta: null, daysPerWeek: null, sessionMinutes: null,
  muscleFocus: null, exerciseId: null, mealSlot: null, goal: null, scope: null, notes: null,
});

export function parseIntent(raw: string, ctx: { sessionMinutes?: number } = {}): CoachIntent {
  const s = normalizeFa(raw);
  const p = emptyParams();
  const r = (intent: CoachIntent["intent"], confidence: number, reply: string): CoachIntent => ({ intent, confidence, params: p, reply });
  const more = /بیشتر|افزایش|زیاد(?!ه)|بالا ?تر|اضافه/.test(s);
  const less = /کمتر|کاهش|کم کن|پایین ?تر|کم ?کنم/.test(s);
  const num = firstNumber(s);
  const areas = AREAS.filter(([re]) => re.test(s)).map(([, a]) => a);

  if (/چرا|توضیح|منطق/.test(s)) return r("explain_plan", 0.75, "");

  // ---- nutrition
  if (/کالری|کالر/.test(s)) {
    if (/روی|بذار|تنظیم|بشه/.test(s) && num && num >= 800 && !more && !less) { p.calorieTarget = num; return r("adjust_calories", 0.9, ""); }
    if (more || less) {
      p.calorieDelta = (more && !less ? 1 : -1) * (num && num <= 1000 ? num : 150);
      return r("adjust_calories", num ? 0.92 : 0.8, "");
    }
  }
  if (/سریع ?تر.*(چربی|وزن).*(کم|آب)|(چربی|وزن).*سریع ?تر/.test(s)) {
    p.calorieDelta = -200; p.notes = "faster fat loss requested";
    return r("adjust_calories", 0.75, "");
  }
  if (/پروتئین/.test(s) && /حجم|سیر/.test(s) === false && (more || less)) {
    p.proteinChange = more ? "increase" : "decrease";
    return r("adjust_macros", 0.85, "");
  }
  if (/حجم غذا|سیرکننده|سیر کننده|گرسنه/.test(s)) {
    p.proteinChange = "keep"; p.notes = raw.slice(0, 400);
    return r("adjust_macros", 0.7, "");
  }
  const slot = SLOTS.find(([re]) => re.test(s))?.[1];
  if (slot && /جایگزین|عوض|جای|به ?جای/.test(s)) {
    p.mealSlot = slot; p.scope = /امشب|امروز/.test(s) ? "today" : "plan"; p.notes = /کم ?کالری|سبک/.test(s) ? "lower_calorie" : /پروتئین/.test(s) ? "higher_protein" : "similar";
    return r("replace_meal", 0.85, "");
  }
  if (/غذا|برنج|وعده|منو/.test(s) && /بیشتر|کمتر|بذار|بگذار|اضافه|نباشه/.test(s)) {
    p.notes = raw.slice(0, 400);
    return r("adjust_macros", 0.55, "");
  }

  // ---- training
  if (/بعدی|دوره جدید|برنامه جدید|دور بعد/.test(s)) {
    if (/سخت|سنگین/.test(s)) p.difficultyDelta = 1;
    else if (/سبک|راحت|آسون|آسان/.test(s)) p.difficultyDelta = -1;
    return r("generate_next_cycle", 0.8, "");
  }
  const dm = s.match(/(\d)\s*(روز|جلسه)/);
  if (dm && /هفته/.test(s)) { p.daysPerWeek = Number(dm[1]); return r("adjust_workout_frequency", 0.9, ""); }
  const mm = s.match(/(\d{2,3})\s*(دقیقه|دقیقه ای)/);
  if (mm) { p.sessionMinutes = Number(mm[1]); return r("adjust_session_duration", 0.9, ""); }
  if (/وقت کم|وقت کمتر|سرم شلوغ|فرصت کم/.test(s)) {
    p.sessionMinutes = Math.max(25, (ctx.sessionMinutes ?? 60) - 15); p.notes = /این هفته/.test(s) ? "temporary" : null;
    return r("adjust_session_duration", 0.75, "");
  }
  if (/قدرتی ?تر|قدرت/.test(s) && !/کالری/.test(s)) { p.notes = "strength"; return r("adjust_workout_intensity", 0.8, ""); }
  if (/حجمی|هایپرتروفی|عضله ?سازی بیشتر/.test(s)) { p.notes = "hypertrophy"; return r("adjust_workout_intensity", 0.75, ""); }
  if (/ست|تمرین|حرکت/.test(s) && areas.length && more) { p.muscleFocus = areas; return r("adjust_workout_intensity", 0.8, ""); }
  if (/خسته|درد|اذیت|نابود/.test(s)) {
    p.difficultyDelta = -1; p.muscleFocus = areas.length ? areas : null; p.notes = raw.slice(0, 400);
    return r("adjust_workout_intensity", 0.75, "");
  }
  const dayIdx = s.match(/روز (اول|دوم|سوم|چهارم|پنجم|ششم|\d)/);
  if (/سخت ?تر|سنگین ?تر|شدید ?تر|چالشی ?تر/.test(s)) {
    p.difficultyDelta = /خیلی|بسیار/.test(s) ? 2 : 1;
    if (dayIdx) p.notes = `session:${dayIdx[1]}`;
    return r("adjust_workout_intensity", 0.88, "");
  }
  if (/سبک ?تر|راحت ?تر|آسون ?تر|آسان ?تر/.test(s)) {
    p.difficultyDelta = /خیلی|بسیار/.test(s) ? -2 : -1;
    if (dayIdx) p.notes = `session:${dayIdx[1]}`;
    return r("adjust_workout_intensity", 0.88, "");
  }
  if (/هوازی|کاردیو/.test(s)) { p.notes = more ? "cardio_add" : "cardio_reduce"; return r("adjust_workout_intensity", 0.7, ""); }
  if (/جایگزین|عوض/.test(s) && /حرکت|تمرین/.test(s)) return r("replace_exercise", 0.6, "");
  if (/پیشرفت/.test(s)) return r("analyze_progress", 0.8, "");
  if (/هدف/.test(s)) {
    const goal = /چربی|لاغر|وزن کم/.test(s) ? "fat_loss" : /عضله|حجم/.test(s) ? "muscle_gain" : /قدرت/.test(s) ? "strength" : /استقامت/.test(s) ? "endurance" : null;
    p.goal = goal;
    return r("change_goal", goal ? 0.75 : 0.4, "");
  }
  return r("unsupported", 0.2, "");
}

export const ORDINAL_FA: Record<string, number> = { اول: 1, دوم: 2, سوم: 3, چهارم: 4, پنجم: 5, ششم: 6 };
