"use client";
/**
 * Offline mode: renders the last plan snapshot stored on this device and lets
 * the user keep logging. Entries go to the IndexedDB outbox and are synced
 * idempotently when the connection returns.
 */
import { useEffect, useState } from "react";
import { loadSnapshot, outboxCount, queueOp, flushOutbox } from "@/lib/offline";
import { uid } from "@/lib/client";
import { WEEKDAY_FA, PERSIAN_WEEK_ORDER } from "@/lib/dates";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { Alert, Badge, Button, Card, CardHeader, Input, faNum } from "@/components/ui";

type Snapshot = {
  today: string; plan: WorkoutPlan; sessionIds?: Record<string, string>;
  nutrition: { target: { kcal: number; proteinG: number } | null; meals: { id: string; slot: string; title: string; time: string | null; kcal: number; proteinG: number; status: string; items: { nameFa: string; grams: number }[] }[] } | null;
};

const localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());

export function OfflineApp() {
  const [snap, setSnap] = useState<{ data: Snapshot; savedAt: number } | null | undefined>(undefined);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [workoutCid, setWorkoutCid] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [vals, setVals] = useState<Record<string, { w: string; r: string }>>({});
  const [weight, setWeight] = useState("");
  const [eaten, setEaten] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadSnapshot<Snapshot>("dashboard").then((s) => {
      setSnap(s);
      if (s) {
        const dow = new Date(localToday() + "T00:00:00Z").getUTCDay();
        setSessionKey(s.data.plan.sessions.find((x) => x.dayOfWeek === dow)?.key ?? s.data.plan.sessions[0]?.key ?? null);
      }
    });
    const upd = () => { setOnline(navigator.onLine); void outboxCount().then(setPending); };
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    window.addEventListener("ff-outbox", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); window.removeEventListener("ff-outbox", upd); };
  }, []);

  if (snap === undefined) return null;
  const date = localToday();
  const session = snap?.data.plan.sessions.find((s) => s.key === sessionKey) ?? null;

  const start = async () => {
    if (!session) return;
    const cid = uid("w");
    await queueOp({ type: "start_workout", payload: { clientId: cid, date, sessionId: snap?.data.sessionIds?.[session.key] ?? null, title: session.title } });
    setWorkoutCid(cid);
  };
  const logSet = async (exId: string, i: number, k: number) => {
    if (!workoutCid) return;
    const key = `${i}:${k}`;
    const v = vals[key] ?? { w: "", r: "" };
    await queueOp({ type: "log_set", payload: { clientId: `${workoutCid}-s${i}-${k}`, workoutClientId: workoutCid, exerciseId: exId, setIndex: k, weightKg: v.w ? Number(v.w) : null, reps: v.r ? Number(v.r) : null, status: "done" } });
    setDone({ ...done, [key]: true });
  };
  const finish = async () => {
    if (!workoutCid) return;
    await queueOp({ type: "workout_status", payload: { clientId: `${workoutCid}-done`, workoutClientId: workoutCid, action: "complete" } });
    setMsg("جلسه ذخیره شد و پس از اتصال همگام‌سازی می‌شود.");
    setWorkoutCid(null);
  };

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-brand-700 dark:text-brand-300">FitFlow — {online ? "آنلاین" : "آفلاین"}</h1>
        {pending > 0 && <Badge tone="amber">{faNum(pending)} ثبت در انتظار همگام‌سازی</Badge>}
      </header>
      {online && <Alert tone="success">اتصال برقرار است. <a className="font-semibold underline" href="/dashboard">بازگشت به برنامه</a> {pending > 0 && <Button size="sm" variant="ghost" onClick={() => void flushOutbox()}>همگام‌سازی</Button>}</Alert>}
      {msg && <Alert tone="success">{msg}</Alert>}
      {!snap ? (
        <Alert tone="info" title="هنوز داده‌ای روی این دستگاه ذخیره نشده">یک بار هنگام اتصال، داشبورد را باز کنید تا برنامه برای استفاده آفلاین ذخیره شود.</Alert>
      ) : (
        <>
          <p className="text-xs text-slate-500">آخرین ذخیره: {new Date(snap.savedAt).toLocaleString("fa-IR")}</p>
          <Card>
            <CardHeader title={snap.data.plan.title} subtitle="برنامه تمرینی (نسخه ذخیره‌شده روی دستگاه)" />
            <div className="mb-3 flex flex-wrap gap-2">
              {[...snap.data.plan.sessions].sort((a, b) => PERSIAN_WEEK_ORDER.indexOf(a.dayOfWeek) - PERSIAN_WEEK_ORDER.indexOf(b.dayOfWeek)).map((s) => (
                <Button key={s.key} size="sm" variant={s.key === sessionKey ? "primary" : "secondary"} onClick={() => { setSessionKey(s.key); setWorkoutCid(null); setDone({}); }}>{WEEKDAY_FA[s.dayOfWeek]}</Button>
              ))}
            </div>
            {session && (
              <div className="space-y-3">
                <div className="font-bold">{session.title}</div>
                {!workoutCid ? <Button block onClick={start}>شروع ثبت این جلسه (آفلاین)</Button> : <Button block variant="soft" onClick={finish}>پایان جلسه</Button>}
                {session.exercises.map((e, i) => (
                  <div key={i} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                    <div className="font-semibold">{e.exerciseId.replace(/_/g, " ")}</div>
                    <div className="num text-xs text-slate-500">{faNum(e.sets)} ست × {faNum(e.repMin)}–{faNum(e.repMax)} · استراحت {faNum(e.restSec)} ثانیه</div>
                    {workoutCid && (
                      <div className="mt-2 space-y-1">
                        {Array.from({ length: e.sets }, (_, k) => {
                          const key = `${i}:${k}`;
                          return (
                            <div key={k} className="flex items-center gap-2">
                              <span className="num w-6 text-sm">{faNum(k + 1)}</span>
                              <Input inputMode="decimal" dir="ltr" placeholder="kg" className="h-10" value={vals[key]?.w ?? ""} onChange={(ev) => setVals({ ...vals, [key]: { w: ev.target.value, r: vals[key]?.r ?? "" } })} disabled={done[key]} />
                              <Input inputMode="numeric" dir="ltr" placeholder="تکرار" className="h-10" value={vals[key]?.r ?? ""} onChange={(ev) => setVals({ ...vals, [key]: { r: ev.target.value, w: vals[key]?.w ?? "" } })} disabled={done[key]} />
                              <Button size="sm" variant={done[key] ? "soft" : "secondary"} onClick={() => logSet(e.exerciseId, i, k)} disabled={done[key]}>{done[key] ? "✓" : "ثبت"}</Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
          {snap.data.nutrition?.meals.length ? (
            <Card>
              <CardHeader title="وعده‌های امروز" subtitle={snap.data.nutrition.target ? `هدف ${faNum(snap.data.nutrition.target.kcal)} کیلوکالری` : undefined} />
              <ul className="space-y-2">
                {snap.data.nutrition.meals.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                    <div><div className="font-semibold">{m.title}</div><div className="text-xs text-slate-500">{m.items.map((x) => `${x.nameFa} ${faNum(x.grams)}g`).join("، ")}</div></div>
                    <Button size="sm" variant={eaten[m.id] || m.status !== "pending" ? "soft" : "primary"} disabled={eaten[m.id] || m.status !== "pending" || snap.data.today !== date}
                      onClick={async () => { await queueOp({ type: "log_planned_meal", payload: { clientId: uid("m"), date, plannedMealId: m.id, portion: 1, action: "eaten" } }); setEaten({ ...eaten, [m.id]: true }); }}>
                      {eaten[m.id] || m.status !== "pending" ? "✓" : "خوردم"}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="ثبت وزن" />
            <div className="flex gap-2">
              <Input inputMode="decimal" dir="ltr" placeholder="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
              <Button onClick={async () => { const w = Number(weight); if (w > 25 && w < 350) { await queueOp({ type: "log_weight", payload: { clientId: uid("bw"), date, weightKg: w } }); setWeight(""); setMsg("وزن ذخیره شد."); } }}>ثبت</Button>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
