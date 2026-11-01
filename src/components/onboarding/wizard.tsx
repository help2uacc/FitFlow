"use client";
/**
 * One-question-per-screen onboarding interview with auto-save and resume.
 * Each "Continue" persists the answer server-side immediately.
 */
import { useMemo, useState } from "react";
import { CATEGORIES, QUESTIONS, isVisible, type Answers, type Question } from "@/domain/onboarding/questions";
import { validateAnswer } from "@/domain/onboarding/validate";
import { api, ApiError } from "@/lib/client";
import { Alert, Badge, Button, Card, ProgressBar } from "@/components/ui";
import { QuestionInput } from "./question-input";

type Phase = { kind: "question"; id: string } | { kind: "summary" } | { kind: "done"; nutritionMode: string; recommended: boolean };

export function Wizard({ initialAnswers, currentQuestionId, name }: { initialAnswers: Answers; currentQuestionId: string | null; name: string }) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const visible = useMemo(() => QUESTIONS.filter((q) => isVisible(q, answers)), [answers]);
  const firstOpen = () => visible.find((q) => !(q.id in answers));
  const [phase, setPhase] = useState<Phase>(() => {
    const resume = currentQuestionId && visible.some((q) => q.id === currentQuestionId) && !(currentQuestionId in initialAnswers) ? currentQuestionId : firstOpen()?.id;
    return resume ? { kind: "question", id: resume } : { kind: "summary" };
  });
  const [draft, setDraft] = useState<unknown>(() => (phase.kind === "question" ? initialAnswers[phase.id] : undefined));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const q = phase.kind === "question" ? QUESTIONS.find((x) => x.id === phase.id)! : null;
  const idx = q ? visible.findIndex((x) => x.id === q.id) : visible.length;
  const answeredCount = visible.filter((x) => x.id in answers).length;

  const goTo = (target: Question | undefined, a: Answers) => {
    if (!target) { setPhase({ kind: "summary" }); return; }
    setPhase({ kind: "question", id: target.id });
    setDraft(a[target.id] ?? (target.type === "slider" ? undefined : undefined));
    setError(null);
  };

  const save = async (value: unknown) => {
    if (!q) return;
    const effective = value === undefined && q.type === "slider" && q.recommended ? Number(q.recommended) : value;
    const local = validateAnswer(q, effective);
    if (!local.ok) { setError(local.error); return; }
    setSaving(true);
    setError(null);
    const nextAnswers = { ...answers, [q.id]: local.value };
    const nextVisible = QUESTIONS.filter((x) => isVisible(x, nextAnswers));
    const pos = nextVisible.findIndex((x) => x.id === q.id);
    const next = nextVisible.slice(pos + 1).find((x) => !(x.id in nextAnswers)) ?? nextVisible.find((x) => !(x.id in nextAnswers));
    try {
      await api("/api/onboarding/answers", { method: "PUT", body: { questionId: q.id, value: local.value, nextQuestionId: next?.id ?? null } });
      setAnswers(nextAnswers);
      goTo(next, nextAnswers);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ذخیره نشد؛ دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (phase.kind === "summary") return goTo(visible[visible.length - 1], answers);
    if (idx > 0) goTo(visible[idx - 1], answers);
  };

  const complete = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ nutritionMode: string; recommended: boolean }>("/api/onboarding/complete", { method: "POST" });
      setPhase({ kind: "done", ...r });
    } catch (e) {
      const missing = e instanceof ApiError ? (e.details as { missing?: string[] } | undefined)?.missing : undefined;
      if (missing?.length) goTo(QUESTIONS.find((x) => x.id === missing[0]), answers);
      setError(e instanceof ApiError ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    setSaving(true);
    try {
      await api("/api/programs/initial", { method: "POST" });
    } catch { /* dashboard shows state */ }
    window.location.href = "/dashboard";
  };

  if (phase.kind === "done") {
    return (
      <Card className="space-y-4 text-center">
        <div className="text-4xl">🎉</div>
        <h1 className="text-xl font-extrabold">پروفایل شما کامل شد</h1>
        <p className="text-slate-600 dark:text-slate-300">از این به بعد لازم نیست پرسشنامه را تکرار کنید؛ هر بخش را می‌توانید از پروفایل ویرایش کنید.</p>
        {phase.recommended && <Alert tone="info">بر اساس هدف شما، گزینه پیشنهادی تغذیه: {phase.nutritionMode === "full" ? "برنامه غذایی کامل" : "راهنمای کلی تغذیه"}</Alert>}
        <Button size="lg" block onClick={generate} loading={saving}>ساخت اولین برنامه من</Button>
      </Card>
    );
  }

  if (phase.kind === "summary") {
    const groups = Object.entries(CATEGORIES).map(([cid, label]) => ({ label, items: visible.filter((x) => x.category === cid && x.type !== "photo") })).filter((g) => g.items.length);
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold">{name} عزیز، خلاصه پاسخ‌ها</h1>
        <p className="text-sm text-slate-500">قبل از ساخت برنامه، پاسخ‌ها را مرور کنید. برای اصلاح روی هر مورد بزنید.</p>
        {error && <Alert tone="error">{error}</Alert>}
        {groups.map((g) => (
          <Card key={g.label}>
            <h2 className="mb-2 font-bold">{g.label}</h2>
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              {g.items.map((x) => (
                <button key={x.id} type="button" onClick={() => goTo(x, answers)} className="flex w-full items-start justify-between gap-3 py-2 text-right text-sm">
                  <dt className="text-slate-500">{x.title}</dt>
                  <dd className="font-medium">{formatAnswer(x, answers[x.id])}</dd>
                </button>
              ))}
            </dl>
          </Card>
        ))}
        <div className="sticky bottom-0 flex gap-2 bg-slate-50/90 py-3 backdrop-blur dark:bg-slate-950/90">
          <Button variant="secondary" onClick={back}>بازگشت</Button>
          <Button className="flex-1" size="lg" onClick={complete} loading={saving}>تأیید و ادامه</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[85dvh] flex-col">
      <div className="mb-6 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <Badge tone="brand">{CATEGORIES[q!.category]}</Badge>
          <span className="num text-slate-500">{(idx + 1).toLocaleString("fa-IR")} / {visible.length.toLocaleString("fa-IR")}</span>
        </div>
        <ProgressBar value={answeredCount} max={visible.length} label="پیشرفت پرسشنامه" />
      </div>
      <div className="flex-1 space-y-4">
        <h1 className="text-2xl leading-snug font-extrabold">{q!.title}</h1>
        {q!.help && <p className="text-sm text-slate-500 dark:text-slate-400">{q!.help}</p>}
        <QuestionInput key={q!.id} q={q!} value={draft} onChange={(v) => { setDraft(v); setError(null); }} autoFocus />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
      <div className="safe-bottom sticky bottom-0 mt-6 flex items-center gap-2 bg-slate-50/90 py-3 backdrop-blur dark:bg-slate-950/90">
        <Button variant="secondary" onClick={back} disabled={idx === 0}>قبلی</Button>
        {q!.optional && <Button variant="ghost" onClick={() => save(null)} disabled={saving}>رد کردن</Button>}
        <Button className="flex-1" size="lg" onClick={() => save(draft)} loading={saving}>ادامه</Button>
      </div>
      <p className="mt-1 text-center text-xs text-slate-400">پاسخ‌ها خودکار ذخیره می‌شوند؛ هر زمان برگردید، از همین‌جا ادامه می‌دهید.</p>
    </div>
  );
}

export function formatAnswer(q: Question, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (q.type === "single") return q.options?.find((o) => o.value === v)?.label ?? String(v);
  if (q.type === "multi" || q.type === "rank") return (v as string[]).map((x) => q.options?.find((o) => o.value === x)?.label ?? x).join("، ") || "—";
  if (q.type === "yesno" || q.type === "photo") return v ? "بله" : "خیر";
  if (typeof v === "number") return `${v.toLocaleString("fa-IR")}${q.unit ? " " + q.unit : ""}`;
  return String(v);
}
