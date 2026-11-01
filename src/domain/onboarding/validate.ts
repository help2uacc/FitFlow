import type { Question } from "./questions";

export type AnswerResult = { ok: true; value: unknown } | { ok: false; error: string };

const toLatinDigits = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** Validate & normalise one onboarding answer against its declared question. */
export function validateAnswer(q: Question, raw: unknown): AnswerResult {
  if (raw === null || raw === undefined || raw === "") {
    return q.optional ? { ok: true, value: null } : { ok: false, error: "پاسخ این سؤال لازم است." };
  }
  const allowed = new Set((q.options ?? []).map((o) => o.value));
  switch (q.type) {
    case "single":
      return typeof raw === "string" && allowed.has(raw) ? { ok: true, value: raw } : { ok: false, error: "گزینه نامعتبر است." };
    case "multi": {
      if (!Array.isArray(raw) || !raw.every((v) => typeof v === "string" && allowed.has(v))) return { ok: false, error: "گزینه نامعتبر است." };
      let vals = [...new Set(raw as string[])];
      if (q.exclusive && vals.includes(q.exclusive) && vals.length > 1) vals = vals.filter((v) => v !== q.exclusive);
      if (q.maxSelect && vals.length > q.maxSelect) return { ok: false, error: `حداکثر ${q.maxSelect} گزینه.` };
      if (!vals.length && !q.optional) return { ok: false, error: "حداقل یک گزینه انتخاب کنید." };
      return { ok: true, value: vals };
    }
    case "rank": {
      if (!Array.isArray(raw) || raw.length !== allowed.size || !raw.every((v) => allowed.has(v))) return { ok: false, error: "ترتیب نامعتبر است." };
      return { ok: true, value: raw };
    }
    case "number":
    case "slider": {
      const n = typeof raw === "number" ? raw : Number(toLatinDigits(String(raw)).replace(/[٫,]/g, "."));
      if (!Number.isFinite(n)) return { ok: false, error: "عدد معتبر وارد کنید." };
      if (q.min !== undefined && n < q.min) return { ok: false, error: `حداقل مقدار ${q.min} است.` };
      if (q.max !== undefined && n > q.max) return { ok: false, error: `حداکثر مقدار ${q.max} است.` };
      return { ok: true, value: Math.round(n * 10) / 10 };
    }
    case "yesno":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, error: "بله یا خیر را انتخاب کنید." };
    case "time":
      return typeof raw === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? { ok: true, value: raw } : { ok: false, error: "ساعت نامعتبر است." };
    case "date":
      return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { ok: true, value: raw } : { ok: false, error: "تاریخ نامعتبر است." };
    case "text":
      return typeof raw === "string" && raw.length <= 1000 ? { ok: true, value: raw.trim() } : { ok: false, error: "متن بیش از حد طولانی است." };
    case "photo":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: true, value: null };
  }
}

/** Convert a Persian (Jalali) birth year to Gregorian if needed. */
export function normalizeBirthYear(y: number) {
  return y < 1500 ? y + 621 : y;
}
