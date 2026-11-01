"use client";
/** Renders the interactive control for one question (shared by onboarding & profile editor). */
import { useRef, useState } from "react";
import type { Question } from "@/domain/onboarding/questions";
import { Badge, Button, cx, Input, Textarea } from "@/components/ui";

const fa = (n: number) => n.toLocaleString("fa-IR", { maximumFractionDigits: 1 });

export function QuestionInput({ q, value, onChange, autoFocus }: { q: Question; value: unknown; onChange: (v: unknown) => void; autoFocus?: boolean }) {
  switch (q.type) {
    case "single":
      return (
        <div className="grid gap-2" role="radiogroup" aria-label={q.title}>
          {q.options!.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
              className={cx("flex min-h-13 items-center justify-between rounded-2xl px-4 py-3 text-right ring-1 transition", value === o.value ? "bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/40" : "bg-white ring-slate-200 hover:ring-slate-300 dark:bg-slate-900 dark:ring-slate-700")}>
              <span className="font-medium">{o.label}</span>
              {q.recommended === o.value && <Badge tone="brand">پیشنهادی</Badge>}
            </button>
          ))}
        </div>
      );
    case "multi": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) => {
        let next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
        if (q.exclusive) next = v === q.exclusive ? (next.includes(v) ? [v] : []) : next.filter((x) => x !== q.exclusive);
        if (q.maxSelect && next.length > q.maxSelect) return;
        onChange(next);
      };
      return (
        <div>
          <div className="flex flex-wrap gap-2">
            {q.options!.map((o) => (
              <button key={o.value} type="button" aria-pressed={arr.includes(o.value)} onClick={() => toggle(o.value)}
                className={cx("min-h-11 rounded-full px-4 py-2 text-sm font-medium ring-1 transition", arr.includes(o.value) ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700")}>
                {o.label}
              </button>
            ))}
          </div>
          {q.maxSelect && <p className="mt-2 text-xs text-slate-500">حداکثر {fa(q.maxSelect)} گزینه</p>}
        </div>
      );
    }
    case "number": {
      const n = typeof value === "number" ? value : value === null || value === undefined ? "" : String(value);
      const step = q.step ?? 1;
      const bump = (d: number) => {
        const cur = typeof value === "number" ? value : Number(q.recommended ?? q.min ?? 0);
        onChange(Math.min(q.max ?? Infinity, Math.max(q.min ?? -Infinity, Math.round((cur + d) * 10) / 10)));
      };
      return (
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="lg" aria-label="کم کردن" onClick={() => bump(-step)}>−</Button>
          <div className="relative flex-1">
            <Input autoFocus={autoFocus} inputMode="decimal" dir="ltr" className="h-14 text-center text-xl font-bold" value={n as string | number}
              onChange={(e) => {
                const raw = e.target.value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٫,]/g, ".");
                onChange(raw === "" ? null : Number.isNaN(Number(raw)) ? raw : Number(raw));
              }} />
            {q.unit && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-500">{q.unit}</span>}
          </div>
          <Button type="button" variant="secondary" size="lg" aria-label="زیاد کردن" onClick={() => bump(step)}>+</Button>
        </div>
      );
    }
    case "slider": {
      const v = typeof value === "number" ? value : Number(q.recommended ?? q.min ?? 0);
      return (
        <div className="space-y-4">
          <div className="text-center"><span className="num text-4xl font-extrabold">{fa(v)}</span> <span className="text-slate-500">{q.unit}</span></div>
          <input type="range" min={q.min} max={q.max} step={q.step ?? 1} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full" aria-label={q.title} dir="ltr" />
          <div className="flex justify-between text-xs text-slate-500" dir="ltr"><span>{fa(q.min ?? 0)}</span><span>{fa(q.max ?? 0)}</span></div>
          {typeof value !== "number" && <p className="text-center text-xs text-slate-500">برای تأیید مقدار پیشنهادی «ادامه» را بزنید یا اسلایدر را جابه‌جا کنید.</p>}
        </div>
      );
    }
    case "yesno":
      return (
        <div className="grid grid-cols-2 gap-3">
          {[{ v: true, l: "بله" }, { v: false, l: "خیر" }].map((o) => (
            <button key={o.l} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v}
              className={cx("h-16 rounded-2xl text-lg font-bold ring-1", value === o.v ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700")}>{o.l}</button>
          ))}
        </div>
      );
    case "time":
      return <Input type="time" dir="ltr" className="h-14 text-center text-xl" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <Input type="date" dir="ltr" className="h-14 text-center text-xl" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "text":
      return <Textarea autoFocus={autoFocus} value={(value as string) ?? ""} maxLength={1000} onChange={(e) => onChange(e.target.value)} placeholder="بنویسید… (اختیاری)" />;
    case "rank": {
      const order = Array.isArray(value) && value.length === q.options!.length ? (value as string[]) : q.options!.map((o) => o.value);
      const move = (i: number, d: number) => {
        const next = [...order];
        const j = i + d;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      return (
        <ol className="space-y-2">
          {order.map((v, i) => (
            <li key={v} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
              <span className="num grid size-8 place-items-center rounded-full bg-brand-50 font-bold text-brand-700 dark:bg-brand-900/40">{fa(i + 1)}</span>
              <span className="flex-1 font-medium">{q.options!.find((o) => o.value === v)?.label}</span>
              <Button type="button" size="sm" variant="ghost" aria-label="بالا" onClick={() => move(i, -1)}>▲</Button>
              <Button type="button" size="sm" variant="ghost" aria-label="پایین" onClick={() => move(i, 1)}>▼</Button>
            </li>
          ))}
        </ol>
      );
    }
    case "photo":
      return <PhotoInput value={value} onChange={onChange} />;
  }
}

function PhotoInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const upload = async (file: File) => {
    setState("uploading");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("date", new Date().toISOString().slice(0, 10));
    fd.append("pose", "front");
    try {
      const res = await fetch("/api/progress/photos", { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) throw new Error();
      setState("idle");
      onChange(true);
    } catch {
      setState("error");
    }
  };
  return (
    <div className="space-y-3">
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <Button type="button" variant="secondary" block size="lg" loading={state === "uploading"} onClick={() => ref.current?.click()}>{value === true ? "✓ عکس ذخیره شد — انتخاب عکس دیگر" : "انتخاب عکس"}</Button>
      {state === "error" && <p className="text-sm text-rose-600">بارگذاری ناموفق بود. می‌توانید این مرحله را رد کنید و بعداً از صفحه پیشرفت عکس اضافه کنید.</p>}
    </div>
  );
}
