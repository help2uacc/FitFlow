"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, type JobView } from "@/lib/client";
import { JobStatus } from "@/components/job-status";
import { Alert, Button, Card, CardHeader, Textarea, cx, faNum } from "@/components/ui";

const CHOICES = [
  { v: "ai", l: "هوش مصنوعی بر اساس پیشرفتم تصمیم بگیرد" }, { v: "maintain", l: "همین برنامه را ادامه بده (دوره جدید)" },
  { v: "harder", l: "چالش بیشتر" }, { v: "easier", l: "سبک‌تر" }, { v: "prioritize", l: "اولویت به عضله دیگر" },
  { v: "frequency", l: "تغییر تعداد روزهای تمرین" }, { v: "calories", l: "تنظیم کالری تغذیه" },
] as const;
const AREAS = [["chest", "سینه"], ["back", "پشت"], ["shoulders", "سرشانه"], ["arms", "بازو"], ["abs", "شکم"], ["glutes", "باسن"], ["legs", "پا"]] as const;

export function RenewForm({ pendingJobId, nutritionActive, initialChoice }: { pendingJobId: string | null; nutritionActive: boolean; initialChoice: string | null }) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>(CHOICES.some((c) => c.v === initialChoice) ? initialChoice! : "ai");
  const [focus, setFocus] = useState<string[]>([]);
  const [days, setDays] = useState(4);
  const [cal, setCal] = useState(150);
  const [weeks, setWeeks] = useState(4);
  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string | null>(pendingJobId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const body: Record<string, unknown> = { choice, weeks };
      if (choice === "prioritize") body.muscleFocus = focus;
      if (choice === "frequency") body.daysPerWeek = days;
      if (choice === "calories") body.calorieDelta = cal;
      if (text.trim()) body.text = text.trim();
      const r = await api<{ mode: "instant" | "ai"; jobId?: string; versionId?: string }>("/api/programs/renew", { body });
      if (r.mode === "instant") { router.push("/program/workout"); router.refresh(); } else setJobId(r.jobId!);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطا");
      const jid = e instanceof ApiError ? (e.details as { jobId?: string } | undefined)?.jobId : undefined;
      if (jid) setJobId(jid);
    } finally { setBusy(false); }
  };
  const extend = async (w: number) => {
    setBusy(true); setError(null);
    try { await api("/api/programs/extend", { body: { weeks: w } }); router.push("/dashboard"); router.refresh(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "خطا"); } finally { setBusy(false); }
  };
  const onDone = (j: JobView) => {
    const vid = (j.result as { versionId?: string } | null)?.versionId;
    if (j.status === "completed" && vid) router.push(`/program/review/${vid}`);
  };

  if (jobId) return <JobStatus jobId={jobId} title="طراحی برنامه دوره بعد" onDone={onDone} />;
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <CardHeader title="برنامه دوره بعد" subtitle="برنامه فعلی تا تأیید برنامه جدید فعال می‌ماند." />
        <div role="radiogroup" className="grid gap-2">
          {CHOICES.filter((c) => c.v !== "calories" || nutritionActive).map((c) => (
            <button key={c.v} type="button" role="radio" aria-checked={choice === c.v} onClick={() => setChoice(c.v)}
              className={cx("min-h-12 rounded-xl px-4 text-right text-sm font-medium ring-1", choice === c.v ? "bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-900/40" : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700")}>{c.l}</button>
          ))}
        </div>
        {choice === "prioritize" && (
          <div className="flex flex-wrap gap-2">{AREAS.map(([v, l]) => <button key={v} type="button" aria-pressed={focus.includes(v)} onClick={() => setFocus(focus.includes(v) ? focus.filter((x) => x !== v) : [...focus, v].slice(0, 3))} className={cx("min-h-10 rounded-full px-3 text-sm ring-1", focus.includes(v) ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-200 dark:ring-slate-700")}>{l}</button>)}</div>
        )}
        {choice === "frequency" && <div className="flex gap-2">{[2, 3, 4, 5, 6].map((d) => <Button key={d} variant={days === d ? "primary" : "secondary"} onClick={() => setDays(d)}>{faNum(d)} روز</Button>)}</div>}
        {choice === "calories" && <div className="flex flex-wrap gap-2">{[-300, -150, 150, 300].map((d) => <Button key={d} variant={cal === d ? "primary" : "secondary"} onClick={() => setCal(d)}>{d > 0 ? "+" : "−"}{faNum(Math.abs(d))}</Button>)}</div>}
        <div className="space-y-1"><div className="text-sm font-semibold">طول دوره</div><div className="flex gap-2">{[4, 5, 6].map((w) => <Button key={w} size="sm" variant={weeks === w ? "primary" : "secondary"} onClick={() => setWeeks(w)}>{faNum(w)} هفته</Button>)}</div></div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="توضیح اختیاری برای دوره بعد" maxLength={1000} />
        <p className="text-xs text-slate-500">می‌خواهید هدف را عوض کنید؟ ابتدا <Link className="underline" href="/profile?section=goals">اهداف را در پروفایل تغییر دهید</Link>.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Button block size="lg" onClick={submit} loading={busy} disabled={choice === "prioritize" && !focus.length}>ساخت برنامه دوره بعد</Button>
      </Card>
      <Card>
        <CardHeader title="تمدید دوره فعلی" subtitle="همان برنامه با تاریخ پایان دیرتر" />
        <div className="flex gap-2"><Button variant="secondary" onClick={() => extend(1)} disabled={busy}>+۱ هفته</Button><Button variant="secondary" onClick={() => extend(2)} disabled={busy}>+۲ هفته</Button></div>
      </Card>
    </div>
  );
}
