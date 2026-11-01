"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type JobView } from "@/lib/client";
import { JobStatus } from "@/components/job-status";
import { Alert, Button, Textarea, cx } from "@/components/ui";
import { AnalysisView } from "@/components/progress/analysis";
import type { ProgressAnalysis } from "@/components/progress/types";

type Action =
  | { type: "workout_preview" | "nutrition_preview"; requestId: string; mode: "instant" | "ai"; jobId?: string }
  | { type: "navigate"; href: string; label: string }
  | { type: "ai_job"; jobId: string }
  | { type: "none" };
interface CoachResponse { reply: string; action: Action; intent?: string | null; source?: string }
type Msg =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "coach"; text: string; action?: Action; analysis?: ProgressAnalysis; error?: boolean; resolved?: boolean };

const EXAMPLES = [
  "می‌خوام روزانه ۲۰۰ کالری بیشتر بخورم.",
  "کالری برنامه‌ام رو کمتر کن.",
  "حجم غذام زیاده، ولی پروتئینم کم نشه.",
  "می‌خوام برنامه‌ام سنگین‌تر بشه.",
  "ست‌های بیشتری برای سرشانه بگذار.",
  "برنامه رو طوری تغییر بده که ۴۵ دقیقه‌ای تموم بشه.",
  "هفته‌ای ۵ روز می‌خوام ورزش کنم.",
  "تمرین روز سوم رو سبک‌تر کن.",
  "برای شام امشب یه جایگزین کم‌کالری بده.",
  "با توجه به پیشرفتم برنامه‌ام رو اصلاح کن.",
];
const KEY = "ff-coach-chat";
const mid = () => Math.random().toString(36).slice(2);

function ActionView({ action, onJobDone }: { action: Action; onJobDone: (j: JobView) => void }) {
  if (action.type === "workout_preview" || action.type === "nutrition_preview") {
    const href = `/program/adjust?request=${action.requestId}${action.type === "nutrition_preview" ? "&tab=nutrition" : ""}`;
    return (
      <div className="mt-2 space-y-2">
        {action.mode === "ai" && action.jobId && <JobStatus jobId={action.jobId} title="طراحی اصلاحیه" />}
        <Link href={href} className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">مشاهده پیش‌نمایش و تأیید</Link>
      </div>
    );
  }
  if (action.type === "navigate") return <Link href={action.href} className="mt-2 inline-flex h-10 items-center rounded-xl bg-brand-50 px-4 text-sm font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">{action.label} ←</Link>;
  if (action.type === "ai_job") return <div className="mt-2"><JobStatus jobId={action.jobId} title="پاسخ مربی" onDone={onJobDone} /></div>;
  return null;
}

export function CoachChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try { const s = sessionStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const update = (id: string, patch: Partial<Extract<Msg, { role: "coach" }>>) => setMsgs((m) => m.map((x) => (x.id === id && x.role === "coach" ? { ...x, ...patch } : x)));

  const onJobDone = (msgId: string) => async (j: JobView) => {
    if (j.status !== "completed") return;
    if (j.type === "coach") {
      try {
        const r = await api<CoachResponse>("/api/coach/resolve", { body: { jobId: j.id } });
        update(msgId, { text: r.reply, action: r.action, resolved: true });
      } catch (e) { update(msgId, { text: (e as Error).message, action: { type: "none" }, error: true }); }
    } else if (j.type === "analyze_progress") {
      update(msgId, { analysis: j.result as ProgressAnalysis, action: { type: "none" }, text: "نتیجه تحلیل پیشرفت شما:" });
    }
  };

  const send = async (t: string) => {
    const q = t.trim();
    if (!q || busy) return;
    setText("");
    const cid = mid();
    setMsgs((m) => [...m, { id: mid(), role: "user", text: q }, { id: cid, role: "coach", text: "…" }]);
    setBusy(true);
    try {
      const r = await api<CoachResponse>("/api/coach", { body: { text: q } });
      update(cid, { text: r.reply, action: r.action });
    } catch (e) {
      update(cid, { text: (e as Error).message, error: true });
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-3">
      {msgs.length === 0 && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-300">درخواستتان را به فارسی بنویسید. تغییرات کلی برنامه همیشه ابتدا به‌صورت پیش‌نمایش نشان داده می‌شوند و فقط با تأیید شما اعمال می‌شوند.</p>
        </div>
      )}
      <div className="space-y-3" aria-live="polite">
        {msgs.map((m) => m.role === "user" ? (
          <div key={m.id} className="mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-brand-600 px-4 py-2.5 text-white">{m.text}</div>
        ) : (
          <div key={m.id} className={cx("ml-auto max-w-[92%] rounded-2xl rounded-br-md px-4 py-3 ring-1", m.error ? "bg-rose-50 ring-rose-200 dark:bg-rose-950/40 dark:ring-rose-900" : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-800")}>
            <div className="whitespace-pre-line leading-7">{m.text}</div>
            {m.analysis && <div className="mt-2"><AnalysisView a={m.analysis} /></div>}
            {m.action && <ActionView action={m.action} onJobDone={onJobDone(m.id)} />}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} disabled={busy} className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">{e}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="sticky bottom-20 flex items-end gap-2 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-slate-200 lg:bottom-4 dark:bg-slate-900 dark:ring-slate-800">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={2} className="min-h-12 flex-1 ring-0" placeholder="مثلاً: تمرین پا خیلی خسته‌ام می‌کنه" aria-label="پیام به مربی"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
        <Button type="submit" loading={busy} disabled={!text.trim()}>ارسال</Button>
      </form>
      {msgs.length > 0 && <button className="self-center text-xs text-slate-500" onClick={() => setMsgs([])}>پاک کردن گفتگو</button>}
      <Alert tone="info">مربی فقط اقدامات مجاز برنامه (تنظیم کالری، سختی، روزها، مدت، جایگزینی و …) را پیشنهاد می‌دهد و هیچ تغییری بدون تأیید شما اعمال نمی‌شود.</Alert>
    </div>
  );
}
