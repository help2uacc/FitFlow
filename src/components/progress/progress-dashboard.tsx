"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, EmptyState, Select, Spinner, Stat, cx, faDate, faNum } from "@/components/ui";
import { Bars, LineTrend } from "./charts";
import type { ProgressData } from "./types";

const RANGES = [["7", "۷ روز"], ["14", "۱۴ روز"], ["30", "۳۰ روز"], ["90", "۹۰ روز"], ["all", "همه"]] as const;

export function ProgressDashboard({ reloadKey = 0 }: { reloadKey?: number }) {
  const [range, setRange] = useState("30");
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setExercise] = useState<string>("");
  const [exData, setExData] = useState<{ key: string; points: { date: string; bestE1rm: number; topWeight: number }[] } | null>(null);
  const exercise = selected || data?.personalBests[0]?.exerciseId || "";
  const exRange = range === "all" ? "all" : range === "7" || range === "14" ? "30" : range;
  const exPoints = exData && exData.key === `${exercise}|${exRange}` ? exData.points : null;

  useEffect(() => {
    let stop = false;
    api<ProgressData>(`/api/progress?range=${range}`)
      .then((d) => { if (!stop) { setData(d); setError(null); } })
      .catch((e) => { if (!stop) setError((e as Error).message); });
    return () => { stop = true; };
  }, [range, reloadKey]);
  useEffect(() => {
    if (!exercise) return;
    let stop = false;
    api<{ points: { date: string; bestE1rm: number; topWeight: number }[] }>(`/api/progress/exercise/${encodeURIComponent(exercise)}?range=${exRange}`)
      .then((r) => { if (!stop) setExData({ key: `${exercise}|${exRange}`, points: r.points }); }).catch(() => {});
    return () => { stop = true; };
  }, [exercise, exRange]);

  const a = data?.adherence;
  const n = data?.nutrition;
  const loggedDays = n?.days.filter((d) => d.entries > 0) ?? [];
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="بازه زمانی" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {RANGES.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={range === v} onClick={() => setRange(v)} className={cx("h-9 flex-1 shrink-0 rounded-lg px-3 text-sm font-medium", range === v ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-600 dark:text-slate-300")}>{l}</button>
        ))}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!data ? <div className="flex justify-center p-8"><Spinner /></div> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="جلسات انجام‌شده" value={faNum(a!.completed)} hint={a!.unscheduled ? `${faNum(a!.unscheduled)} خارج از برنامه` : undefined} />
            <Stat label="پایبندی به برنامه" value={a!.adherencePct === null ? "—" : `${faNum(a!.adherencePct)}٪`} hint={`${faNum(a!.completedPlanned)} از ${faNum(a!.plannedSoFar)} جلسه`} />
            <Stat label="روند وزن" value={data.weight.trendKgPerWeek === null ? "—" : `${data.weight.trendKgPerWeek > 0 ? "+" : ""}${faNum(data.weight.trendKgPerWeek, 2)}`} hint="کیلوگرم در هفته" />
            <Stat label="روزهای ثبت غذا" value={faNum(n!.loggedDays)} hint={n!.avgKcal ? `میانگین ${faNum(n!.avgKcal)} کالری` : undefined} />
          </div>

          <Card>
            <CardHeader title="وزن بدن" subtitle={data.weight.trendKgPerWeek === null ? "برای محاسبه روند حداقل ۳ وزن‌کشی لازم است." : `خط‌چین میانگین ۷ روزه است؛ نوسان روزانه طبیعی است.`} />
            {data.weight.points.length ? (
              <LineTrend data={data.weight.points} xKey="date" unit="" series={[{ key: "weightKg", name: "وزن", color: "#16a864" }, { key: "avg7", name: "میانگین ۷ روزه", color: "#0ea5e9", dashed: true }]} />
            ) : <EmptyState title="هنوز وزنی ثبت نشده">از فرم «ثبت وزن و اندازه‌ها» استفاده کنید.</EmptyState>}
            {data.weight.measurements.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-slate-500"><th className="p-1 text-right">تاریخ</th><th className="p-1">کمر</th><th className="p-1">سینه</th><th className="p-1">بازو</th><th className="p-1">باسن</th><th className="p-1">ران</th></tr></thead>
                  <tbody>{data.weight.measurements.slice(-6).reverse().map((m) => (
                    <tr key={m.date} className="num border-t border-slate-100 text-center dark:border-slate-800"><td className="p-1 text-right">{faDate(m.date)}</td><td>{faNum(m.waistCm, 1)}</td><td>{faNum(m.chestCm, 1)}</td><td>{faNum(m.armCm, 1)}</td><td>{faNum(m.hipCm, 1)}</td><td>{faNum(m.thighCm, 1)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="جلسات هفتگی" subtitle="برنامه‌ریزی‌شده در برابر انجام‌شده (هفته‌ها از شنبه شروع می‌شوند)" />
            {data.weekly.length ? <Bars data={data.weekly} xKey="week" series={[{ key: "planned", name: "برنامه", color: "#94a3b8" }, { key: "completed", name: "انجام‌شده", color: "#16a864" }]} /> : <EmptyState title="داده‌ای در این بازه نیست" />}
          </Card>

          <Card>
            <CardHeader title="حجم تمرین هفتگی" subtitle={`مجموع وزنه × تکرار (کیلوگرم). کل بازه: ${faNum(a!.totalVolumeKg)} کیلوگرم در ${faNum(a!.totalMinutes)} دقیقه`} />
            {data.weekly.some((w) => w.volume > 0) ? <Bars data={data.weekly} xKey="week" series={[{ key: "volume", name: "حجم", color: "#0ea5e9" }]} /> : <EmptyState title="هنوز ستی با وزنه ثبت نشده" />}
          </Card>

          <Card>
            <CardHeader title="پیشرفت قدرت" subtitle="بهترین 1RM تخمینی (فرمول اپلی) در هر جلسه — تخمین است، نه رکورد واقعی." />
            {data.personalBests.length ? (
              <>
                <Select value={exercise} onChange={(e) => setExercise(e.target.value)} aria-label="انتخاب حرکت">
                  {data.personalBests.map((p) => <option key={p.exerciseId} value={p.exerciseId}>{p.nameFa} — بهترین {faNum(p.bestE1rm, 1)} kg</option>)}
                </Select>
                <div className="mt-3">
                  {exPoints && exPoints.length > 1 ? <LineTrend data={exPoints} xKey="date" series={[{ key: "bestE1rm", name: "1RM تخمینی", color: "#8b5cf6" }, { key: "topWeight", name: "بیشترین وزنه", color: "#16a864", dashed: true }]} />
                    : <p className="text-sm text-slate-500">برای نمودار حداقل دو جلسه ثبت‌شده برای این حرکت لازم است.</p>}
                </div>
                <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  {data.personalBests.slice(0, 6).map((p) => (
                    <li key={p.exerciseId} className="flex justify-between py-2"><span>{p.nameFa}</span><span className="num text-slate-600 dark:text-slate-300">{faNum(p.maxWeight, 1)} kg · {faNum(p.sessions)} جلسه</span></li>
                  ))}
                </ul>
              </>
            ) : <EmptyState title="هنوز رکوردی ثبت نشده">با ثبت وزنه و تکرار در جلسات تمرین، روند قدرت اینجا نمایش داده می‌شود.</EmptyState>}
          </Card>

          <Card>
            <CardHeader title="کالری دریافتی در برابر هدف" subtitle={n!.note ?? "فقط روزهای ثبت‌شده نمایش داده می‌شوند."} />
            {loggedDays.length ? (
              <>
                <LineTrend data={loggedDays} xKey="date" series={[{ key: "kcal", name: "دریافتی", color: "#f97316" }, { key: "targetKcal", name: "هدف", color: "#94a3b8", dashed: true }]} />
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {n!.adherencePct !== null && <>در {faNum(n!.adherencePct)}٪ روزهای ثبت‌شده کالری در محدوده ±۱۰٪ هدف بوده. </>}
                  {n!.completeDays < n!.loggedDays && <>{faNum(n!.loggedDays - n!.completeDays)} روز به‌عنوان «کامل» علامت نخورده و ممکن است ناقص باشد.</>}
                </p>
              </>
            ) : <EmptyState title="غذایی ثبت نشده">روزهای بدون ثبت به‌عنوان «داده ناقص» در نظر گرفته می‌شوند، نه مصرف صفر.</EmptyState>}
          </Card>

          <Card>
            <CardHeader title="پروتئین روزانه" subtitle={n!.avgProteinG ? `میانگین ${faNum(n!.avgProteinG)} گرم در روزهای ثبت‌شده` : undefined} />
            {loggedDays.length ? <LineTrend data={loggedDays} xKey="date" series={[{ key: "proteinG", name: "پروتئین", color: "#16a864" }, { key: "targetProteinG", name: "هدف", color: "#94a3b8", dashed: true }]} /> : <EmptyState title="داده‌ای نیست" />}
          </Card>

          <Card>
            <CardHeader title="سختی جلسات" subtitle={data.feedback.avgDifficulty ? `میانگین ${faNum(data.feedback.avgDifficulty, 1)} از ۵${data.feedback.painReports ? ` · ${faNum(data.feedback.painReports)} گزارش درد` : ""}` : "پس از پایان هر جلسه سختی آن را ثبت کنید."} />
            {data.feedback.difficultySeries.length > 1 ? <LineTrend data={data.feedback.difficultySeries} xKey="date" series={[{ key: "difficulty", name: "سختی (۱ تا ۵)", color: "#ef4444" }]} /> : <EmptyState title="بازخورد کافی ثبت نشده" />}
          </Card>
        </>
      )}
    </div>
  );
}
