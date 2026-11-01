"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { submitOrQueue } from "@/lib/offline";
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea, cx, faNum } from "@/components/ui";
import { MUSCLE_FA } from "@/domain/exercises/catalog";
import { ReplaceSheet, type Alternative } from "./replace-sheet";
import { RestTimer, type TimerState } from "./rest-timer";

export interface PrevSet { setIndex: number; weightKg: number | null; reps: number | null; rir: number | null }
export interface SlotInit {
  slot: string; workoutExerciseId: string | null; exerciseId: string; nameFa: string; nameEn: string; image: string | null; muscles: string[];
  sets: number; repMin: number; repMax: number; unit: "reps" | "seconds" | "minutes"; restSec: number; targetRir: number | null;
  loadGuidance: string; notes: string; sessionKey: string | null; index: number | null; previous: { date: string; sets: PrevSet[] } | null;
}
export interface LoggedSet {
  id: string; clientId: string; workoutExerciseId: string | null; exerciseId: string; substitutedFromId: string | null; setIndex: number;
  weightKg: number | null; reps: number | null; rpe: number | null; rir: number | null; status: "done" | "skipped";
}
export interface WorkoutInit {
  id: string; clientId: string; title: string; date: string; status: "in_progress" | "paused" | "completed" | "missed" | "skipped";
  startedAt: number | null; durationSec: number | null; unscheduled: boolean; totalVolumeKg: number | null;
}
type RowState = { weight: string; reps: string; rir: string; status: "pending" | "done" | "skipped"; queued?: boolean; saving?: boolean };
interface Slot extends SlotInit { originalExerciseId: string; rows: RowState[] }

const unitFa = (u: string) => (u === "seconds" ? "ثانیه" : u === "minutes" ? "دقیقه" : "تکرار");
const numOrNull = (s: string) => {
  const n = Number(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٫,]/g, "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};
const fmtDur = (sec: number) => `${Math.floor(sec / 3600) ? Math.floor(sec / 3600).toLocaleString("fa-IR") + ":" : ""}${Math.floor((sec % 3600) / 60).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}:${(sec % 60).toLocaleString("fa-IR", { minimumIntegerDigits: 2 })}`;

function buildSlots(init: SlotInit[], logged: LoggedSet[]): Slot[] {
  return init.map((s) => {
    const mine = logged.filter((l) => (s.workoutExerciseId ? l.workoutExerciseId === s.workoutExerciseId : l.exerciseId === s.exerciseId && !l.workoutExerciseId));
    const sub = mine.find((l) => l.substitutedFromId);
    const count = Math.max(s.sets, ...mine.map((l) => l.setIndex + 1));
    const rows: RowState[] = Array.from({ length: count }, (_, i) => {
      const l = mine.find((x) => x.setIndex === i);
      if (l) return { weight: l.weightKg?.toString() ?? "", reps: l.reps?.toString() ?? "", rir: l.rir?.toString() ?? "", status: l.status };
      const p = s.previous?.sets.find((x) => x.setIndex === i) ?? s.previous?.sets.at(-1);
      return { weight: p?.weightKg?.toString() ?? "", reps: p?.reps?.toString() ?? (s.unit === "reps" ? String(s.repMax) : String(s.repMax)), rir: "", status: "pending" };
    });
    return { ...s, originalExerciseId: s.exerciseId, exerciseId: sub ? sub.exerciseId : s.exerciseId, rows };
  });
}

export function WorkoutLogger({ workout: initialWorkout, slots: slotInit, logged, detailed, catalog }: {
  workout: WorkoutInit; slots: SlotInit[]; logged: LoggedSet[]; detailed: boolean; catalog: { id: string; nameFa: string; nameEn: string; image: string | null; muscles: string[] }[];
}) {
  const router = useRouter();
  const [workout, setWorkout] = useState(initialWorkout);
  const [slots, setSlots] = useState<Slot[]>(() => buildSlots(slotInit, logged));
  const [timer, setTimer] = useState<TimerState>({ endAt: null, remainingMs: 0, durationSec: slotInit[0]?.restSec || 90 });
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [replaceFor, setReplaceFor] = useState<number | null>(null);
  const [showRir, setShowRir] = useState(detailed);
  const [phase, setPhase] = useState<"log" | "feedback" | "done">(initialWorkout.status === "completed" ? "done" : "log");
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState("");
  const readOnly = workout.status === "completed" || workout.status === "missed" || workout.status === "skipped";

  useEffect(() => {
    if (workout.status !== "in_progress") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [workout.status]);

  const elapsed = (workout.durationSec ?? 0) + (workout.status === "in_progress" && workout.startedAt ? Math.max(0, Math.round((now - workout.startedAt) / 1000)) : 0);
  const volume = useMemo(() => slots.reduce((s, sl) => s + sl.rows.reduce((a, r) => a + (r.status === "done" ? (numOrNull(r.weight) ?? 0) * (numOrNull(r.reps) ?? 0) : 0), 0), 0), [slots]);
  const doneSets = slots.reduce((s, sl) => s + sl.rows.filter((r) => r.status === "done").length, 0);
  const totalSets = slots.reduce((s, sl) => s + sl.rows.length, 0);

  const patchRow = (si: number, ri: number, p: Partial<RowState>) =>
    setSlots((prev) => prev.map((s, i) => (i === si ? { ...s, rows: s.rows.map((r, j) => (j === ri ? { ...r, ...p } : r)) } : s)));

  async function saveRow(si: number, ri: number, status: "done" | "skipped") {
    const s = slots[si];
    const r = s.rows[ri];
    setError(null);
    const payload = {
      clientId: `${workout.clientId}:${s.slot}:${ri}`.slice(0, 80),
      completedWorkoutId: workout.id,
      workoutExerciseId: s.workoutExerciseId,
      exerciseId: s.exerciseId,
      substitutedFromId: s.exerciseId !== s.originalExerciseId ? s.originalExerciseId : null,
      setIndex: ri,
      weightKg: status === "done" ? numOrNull(r.weight) : null,
      reps: status === "done" && numOrNull(r.reps) !== null ? Math.round(numOrNull(r.reps)!) : null,
      rir: status === "done" && numOrNull(r.rir) !== null ? Math.round(numOrNull(r.rir)!) : null,
      status,
    };
    patchRow(si, ri, { status, saving: true });
    try {
      const res = await submitOrQueue({ type: "log_set", payload }, () => api("/api/workouts/sets", { body: payload }));
      patchRow(si, ri, { saving: false, queued: res.queued });
      if (res.queued) setInfo("آفلاین هستید؛ ست‌ها روی دستگاه ذخیره شدند و بعداً همگام می‌شوند.");
      if (status === "done" && s.restSec > 0 && !readOnly) {
        const next = s.rows.findIndex((x, j) => j > ri && x.status === "pending");
        const nextRow = next >= 0 ? next : -1;
        // prefill the next row with what was just done
        if (nextRow >= 0) patchRow(si, nextRow, { weight: s.rows[nextRow].weight || r.weight, reps: s.rows[nextRow].reps || r.reps });
        setTimer({ endAt: Date.now() + s.restSec * 1000, remainingMs: 0, durationSec: s.restSec });
      }
    } catch (e) {
      patchRow(si, ri, { status: r.status, saving: false });
      setError((e as Error).message);
    }
  }

  const skipExercise = async (si: number) => {
    for (const [ri, r] of slots[si].rows.entries()) if (r.status === "pending") await saveRow(si, ri, "skipped");
  };

  const addSet = (si: number) =>
    setSlots((prev) => prev.map((s, i) => (i === si ? { ...s, rows: [...s.rows, { ...(s.rows.at(-1) ?? { weight: "", reps: "", rir: "" }), status: "pending", queued: false, saving: false }] } : s)));

  async function setStatus(action: "pause" | "resume" | "complete") {
    setBusy(true);
    setError(null);
    try {
      const payload = { clientId: `${workout.clientId}:st:${action}:${Date.now().toString(36)}`, workoutId: workout.id, action };
      const res = await submitOrQueue({ type: "workout_status", payload }, () => api<WorkoutInit>(`/api/workouts/${workout.id}/status`, { body: { action } }));
      if (res.queued) {
        setInfo("وضعیت جلسه پس از اتصال همگام می‌شود.");
        setWorkout((w) => ({ ...w, status: action === "pause" ? "paused" : action === "resume" ? "in_progress" : "completed" }));
      } else setWorkout((w) => ({ ...w, ...(res.data as WorkoutInit) }));
      if (action === "complete") setPhase("feedback");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const replaceToday = (si: number, alt: Alternative) =>
    setSlots((prev) => prev.map((s, i) => (i === si ? { ...s, exerciseId: alt.id, nameFa: alt.nameFa, nameEn: alt.nameEn, image: alt.image, muscles: alt.primaryMuscles, previous: null } : s)));

  const addExercise = () => {
    const c = catalog.find((x) => x.id === addId);
    if (!c) return;
    setSlots((prev) => [...prev, {
      slot: `x${prev.length}`, workoutExerciseId: null, exerciseId: c.id, originalExerciseId: c.id, nameFa: c.nameFa, nameEn: c.nameEn, image: c.image, muscles: c.muscles,
      sets: 3, repMin: 8, repMax: 12, unit: "reps", restSec: 90, targetRir: 2, loadGuidance: "", notes: "", sessionKey: null, index: null, previous: null,
      rows: Array.from({ length: 3 }, () => ({ weight: "", reps: "10", rir: "", status: "pending" as const })),
    }]);
    setAddId("");
  };

  if (phase === "feedback") return <FeedbackForm workoutId={workout.id} volume={volume} elapsed={elapsed} doneSets={doneSets} onDone={() => setPhase("done")} />;

  return (
    <div className="space-y-4 pb-24">
      <Card className="sticky top-14 z-10 lg:top-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold">{workout.title}</h1>
            <div className="text-xs text-slate-500">
              {workout.status === "paused" ? <Badge tone="amber">متوقف</Badge> : workout.status === "in_progress" ? <Badge tone="brand">در حال اجرا</Badge> : <Badge>{{ completed: "انجام شد", missed: "از دست رفت", skipped: "رد شد" }[workout.status as "completed"]}</Badge>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div><div className="text-slate-500">زمان</div><div className="num text-base font-bold">{fmtDur(elapsed)}</div></div>
            <div><div className="text-slate-500">ست‌ها</div><div className="num text-base font-bold">{faNum(doneSets)}/{faNum(totalSets)}</div></div>
            <div><div className="text-slate-500">حجم (kg)</div><div className="num text-base font-bold">{faNum(volume)}</div></div>
          </div>
        </div>
        {!readOnly && (
          <div className="mt-3 flex flex-wrap gap-2">
            {workout.status === "in_progress" ? <Button size="sm" variant="secondary" onClick={() => setStatus("pause")} loading={busy}>توقف موقت</Button> : <Button size="sm" variant="secondary" onClick={() => setStatus("resume")} loading={busy}>ادامه</Button>}
            <Button size="sm" onClick={() => setStatus("complete")} loading={busy}>پایان تمرین</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRir((v) => !v)}>{showRir ? "پنهان کردن RIR" : "نمایش RIR"}</Button>
          </div>
        )}
      </Card>
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="info">{info}</Alert>}
      {readOnly && <Alert tone="success">این جلسه ثبت شده است. حجم کل: {faNum(workout.totalVolumeKg ?? volume)} کیلوگرم.</Alert>}

      {slots.map((s, si) => {
        const swapped = s.exerciseId !== s.originalExerciseId;
        return (
          <Card key={s.slot} as="article">
            <div className="flex gap-3">
              {s.image ? <img src={s.image} alt={s.nameFa} loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" /> : <div className="size-20 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-bold">{faNum(si + 1)}. {s.nameFa}</h2>
                    <div className="ltr truncate text-xs text-slate-500">{s.nameEn}</div>
                  </div>
                  {swapped && <Badge tone="sky">جایگزین امروز</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">{s.muscles.map((m) => <Badge key={m}>{MUSCLE_FA[m] ?? m}</Badge>)}</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {faNum(s.sets)} ست × {faNum(s.repMin)}–{faNum(s.repMax)} {unitFa(s.unit)} · استراحت {faNum(s.restSec)} ثانیه{s.targetRir !== null ? ` · RIR ${faNum(s.targetRir)}` : ""}
                </div>
              </div>
            </div>
            {s.loadGuidance && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">💡 {s.loadGuidance}</p>}
            {s.notes && <p className="text-xs text-slate-500">{s.notes}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {s.previous?.sets.length ? <>دفعه قبل ({new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(s.previous.date + "T00:00:00Z"))}): {s.previous.sets.map((p) => `${faNum(p.weightKg ?? 0, 1)}×${faNum(p.reps ?? 0)}`).join("، ")}</> : "سابقه قبلی ثبت نشده؛ وزنه‌ای انتخاب کنید که با فرم صحیح اجرا شود."}
            </p>

            <div className="mt-3 space-y-2">
              <div className={cx("grid items-center gap-2 px-1 text-xs text-slate-500", showRir ? "grid-cols-[2rem_1fr_1fr_4rem_auto]" : "grid-cols-[2rem_1fr_1fr_auto]")}>
                <span>ست</span><span>وزنه (kg)</span><span>{unitFa(s.unit)}</span>{showRir && <span>RIR</span>}<span />
              </div>
              {s.rows.map((r, ri) => (
                <div key={ri} className={cx("grid items-center gap-2 rounded-xl p-1", showRir ? "grid-cols-[2rem_1fr_1fr_4rem_auto]" : "grid-cols-[2rem_1fr_1fr_auto]", r.status === "done" && "bg-brand-50 dark:bg-brand-950/40", r.status === "skipped" && "opacity-60")}>
                  <span className="num text-center font-bold">{faNum(ri + 1)}</span>
                  <Input aria-label={`وزنه ست ${ri + 1}`} inputMode="decimal" value={r.weight} disabled={readOnly} onChange={(e) => patchRow(si, ri, { weight: e.target.value })} className="h-10 text-center" />
                  <Input aria-label={`تکرار ست ${ri + 1}`} inputMode="numeric" value={r.reps} disabled={readOnly} onChange={(e) => patchRow(si, ri, { reps: e.target.value })} className="h-10 text-center" />
                  {showRir && <Input aria-label={`RIR ست ${ri + 1}`} inputMode="numeric" value={r.rir} disabled={readOnly} onChange={(e) => patchRow(si, ri, { rir: e.target.value })} className="h-10 text-center" />}
                  <div className="flex gap-1">
                    <button
                      type="button" disabled={readOnly || r.saving} onClick={() => saveRow(si, ri, "done")} aria-pressed={r.status === "done"} aria-label={`ثبت ست ${ri + 1}`}
                      className={cx("grid size-10 place-items-center rounded-xl text-lg font-bold ring-1", r.status === "done" ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300 dark:ring-slate-600")}
                    >✓</button>
                    {!readOnly && r.status === "pending" && (
                      <button type="button" onClick={() => saveRow(si, ri, "skipped")} aria-label={`رد کردن ست ${ri + 1}`} className="grid size-10 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 dark:ring-slate-700">⤼</button>
                    )}
                  </div>
                  {r.queued && <span className="col-span-full text-[11px] text-amber-600">در انتظار همگام‌سازی</span>}
                </div>
              ))}
            </div>
            {!readOnly && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => addSet(si)}>+ ست</Button>
                <Button size="sm" variant="ghost" onClick={() => skipExercise(si)}>رد کردن حرکت</Button>
                <Button size="sm" variant="ghost" onClick={() => setReplaceFor(si)}>جایگزینی حرکت</Button>
                <Button size="sm" variant="ghost" onClick={() => setTimer({ endAt: Date.now() + s.restSec * 1000, remainingMs: 0, durationSec: s.restSec || 90 })}>شروع استراحت</Button>
              </div>
            )}
            <div className="mt-2 flex gap-3 text-xs">
              <Link href={`/exercises/${encodeURIComponent(s.exerciseId)}`} className="text-brand-700 underline dark:text-brand-300">راهنمای اجرا</Link>
              <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(s.nameEn + " exercise form tutorial")}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline dark:text-brand-300">جستجوی ویدیوی آموزشی</a>
            </div>
          </Card>
        );
      })}

      {!readOnly && catalog.length > 0 && (
        <Card>
          <Field label="افزودن حرکت به این جلسه" htmlFor="add-ex">
            <div className="flex gap-2">
              <Select id="add-ex" value={addId} onChange={(e) => setAddId(e.target.value)}>
                <option value="">انتخاب حرکت…</option>
                {catalog.map((c) => <option key={c.id} value={c.id}>{c.nameFa}</option>)}
              </Select>
              <Button onClick={addExercise} disabled={!addId}>افزودن</Button>
            </div>
          </Field>
        </Card>
      )}

      {phase === "done" && (
        <div className="flex gap-2">
          <Button onClick={() => router.push("/dashboard")}>بازگشت به خانه</Button>
          <Button variant="secondary" onClick={() => router.push("/workouts/history")}>تاریخچه تمرین</Button>
        </div>
      )}

      {!readOnly && <RestTimer timer={timer} setTimer={setTimer} />}

      {replaceFor !== null && (
        <ReplaceSheet
          exerciseId={slots[replaceFor].exerciseId}
          exerciseName={slots[replaceFor].nameFa}
          sessionKey={slots[replaceFor].sessionKey}
          index={slots[replaceFor].index}
          allowToday
          onClose={() => setReplaceFor(null)}
          onToday={(alt) => replaceToday(replaceFor, alt)}
          onPlanReplaced={() => { setInfo("برنامه با حرکت جدید به‌روزرسانی شد (نسخه جدید). این جلسه با همان حرکت جایگزین ادامه می‌یابد."); }}
        />
      )}
    </div>
  );
}

function Scale({ value, onChange, labels }: { value: number | null; onChange: (n: number) => void; labels: [string, string] }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n} className={cx("h-12 rounded-xl text-lg font-bold ring-1", value === n ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300 dark:ring-slate-600")}>{faNum(n)}</button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{labels[0]}</span><span>{labels[1]}</span></div>
    </div>
  );
}

function FeedbackForm({ workoutId, volume, elapsed, doneSets, onDone }: { workoutId: string; volume: number; elapsed: number; doneSets: number; onDone: () => void }) {
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [pain, setPain] = useState(false);
  const [painNotes, setPainNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/workouts/${workoutId}/feedback`, { body: { difficulty, energy, pain, painNotes: pain ? painNotes : null, notes: notes || null } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-xl font-extrabold">آفرین! تمرین ثبت شد 🎉</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{faNum(doneSets)} ست · {faNum(Math.round(elapsed / 60))} دقیقه · حجم {faNum(volume)} کیلوگرم</p>
      </Card>
      <Card className="space-y-4">
        <Field label="سختی این جلسه چطور بود؟"><Scale value={difficulty} onChange={setDifficulty} labels={["خیلی آسان", "خیلی سخت"]} /></Field>
        <Field label="سطح انرژی"><Scale value={energy} onChange={setEnergy} labels={["خیلی کم", "عالی"]} /></Field>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} className="size-5 accent-rose-600" /> درد یا ناراحتی داشتم
        </label>
        {pain && <Field label="کجا و چه نوع دردی؟" htmlFor="pain-notes"><Textarea id="pain-notes" value={painNotes} onChange={(e) => setPainNotes(e.target.value)} maxLength={500} /></Field>}
        <Field label="یادداشت (اختیاری)" htmlFor="wnotes"><Textarea id="wnotes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></Field>
        {pain && <Alert tone="warn">درد گزارش‌شده در پیشنهادهای بعدی لحاظ می‌شود و شدت برنامه بی‌جهت افزایش نمی‌یابد. اگر درد شدید یا تیز است، آن حرکت را متوقف کنید.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button onClick={submit} loading={busy}>ثبت بازخورد</Button>
          <Button variant="ghost" onClick={onDone}>رد شدن</Button>
        </div>
      </Card>
    </div>
  );
}
