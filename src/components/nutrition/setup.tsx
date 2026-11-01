"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QUESTION_BY_ID, CATEGORIES } from "@/domain/onboarding/questions";
import { api, ApiError } from "@/lib/client";
import { Alert, Button, Card, CardHeader, Input, ProgressBar, Textarea, cx, faNum } from "@/components/ui";
import { JobStatus } from "@/components/job-status";

type Mode = "none" | "full" | "guidance";
const MODES: { value: Mode; title: string; desc: string }[] = [
  { value: "full", title: "برنامه غذایی کامل", desc: "منوی هفت‌روزه با مقادیر، فهرست خرید، ثبت یک‌لمسی و هماهنگی با تمرین." },
  { value: "guidance", title: "فقط راهنمای کلی", desc: "کالری، پروتئین و آب تخمینی روزانه بدون منوی دقیق." },
  { value: "none", title: "بدون برنامه غذایی", desc: "فقط برنامه تمرینی. برنامه‌ها و ثبت‌های قبلی حفظ می‌شوند." },
];

export function NutritionSetup({ currentMode, hasPlan, initialMissing, pendingJobId }: { currentMode: Mode; hasPlan: boolean; initialMissing: string[]; pendingJobId: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(currentMode);
  const [missing, setMissing] = useState<string[]>(initialMissing);
  const [step, setStep] = useState(0);
  const [jobId, setJobId] = useState<string | null>(pendingJobId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true); setError(null);
    try { const r = await api<{ job: { id: string } }>("/api/nutrition/plan", { method: "POST" }); setJobId(r.job.id); }
    catch (e) {
      if (e instanceof ApiError && e.code === "nutrition_onboarding") { setMissing((e.details as { missing: string[] }).missing ?? []); setStep(0); }
      else setError(e instanceof ApiError ? e.message : "خطا");
    } finally { setBusy(false); }
  };

  const choose = async (m: Mode) => {
    if (m === "none" && hasPlan && !confirm("برنامه غذایی غیرفعال شود؟ برنامه‌ها و ثبت‌های قبلی در تاریخچه می‌مانند.")) return;
    setBusy(true); setError(null); setSaved(null);
    try {
      const r = await api<{ mode: Mode; missing: string[] }>("/api/nutrition/mode", { body: { mode: m } });
      setMode(r.mode); setMissing(r.missing); setStep(0);
      if (m !== "full") setSaved(m === "none" ? "برنامه غذایی غیرفعال شد." : "حالت راهنمای کلی فعال شد.");
      else if (!r.missing.length && !hasPlan) await generate();
      router.refresh();
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطا"); } finally { setBusy(false); }
  };

  if (jobId) return <JobStatus jobId={jobId} title="تولید برنامه غذایی" onDone={(j) => { if (j.status === "completed") router.push("/program/nutrition"); }} />;

  if (mode === "full" && missing.length > 0) {
    return <MiniWizard ids={missing} step={step} setStep={setStep} onDone={() => { setMissing([]); void generate(); }} />;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">{saved}</Alert>}
      {MODES.map((m) => (
        <Card key={m.value} className={cx(mode === m.value && "ring-2 ring-brand-500")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">{m.title}{mode === m.value ? " ✓" : ""}</h2>
              <p className="mt-1 text-sm text-slate-500">{m.desc}</p>
            </div>
            {mode !== m.value && <Button size="sm" variant={m.value === "full" ? "primary" : "secondary"} loading={busy} onClick={() => choose(m.value)}>انتخاب</Button>}
          </div>
        </Card>
      ))}
      {mode === "full" && !hasPlan && (
        <Card>
          <CardHeader title="آماده ساخت برنامه غذایی" subtitle="پاسخ‌های تغذیه‌ای شما کامل است." />
          <Button loading={busy} onClick={generate}>ساخت برنامه غذایی</Button>
        </Card>
      )}
    </div>
  );
}

function MiniWizard({ ids, step, setStep, onDone }: { ids: string[]; step: number; setStep: (n: number) => void; onDone: () => void }) {
  const q = QUESTION_BY_ID.get(ids[step]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = q ? values[q.id] ?? (q.type === "multi" ? [] : q.recommended ?? (q.type === "time" ? "" : undefined)) : undefined;
  const set = (v: unknown) => q && setValues({ ...values, [q.id]: v });
  const canNext = !q ? false : q.optional ? true : Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "";
  if (!q) return null;
  const save = async (v: unknown) => {
    setBusy(true); setError(null);
    try {
      await api("/api/onboarding/answers", { method: "PUT", body: { questionId: q.id, value: v } });
      if (step + 1 >= ids.length) onDone(); else setStep(step + 1);
    } catch (e) { setError(e instanceof ApiError ? e.message : "ذخیره ناموفق بود."); } finally { setBusy(false); }
  };
  const opts = q.options ?? [];
  return (
    <Card>
      <div className="mb-3 space-y-1" data-qid={q.id}>
        <div className="flex justify-between text-xs text-slate-500"><span>{CATEGORIES[q.category]}</span><span className="num">{faNum(step + 1)} از {faNum(ids.length)}</span></div>
        <ProgressBar value={step} max={ids.length} label="پیشرفت" />
      </div>
      <h2 className="text-lg font-bold">{q.title}</h2>
      {q.help && <p className="mt-1 text-sm text-slate-500">{q.help}</p>}
      {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      <div className="mt-4 space-y-2">
        {q.type === "single" && opts.map((o) => (
          <button key={o.value} onClick={() => set(o.value)} aria-pressed={value === o.value}
            className={cx("flex w-full items-center justify-between rounded-xl px-4 py-3 text-right ring-1", value === o.value ? "bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/40" : "ring-slate-200 dark:ring-slate-700")}>
            <span>{o.label}</span>{q.recommended === o.value && <span className="text-xs text-brand-700 dark:text-brand-300">پیشنهادی</span>}
          </button>
        ))}
        {q.type === "multi" && opts.map((o) => {
          const arr = (value as string[]) ?? [];
          const on = arr.includes(o.value);
          const toggle = () => {
            let next = on ? arr.filter((x) => x !== o.value) : [...arr, o.value];
            if (q.exclusive) next = o.value === q.exclusive && !on ? [q.exclusive] : next.filter((x) => x !== q.exclusive || o.value === q.exclusive);
            set(next);
          };
          return (
            <button key={o.value} onClick={toggle} aria-pressed={on} className={cx("flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right ring-1", on ? "bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/40" : "ring-slate-200 dark:ring-slate-700")}>
              <span className={cx("grid size-5 place-items-center rounded border", on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300")}>{on ? "✓" : ""}</span>{o.label}
            </button>
          );
        })}
        {q.type === "yesno" && (
          <div className="grid grid-cols-2 gap-2">
            {[{ v: true, l: "بله" }, { v: false, l: "خیر" }].map((o) => (
              <button key={o.l} onClick={() => set(o.v)} aria-pressed={value === o.v} className={cx("rounded-xl py-3 ring-1", value === o.v ? "bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/40" : "ring-slate-200 dark:ring-slate-700")}>{o.l}</button>
            ))}
          </div>
        )}
        {q.type === "time" && <Input type="time" dir="ltr" value={(value as string) ?? ""} onChange={(e) => set(e.target.value)} aria-label={q.title} />}
        {q.type === "text" && <Textarea value={(value as string) ?? ""} onChange={(e) => set(e.target.value)} aria-label={q.title} maxLength={1000} />}
      </div>
      <div className="mt-5 flex gap-2">
        <Button block loading={busy} disabled={!canNext} onClick={() => save(value === undefined || (Array.isArray(value) && !value.length) ? null : value)}>{step + 1 >= ids.length ? "پایان و ساخت برنامه" : "ادامه"}</Button>
        {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>قبلی</Button>}
      </div>
    </Card>
  );
}
