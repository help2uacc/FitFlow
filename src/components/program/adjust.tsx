"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type JobView } from "@/lib/client";
import { JobStatus } from "@/components/job-status";
import { Alert, Badge, Button, Card, CardHeader, Stat, Textarea, cx, faNum } from "@/components/ui";

type WorkoutInfo = { days: number; split: string; difficulty: number; title: string; minutes: number; goal: string | null };
type NutritionInfo = { kcal: number; proteinG: number; carbsG: number; fatG: number; goal: string | null; mealsPerDay: number } | null;
type Macro = { kcal: number; proteinG: number; carbsG: number; fatG: number };

type WorkoutPreview = { requestId: string; mode: "instant"; preview: { diff: { lines: string[] }; notes: string[]; warnings: string[] } } | { requestId: string; mode: "ai"; jobId: string };
type NutritionPreview = { requestId: string; mode: "instant"; preview: { current: Macro; requested: number | null; proposed: Macro; clamped: boolean; warnings: string[]; effects: string[]; recommendation: { delta: number; reason: string } | null; diff: { lines: string[] } } } | { requestId: string; mode: "ai"; jobId: string };

const DIFF = [
  { v: -2, l: "خیلی سبک‌تر" }, { v: -1, l: "کمی سبک‌تر" }, { v: 0, l: "همین سطح" }, { v: 1, l: "کمی سخت‌تر" }, { v: 2, l: "خیلی سخت‌تر" },
];
const AREAS = [["chest", "سینه"], ["back", "پشت"], ["shoulders", "سرشانه"], ["arms", "بازو"], ["abs", "شکم"], ["glutes", "باسن"], ["legs", "پا"], ["calves", "ساق"]] as const;

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T | null; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cx("min-h-11 rounded-xl px-3 text-sm font-medium ring-1", value === o.v ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700")}>{o.l}</button>
      ))}
    </div>
  );
}

export function AdjustTabs({ initialTab, requestId, workout, nutrition }: { initialTab: "workout" | "nutrition"; requestId: string | null; workout: WorkoutInfo; nutrition: NutritionInfo }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="space-y-4">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
        {(["workout", "nutrition"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("h-11 rounded-xl text-sm font-semibold", tab === t ? "bg-white shadow dark:bg-slate-900" : "text-slate-500")}>
            {t === "workout" ? "تنظیمات تمرین" : "تنظیمات تغذیه"}
          </button>
        ))}
      </div>
      {requestId && <ExistingRequest id={requestId} />}
      {tab === "workout" ? <WorkoutTab info={workout} /> : <NutritionTab info={nutrition} />}
    </div>
  );
}

function ExistingRequest({ id }: { id: string }) {
  const router = useRouter();
  const [r, setR] = useState<{ domain: string; status: string; aiJobId: string | null; resultVersionId: string | null; view: { reason?: string; diff?: { lines: string[] } | null; notes?: string[]; warnings?: string[]; current?: Macro | null; proposed?: Macro } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<typeof r>(`/api/adjust/requests/${id}`).then(setR).catch(() => setMsg("درخواست پیدا نشد."));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (msg) return <Alert tone="error">{msg}</Alert>;
  if (!r) return null;
  if (r.status === "generating" && r.aiJobId) return <JobStatus jobId={r.aiJobId} title="آماده‌سازی پیشنهاد" onDone={() => load()} />;
  if (r.status === "ready" && r.resultVersionId) {
    return <Alert tone="info" title="پیش‌نویس آماده است"><Link className="font-semibold underline" href={r.domain === "workout" ? `/program/review/${r.resultVersionId}` : `/program/review-nutrition/${r.resultVersionId}`}>مشاهده و تأیید</Link></Alert>;
  }
  if (r.status !== "previewed" || !r.view) return <Alert tone="info">وضعیت درخواست: {r.status === "applied" ? "اعمال شد" : r.status === "rejected" ? "رد شد" : r.status}</Alert>;
  const act = async (a: "confirm" | "reject") => {
    setBusy(true);
    try { await api(`/api/adjust/requests/${id}/${a}`, { method: "POST" }); router.push(a === "confirm" ? (r.domain === "workout" ? "/program/workout" : "/program/nutrition") : "/program/adjust"); router.refresh(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : "خطا"); }
    finally { setBusy(false); }
  };
  return (
    <Card className="ring-2 ring-brand-300">
      <CardHeader title="پیش‌نمایش درخواست مربی" subtitle={r.view.reason} />
      {r.view.current && r.view.proposed && <MacroCompare current={r.view.current} proposed={r.view.proposed} />}
      <DiffList lines={r.view.diff?.lines ?? []} notes={r.view.notes} warnings={r.view.warnings} />
      <ConfirmBar busy={busy} onConfirm={() => act("confirm")} onCancel={() => act("reject")} />
    </Card>
  );
}

function DiffList({ lines, notes, warnings }: { lines: string[]; notes?: string[]; warnings?: string[] }) {
  return (
    <div className="space-y-2">
      {warnings?.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
      {notes?.length ? <ul className="list-disc space-y-1 pr-5 text-sm">{notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
      {lines.length ? (
        <div>
          <div className="mb-1 text-sm font-semibold">تغییرات (قبل ← بعد)</div>
          <ul className="space-y-1 text-sm">{lines.map((l) => <li key={l} className="num rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800/60">{l}</li>)}</ul>
        </div>
      ) : <p className="text-sm text-slate-500">تغییر محسوسی در برنامه ایجاد نمی‌شود.</p>}
    </div>
  );
}

function ConfirmBar({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mt-4 flex gap-2">
      <Button className="flex-1" onClick={onConfirm} loading={busy}>اعمال تغییرات</Button>
      <Button variant="secondary" onClick={onCancel} disabled={busy}>انصراف</Button>
    </div>
  );
}

function WorkoutTab({ info }: { info: WorkoutInfo }) {
  const router = useRouter();
  const [delta, setDelta] = useState<number>(0);
  const [recommend, setRecommend] = useState(false);
  const [days, setDays] = useState(info.days);
  const [minutes, setMinutes] = useState(info.minutes);
  const [emphasis, setEmphasis] = useState<"" | "strength" | "hypertrophy">("");
  const [focus, setFocus] = useState<string[]>([]);
  const [cardio, setCardio] = useState<"" | "add" | "reduce">("");
  const [text, setText] = useState("");
  const [res, setRes] = useState<WorkoutPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = async () => {
    setBusy(true); setError(null); setRes(null);
    try {
      const body: Record<string, unknown> = { source: "controls" };
      if (recommend) body.recommend = true; else if (delta) body.difficultyDelta = delta;
      if (days !== info.days) body.daysPerWeek = days;
      if (Math.abs(minutes - info.minutes) >= 5) body.sessionMinutes = minutes;
      if (emphasis) body.emphasis = emphasis;
      if (focus.length) body.muscleFocus = focus;
      if (cardio) body.cardio = cardio;
      if (text.trim()) body.text = text.trim();
      setRes(await api<WorkoutPreview>("/api/adjust/workout", { body }));
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطا"); }
    finally { setBusy(false); }
  };
  const act = async (a: "confirm" | "reject") => {
    if (!res) return;
    setBusy(true);
    try {
      await api(`/api/adjust/requests/${res.requestId}/${a}`, { method: "POST" });
      if (a === "confirm") { router.push("/program/workout"); router.refresh(); } else setRes(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطا"); }
    finally { setBusy(false); }
  };
  const onJobDone = async (j: JobView) => {
    if (j.status !== "completed" || !res) return;
    const r = await api<{ resultVersionId: string | null }>(`/api/adjust/requests/${res.requestId}`);
    if (r.resultVersionId) router.push(`/program/review/${r.resultVersionId}`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="وضعیت فعلی" subtitle={info.title} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="روز در هفته" value={faNum(info.days)} /><Stat label="تقسیم‌بندی" value={info.split} />
          <Stat label="سختی" value={`${faNum(info.difficulty)} از ۵`} /><Stat label="مدت جلسه" value={`${faNum(info.minutes)} دقیقه`} />
        </div>
      </Card>
      <Card className="space-y-5">
        <div className="space-y-2">
          <div className="font-semibold">سختی تمرین</div>
          <Seg label="سختی" value={recommend ? null : delta} options={DIFF.map((d) => ({ v: d.v, l: d.l }))} onChange={(v) => { setDelta(v); setRecommend(false); }} />
          <Button size="sm" variant={recommend ? "primary" : "soft"} onClick={() => setRecommend(!recommend)}>پیشنهاد بر اساس پیشرفت من</Button>
          <p className="text-xs text-slate-500">سختی چندبعدی است: تعداد ست، فاصله تا ناتوانی (RIR)، تکرارها، تعداد حرکات و مدت — نه فقط وزنه بیشتر.</p>
        </div>
        <div className="space-y-2">
          <div className="font-semibold">روزهای تمرین در هفته</div>
          <Seg label="روز در هفته" value={days} options={[2, 3, 4, 5, 6].map((d) => ({ v: d, l: faNum(d) }))} onChange={setDays} />
          {days !== info.days && <p className="text-xs text-amber-700 dark:text-amber-300">تغییر تعداد روزها نیاز به بازطراحی با هوش مصنوعی دارد (چند دقیقه).</p>}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between font-semibold"><span>مدت هر جلسه</span><span className="num">{faNum(minutes)} دقیقه</span></div>
          <input type="range" min={20} max={120} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-full" dir="ltr" aria-label="مدت جلسه" />
        </div>
        <div className="space-y-2">
          <div className="font-semibold">تمرکز</div>
          <Seg label="تمرکز" value={emphasis} options={[{ v: "" as const, l: "بدون تغییر" }, { v: "strength" as const, l: "قدرتی‌تر" }, { v: "hypertrophy" as const, l: "حجمی‌تر" }]} onChange={setEmphasis} />
        </div>
        <div className="space-y-2">
          <div className="font-semibold">عضلات اولویت‌دار</div>
          <div className="flex flex-wrap gap-2">
            {AREAS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={focus.includes(v)} onClick={() => setFocus(focus.includes(v) ? focus.filter((x) => x !== v) : focus.length < 3 ? [...focus, v] : focus)}
                className={cx("min-h-10 rounded-full px-3 text-sm ring-1", focus.includes(v) ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700")}>{l}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="font-semibold">هوازی</div>
          <Seg label="هوازی" value={cardio} options={[{ v: "" as const, l: "بدون تغییر" }, { v: "add" as const, l: "بیشتر" }, { v: "reduce" as const, l: "کمتر" }]} onChange={setCardio} />
        </div>
        <div className="space-y-2">
          <div className="font-semibold">درخواست متنی (اختیاری)</div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="مثلاً: تمرین پا خیلی خسته‌ام می‌کنه" />
          {text.trim() && <p className="text-xs text-slate-500">درخواست متنی توسط هوش مصنوعی بررسی و به پیش‌نویس تبدیل می‌شود.</p>}
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Button block size="lg" onClick={preview} loading={busy && !res}>پیش‌نمایش تغییرات</Button>
      </Card>
      {res?.mode === "instant" && (
        <Card className="ring-2 ring-brand-300">
          <CardHeader title="پیش‌نمایش" subtitle="قبل از اعمال بررسی کنید؛ نسخه فعلی در تاریخچه حفظ می‌شود." />
          <DiffList lines={res.preview.diff.lines} notes={res.preview.notes} warnings={res.preview.warnings} />
          <ConfirmBar busy={busy} onConfirm={() => act("confirm")} onCancel={() => act("reject")} />
        </Card>
      )}
      {res?.mode === "ai" && <JobStatus jobId={res.jobId} title="طراحی اصلاحیه برنامه" onDone={onJobDone} />}
    </div>
  );
}

function MacroCompare({ current, proposed, requested }: { current: Macro; proposed: Macro; requested?: number | null }) {
  const row = (l: string, a: number, b: number, unit: string) => (
    <tr key={l}><td className="py-1.5 text-slate-500">{l}</td><td className="num">{faNum(a)} {unit}</td><td className="num font-bold">{faNum(b)} {unit}</td></tr>
  );
  return (
    <div className="space-y-2">
      {requested != null && requested !== proposed.kcal && <Badge tone="amber">درخواست شما: {faNum(requested)} کیلوکالری</Badge>}
      <table className="w-full text-sm">
        <thead><tr className="text-right text-xs text-slate-500"><th className="font-normal" /><th className="font-normal">فعلی</th><th className="font-normal">پیشنهادی</th></tr></thead>
        <tbody>
          {row("کالری", current.kcal, proposed.kcal, "kcal")}
          {row("پروتئین", current.proteinG, proposed.proteinG, "g")}
          {row("کربوهیدرات", current.carbsG, proposed.carbsG, "g")}
          {row("چربی", current.fatG, proposed.fatG, "g")}
        </tbody>
      </table>
    </div>
  );
}

function NutritionTab({ info }: { info: NutritionInfo }) {
  const router = useRouter();
  const [custom, setCustom] = useState(info?.kcal ?? 2000);
  const [text, setText] = useState("");
  const [meals, setMeals] = useState(info?.mealsPerDay ?? 4);
  const [res, setRes] = useState<NutritionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!info) return <Card><CardHeader title="برنامه غذایی فعال نیست" subtitle="برای تنظیم کالری ابتدا برنامه غذایی را فعال کنید." /><Link href="/nutrition/setup" className="font-semibold text-brand-700 underline">فعال‌سازی برنامه غذایی</Link></Card>;

  const request = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null); setRes(null);
    try { setRes(await api<NutritionPreview>("/api/adjust/nutrition", { body: { source: "controls", ...body } })); }
    catch (e) { setError(e instanceof ApiError ? e.message : "خطا"); }
    finally { setBusy(false); }
  };
  const act = async (a: "confirm" | "reject") => {
    if (!res) return;
    setBusy(true);
    try {
      await api(`/api/adjust/requests/${res.requestId}/${a}`, { method: "POST" });
      if (a === "confirm") { router.push("/program/nutrition"); router.refresh(); } else setRes(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطا"); }
    finally { setBusy(false); }
  };
  const onJobDone = async (j: JobView) => {
    if (j.status !== "completed" || !res) return;
    const r = await api<{ resultVersionId: string | null }>(`/api/adjust/requests/${res.requestId}`);
    if (r.resultVersionId) router.push(`/program/review-nutrition/${r.resultVersionId}`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="اهداف فعلی" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="کالری روزانه" value={faNum(info.kcal)} hint="کیلوکالری" /><Stat label="پروتئین" value={`${faNum(info.proteinG)} گرم`} />
          <Stat label="کربوهیدرات" value={`${faNum(info.carbsG)} گرم`} /><Stat label="چربی" value={`${faNum(info.fatG)} گرم`} />
        </div>
      </Card>
      <Card className="space-y-5">
        <div className="space-y-2">
          <div className="font-semibold">تنظیم کالری من</div>
          <div className="grid grid-cols-3 gap-2">
            {[100, 200, 300].map((d) => <Button key={`+${d}`} variant="soft" onClick={() => request({ kind: "delta", delta: d })} disabled={busy}>+{faNum(d)}</Button>)}
            {[-100, -200, -300].map((d) => <Button key={d} variant="secondary" onClick={() => request({ kind: "delta", delta: d })} disabled={busy}>−{faNum(-d)}</Button>)}
          </div>
        </div>
        <div className="space-y-2">
          <div className="font-semibold">هدف دلخواه</div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setCustom(custom - 50)} aria-label="کمتر">−</Button>
            <div className="num flex-1 text-center text-2xl font-extrabold">{faNum(custom)}</div>
            <Button variant="secondary" onClick={() => setCustom(custom + 50)} aria-label="بیشتر">+</Button>
            <Button onClick={() => request({ kind: "target", target: custom })} disabled={busy}>پیش‌نمایش</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" onClick={() => request({ kind: "recommend" })} disabled={busy}>پیشنهاد هوش مصنوعی بر اساس روند وزن</Button>
          <Button variant="secondary" onClick={() => request({ kind: "protein", protein: "increase" })} disabled={busy}>پروتئین بیشتر</Button>
          <Button variant="secondary" onClick={() => request({ kind: "protein", protein: "decrease" })} disabled={busy}>پروتئین کمتر</Button>
        </div>
        <div className="space-y-2">
          <div className="font-semibold">تعداد وعده‌ها / غذاهای ترجیحی</div>
          <Seg label="تعداد وعده" value={meals} options={[2, 3, 4, 5].map((m) => ({ v: m, l: faNum(m) }))} onChange={setMeals} />
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="مثلاً: غذاهای برنجی بیشتر، شام سبک‌تر، غذاهای سیرکننده‌تر" />
          <Button variant="soft" onClick={() => request({ kind: "ai", mealsPerDay: meals !== info.mealsPerDay ? meals : undefined, text: text.trim() || undefined })} disabled={busy || (meals === info.mealsPerDay && !text.trim())}>بازطراحی وعده‌ها با هوش مصنوعی</Button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </Card>
      {res?.mode === "instant" && (
        <Card className="ring-2 ring-brand-300">
          <CardHeader title="پیش‌نمایش" subtitle="ثبت‌های غذایی قبلی تغییر نمی‌کنند." />
          {res.preview.recommendation && <Alert tone="info" title="پیشنهاد">{res.preview.recommendation.reason}</Alert>}
          <div className="my-3"><MacroCompare current={res.preview.current} proposed={res.preview.proposed} requested={res.preview.requested} /></div>
          {res.preview.effects.length > 0 && <ul className="list-disc space-y-1 pr-5 text-sm">{res.preview.effects.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="mt-3"><DiffList lines={res.preview.diff.lines} warnings={res.preview.warnings} /></div>
          <ConfirmBar busy={busy} onConfirm={() => act("confirm")} onCancel={() => act("reject")} />
        </Card>
      )}
      {res?.mode === "ai" && <JobStatus jobId={res.jobId} title="بازطراحی برنامه غذایی" onDone={onJobDone} />}
    </div>
  );
}
