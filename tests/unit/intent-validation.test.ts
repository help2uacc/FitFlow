import { describe, expect, it } from "vitest";
import { parseIntent } from "@/domain/adjust/intent";
import { validateAnswer } from "@/domain/onboarding/validate";
import { QUESTION_BY_ID, nextUnanswered } from "@/domain/onboarding/questions";
import { extractJson } from "@/domain/ai/codex-provider";
import { toStrictJsonSchema, AiWorkoutPlan } from "@/domain/plans/schemas";

describe("Persian intent parser", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ["می‌خوام روزانه ۲۰۰ کالری بیشتر بخورم.", "adjust_calories", { calorieDelta: 200 }],
    ["کالری برنامه‌ام رو کمتر کن.", "adjust_calories", { calorieDelta: -150 }],
    ["می‌خوام سریع‌تر چربی کم کنم.", "adjust_calories", { calorieDelta: -200 }],
    ["حجم غذام زیاده، ولی پروتئینم کم نشه.", "adjust_macros", { proteinChange: "keep" }],
    ["می‌خوام برنامه‌ام سنگین‌تر بشه.", "adjust_workout_intensity", { difficultyDelta: 1 }],
    ["ست‌های بیشتری برای سرشانه بگذار.", "adjust_workout_intensity", { muscleFocus: ["shoulders"] }],
    ["تمرین پا خیلی خسته‌ام می‌کنه.", "adjust_workout_intensity", { difficultyDelta: -1, muscleFocus: ["legs"] }],
    ["برنامه رو طوری تغییر بده که ۴۵ دقیقه‌ای تموم بشه.", "adjust_session_duration", { sessionMinutes: 45 }],
    ["هفته‌ای ۵ روز می‌خوام ورزش کنم.", "adjust_workout_frequency", { daysPerWeek: 5 }],
    ["برای شام امشب یه جایگزین کم‌کالری بده.", "replace_meal", { mealSlot: "dinner", scope: "today", notes: "lower_calorie" }],
    ["برنامه بعدی رو سخت‌تر کن.", "generate_next_cycle", { difficultyDelta: 1 }],
    ["تمرین روز سوم رو سبک‌تر کن.", "adjust_workout_intensity", { difficultyDelta: -1, notes: "session:سوم" }],
  ];
  for (const [text, intent, params] of cases) {
    it(text, () => {
      const r = parseIntent(text);
      expect(r.intent).toBe(intent);
      expect(r.params).toMatchObject(params);
    });
  }
  it("never maps unrelated text to an action", () => {
    expect(parseIntent("rm -rf / ; drop table users").intent).toBe("unsupported");
  });
});

describe("answer validation", () => {
  it("normalises Persian digits and enforces ranges", () => {
    expect(validateAnswer(QUESTION_BY_ID.get("weight")!, "۸۲٫۵")).toEqual({ ok: true, value: 82.5 });
    expect(validateAnswer(QUESTION_BY_ID.get("weight")!, 5).ok).toBe(false);
  });
  it("rejects options not in the bank and enforces exclusivity", () => {
    expect(validateAnswer(QUESTION_BY_ID.get("sex")!, "robot").ok).toBe(false);
    expect(validateAnswer(QUESTION_BY_ID.get("injuries")!, ["none", "knee"])).toEqual({ ok: true, value: ["knee"] });
  });
  it("conditional questions", () => {
    expect(nextUnanswered({})!.id).toBe("birth_year");
  });
});

describe("AI output handling", () => {
  it("extracts JSON from fenced output", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow();
  });
  it("strict JSON schema requires all properties", () => {
    const s = toStrictJsonSchema(AiWorkoutPlan) as { required: string[]; additionalProperties: boolean };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toContain("sessions");
  });
});
