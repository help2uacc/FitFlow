"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Alert, Button, Spinner, faNum } from "@/components/ui";
import { Segmented, Sheet } from "./sheet";

type Criterion = "similar" | "lower_calorie" | "higher_protein" | "cheaper" | "quick";
interface Candidate {
  title: string; source: string; score: number;
  items: { foodId: string; grams: number; nameFa: string; kcal: number; proteinG: number }[];
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}
export interface ReplaceTarget { id: string; title: string; kcal: number; proteinG: number }

const CRITERIA: { value: Criterion; label: string }[] = [
  { value: "similar", label: "مشابه" }, { value: "lower_calorie", label: "کم‌کالری‌تر" }, { value: "higher_protein", label: "پروتئین بیشتر" },
  { value: "cheaper", label: "ارزان‌تر" }, { value: "quick", label: "سریع‌تر" },
];

export function ReplaceSheet({ meal, date, onClose, onApplied, initialCriterion = "similar", initialScope = "today" }: {
  meal: ReplaceTarget | null; date: string; onClose: () => void; onApplied: (scope: "today" | "plan") => void; initialCriterion?: string; initialScope?: string;
}) {
  const [criterion, setCriterion] = useState<Criterion>(CRITERIA.some((c) => c.value === initialCriterion) ? (initialCriterion as Criterion) : "similar");
  const [scope, setScope] = useState<"today" | "plan">(initialScope === "plan" ? "plan" : "today");
  const [res, setRes] = useState<{ key: string; cands?: Candidate[]; error?: string } | null>(null);
  const [applyError, setError] = useState<string | null>(null);
  const reqKey = meal ? `${meal.id}:${criterion}` : "";
  const cands = res?.key === reqKey ? res.cands ?? null : null;
  const error = applyError ?? (res?.key === reqKey ? res.error ?? null : null);
  const [confirm, setConfirm] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!meal) return;
    let stop = false;
    const key = `${meal.id}:${criterion}`;
    api<{ candidates: Candidate[] }>(`/api/nutrition/replace?plannedMealId=${encodeURIComponent(meal.id)}&criterion=${criterion}`)
      .then((r) => !stop && setRes({ key, cands: r.candidates }))
      .catch((e) => !stop && setRes({ key, error: e instanceof ApiError ? e.message : "خطا در دریافت پیشنهادها" }));
    return () => { stop = true; };
  }, [meal, criterion]);

  const apply = async (c: Candidate) => {
    if (!meal) return;
    setBusy(true); setError(null);
    try {
      await api("/api/nutrition/replace", { body: { plannedMealId: meal.id, scope, date, title: c.title.slice(0, 140), items: c.items.map((i) => ({ foodId: i.foodId, grams: i.grams })) } });
      setConfirm(null);
      onApplied(scope);
      onClose();
    } catch (e) { setError(e instanceof ApiError ? e.message : "اعمال جایگزین ناموفق بود."); } finally { setBusy(false); }
  };

  return (
    <Sheet open={!!meal} onClose={onClose} title={`جایگزین برای ${meal?.title ?? ""}`}>
      {meal && (
        <div className="space-y-3">
          <div className="num text-sm text-slate-500">وعده فعلی: {faNum(meal.kcal)} کیلوکالری · پروتئین {faNum(meal.proteinG)} گرم</div>
          <Segmented label="معیار جایگزینی" value={criterion} onChange={setCriterion} options={CRITERIA} />
          <Segmented label="دامنه اعمال" value={scope} onChange={setScope} options={[{ value: "today", label: "فقط امروز" }, { value: "plan", label: "در کل برنامه" }]} />
          {scope === "plan" && <p className="text-xs text-slate-500">با اعمال در کل برنامه، نسخه جدیدی از برنامه غذایی ساخته می‌شود؛ نسخه قبلی و ثبت‌های گذشته حفظ می‌شوند.</p>}
          {error && <Alert tone="error">{error}</Alert>}
          {!cands && !error && <div className="flex justify-center py-6"><Spinner /></div>}
          {cands && !cands.length && <Alert tone="info">جایگزین مناسبی با محدودیت‌های شما پیدا نشد.</Alert>}
          <ul className="space-y-2">
            {cands?.map((c, i) => (
              <li key={i} className="rounded-xl p-3 ring-1 ring-slate-200 dark:ring-slate-700">
                <div className="font-medium">{c.title}</div>
                <div className="mt-1 text-xs text-slate-500">{c.items.map((it) => `${it.nameFa} ${faNum(it.grams)} گرم`).join("، ")}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="num text-sm">{faNum(c.totals.kcal)} کیلوکالری · پروتئین {faNum(c.totals.proteinG)} گرم</span>
                  <Button size="sm" onClick={() => (scope === "plan" ? setConfirm(c) : apply(c))} loading={busy && scope === "today"}>انتخاب</Button>
                </div>
              </li>
            ))}
          </ul>
          {confirm && (
            <div role="alertdialog" aria-label="تأیید تغییر برنامه" className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
              <p className="text-sm">«{confirm.title}» در همه هفته‌ها جایگزین این وعده شود؟</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" loading={busy} onClick={() => apply(confirm)}>بله، اعمال در برنامه</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>انصراف</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
