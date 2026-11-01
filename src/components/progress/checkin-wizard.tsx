"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Alert, Button, Card, ProgressBar, Textarea, cx } from "@/components/ui";

type Key = "workoutDifficulty" | "recovery" | "consistency" | "pain" | "appetite" | "energy" | "dietAdherence" | "scheduleChanged";
interface Q { key: Key; title: string; kind: "scale" | "yesno"; labels?: [string, string]; nutritionOnly?: boolean }
const QS: Q[] = [
  { key: "workoutDifficulty", title: "تمرینات این هفته چقدر سخت بود؟", kind: "scale", labels: ["خیلی آسان", "خیلی سخت"] },
  { key: "recovery", title: "ریکاوری بین جلسات چطور بود؟", kind: "scale", labels: ["خیلی ضعیف", "عالی"] },
  { key: "consistency", title: "چقدر طبق برنامه تمرین کردید؟", kind: "scale", labels: ["تقریباً هیچ", "کامل"] },
  { key: "pain", title: "درد یا ناراحتی هنگام تمرین داشتید؟", kind: "yesno" },
  { key: "appetite", title: "اشتهای شما چطور بود؟", kind: "scale", labels: ["خیلی کم", "خیلی زیاد"] },
  { key: "energy", title: "سطح انرژی روزانه؟", kind: "scale", labels: ["خیلی پایین", "خیلی بالا"] },
  { key: "dietAdherence", title: "چقدر برنامه غذایی را رعایت کردید؟", kind: "scale", labels: ["اصلاً", "کامل"], nutritionOnly: true },
  { key: "scheduleChanged", title: "برنامه زمانی شما تغییر کرده است؟", kind: "yesno" },
];
type Answers = Partial<Record<Key, number | boolean | null>>;

export function CheckinWizard({ today, nutritionEnabled }: { today: string; nutritionEnabled: boolean }) {
  const qs = QS.filter((q) => !q.nutritionOnly || nutritionEnabled);
  const [i, setI] = useState(0);
  const [a, setA] = useState<Answers>({});
  const [painNotes, setPainNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const atEnd = i >= qs.length;
  const q = qs[i];
  const next = () => setI((x) => x + 1);
  const set = (v: number | boolean | null) => { setA({ ...a, [q.key]: v }); if (!(q.key === "pain" && v === true)) setTimeout(next, 150); };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/api/checkins", { body: { date: today, ...a, painNotes: a.pain ? painNotes || null : null, notes: notes || null } });
      setDone(true);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (done) {
    const tips: { text: string; href?: string; label?: string }[] = [];
    if (a.pain) tips.push({ text: "درد گزارش کردید؛ پیشنهاد می‌شود شدت را موقتاً کم کنید یا حرکت آزاردهنده را جایگزین کنید. اگر درد تیز یا پایدار است، ارزیابی توسط متخصص توصیه می‌شود.", href: "/program/adjust", label: "سبک‌تر کردن برنامه" });
    if (typeof a.recovery === "number" && a.recovery <= 2) tips.push({ text: "ریکاوری ضعیف بوده؛ یک هفته سبک (دیلود) با حجم کمتر می‌تواند کمک کند. خواب و تغذیه را هم بررسی کنید.", href: "/program/adjust", label: "هفته سبک‌تر" });
    if (typeof a.workoutDifficulty === "number" && a.workoutDifficulty <= 2 && !a.pain && Number(a.recovery ?? 3) >= 3) tips.push({ text: "تمرینات آسان بوده و ریکاوری خوب است؛ آماده افزایش تدریجی چالش هستید.", href: "/program/adjust", label: "کمی سخت‌تر" });
    if (typeof a.consistency === "number" && a.consistency <= 2) tips.push({ text: "انجام برنامه سخت بوده؛ شاید جلسات کوتاه‌تر یا روزهای کمتر واقع‌بینانه‌تر باشد.", href: "/program/adjust", label: "تنظیم زمان و روزها" });
    if (typeof a.appetite === "number" && a.appetite >= 4 && nutritionEnabled) tips.push({ text: "اشتها زیاد بوده؛ غذاهای حجیم‌تر و پرپروتئین‌تر می‌توانند کمک کنند.", href: "/coach", label: "درخواست از مربی" });
    if (a.scheduleChanged) tips.push({ text: "برنامه زمانی تغییر کرده؛ روزها و مدت تمرین را در پروفایل به‌روز کنید.", href: "/profile", label: "پروفایل" });
    return (
      <Card className="space-y-3">
        <Alert tone="success" title="چک‌این ثبت شد">پاسخ‌ها در پیشنهادهای بعدی برنامه استفاده می‌شوند.</Alert>
        {tips.length ? tips.map((t, k) => (
          <div key={k} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">{t.text}{t.href && <Link className="mr-1 font-medium text-brand-700 dark:text-brand-300" href={t.href}>{t.label} ←</Link>}</div>
        )) : <p className="text-sm text-slate-600 dark:text-slate-300">همه چیز روبه‌راه است؛ با همین روند ادامه دهید.</p>}
        <div className="flex gap-2"><Link href="/dashboard" className="text-sm text-brand-700 dark:text-brand-300">بازگشت به خانه</Link></div>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500"><span>چک‌این هفتگی</span><span className="num">{Math.min(i + 1, qs.length + 1).toLocaleString("fa-IR")} / {(qs.length + 1).toLocaleString("fa-IR")}</span></div>
        <ProgressBar value={i} max={qs.length + 1} label="پیشرفت چک‌این" />
      </div>
      {!atEnd ? (
        <>
          <h2 className="text-lg font-bold">{q.title}</h2>
          {q.kind === "scale" ? (
            <div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button key={v} onClick={() => set(v)} className={cx("h-14 rounded-xl text-lg font-bold ring-1", a[q.key] === v ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800")}>{v.toLocaleString("fa-IR")}</button>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-slate-500"><span>{q.labels?.[0]}</span><span>{q.labels?.[1]}</span></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[[true, "بله"], [false, "خیر"]].map(([v, l]) => (
                <button key={String(v)} onClick={() => set(v as boolean)} className={cx("h-14 rounded-xl font-bold ring-1", a[q.key] === v ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300 dark:ring-slate-700")}>{l as string}</button>
              ))}
            </div>
          )}
          {q.key === "pain" && a.pain === true && (
            <div className="space-y-2">
              <Textarea value={painNotes} onChange={(e) => setPainNotes(e.target.value)} maxLength={500} placeholder="کجا و هنگام کدام حرکت؟ (اختیاری)" aria-label="توضیح درد" />
              <Button onClick={next} block>ادامه</Button>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>قبلی</Button>
            <Button variant="ghost" size="sm" onClick={() => { setA({ ...a, [q.key]: null }); next(); }}>رد کردن</Button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold">نکته دیگری هست؟ (اختیاری)</h2>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="هر چیزی که مربی باید بداند…" aria-label="یادداشت" />
          {err && <Alert tone="error">{err}</Alert>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setI(i - 1)}>قبلی</Button>
            <Button onClick={submit} loading={busy} className="flex-1">ثبت چک‌این</Button>
          </div>
        </>
      )}
    </Card>
  );
}
