"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { NutritionPlan } from "@/domain/plans/schemas";
import { MEAL_SLOT_FA } from "@/domain/plans/schemas";
import { PERSIAN_WEEK_ORDER, WEEKDAY_FA } from "@/lib/dates";
import { api, ApiError } from "@/lib/client";
import { Alert, Button, Card, faNum } from "@/components/ui";
import { JobStatus } from "@/components/job-status";

const slotFa = (s: string) => MEAL_SLOT_FA[s as keyof typeof MEAL_SLOT_FA] ?? s;

export function WeekMenu({ plan, todayDow }: { plan: NutritionPlan; todayDow: number }) {
  const days = [...plan.days].sort((a, b) => PERSIAN_WEEK_ORDER.indexOf(a.dayOfWeek) - PERSIAN_WEEK_ORDER.indexOf(b.dayOfWeek));
  const [sel, setSel] = useState(days.some((d) => d.dayOfWeek === todayDow) ? todayDow : days[0]?.dayOfWeek);
  const day = days.find((d) => d.dayOfWeek === sel);
  return (
    <div>
      <div role="tablist" aria-label="روزهای هفته" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
        {days.map((d) => (
          <button key={d.dayOfWeek} role="tab" aria-selected={sel === d.dayOfWeek} onClick={() => setSel(d.dayOfWeek)}
            className={"shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 " + (sel === d.dayOfWeek ? "bg-brand-600 text-white ring-brand-600" : "bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700")}>
            {WEEKDAY_FA[d.dayOfWeek]}{d.dayOfWeek === todayDow ? " (امروز)" : ""}
          </button>
        ))}
      </div>
      {day && (
        <div role="tabpanel" className="space-y-3">
          <div className="num text-sm text-slate-600 dark:text-slate-300">جمع روز: {faNum(day.totals.kcal)} کیلوکالری · پروتئین {faNum(day.totals.proteinG)} · کربوهیدرات {faNum(day.totals.carbsG)} · چربی {faNum(day.totals.fatG)} گرم</div>
          {day.meals.map((m, i) => (
            <Card key={i} as="article">
              <div className="text-xs text-slate-500">{slotFa(m.slot)} · {m.time}</div>
              <h3 className="font-bold">{m.title}</h3>
              <table className="mt-2 w-full text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="text-right font-normal">ماده غذایی</th><th className="text-right font-normal">مقدار</th><th className="text-left font-normal">کالری</th><th className="text-left font-normal">پروتئین</th></tr></thead>
                <tbody>
                  {m.items.map((it, j) => (
                    <tr key={j} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1">{it.nameFa}</td>
                      <td className="py-1 text-xs"><span className="num">{faNum(it.grams)} گرم</span><span className="block text-slate-500">{it.serving}</span></td>
                      <td className="num py-1 text-left">{faNum(it.kcal)}</td>
                      <td className="num py-1 text-left">{faNum(it.proteinG, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="num mt-1 text-sm font-medium">{faNum(m.totals.kcal)} کیلوکالری · پروتئین {faNum(m.totals.proteinG)} · کربوهیدرات {faNum(m.totals.carbsG)} · چربی {faNum(m.totals.fatG)} گرم</div>
              {m.instructions && <p className="mt-1 text-xs text-slate-500">طرز تهیه ({faNum(m.prepMinutes)} دقیقه): {m.instructions}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const CAT_FA: Record<string, string> = {
  protein: "پروتئین", dairy: "لبنیات", legume: "حبوبات", grain: "غلات و نان", veg_starch: "سیب‌زمینی و نشاسته‌ای", fruit: "میوه", vegetable: "سبزیجات",
  nuts: "مغزها", fat: "روغن و چربی", treat: "تنقلات", sweet: "شیرینی", prepared: "غذاهای آماده", drink: "نوشیدنی", supplement: "مکمل", custom: "شخصی", recipe: "دستور پخت",
};

export function GroceryList({ items, versionId }: { items: NutritionPlan["groceryList"]; versionId: string }) {
  const key = `ff-grocery-${versionId}`;
  const raw = useSyncExternalStore(
    (cb) => { window.addEventListener("ff-grocery", cb); window.addEventListener("storage", cb); return () => { window.removeEventListener("ff-grocery", cb); window.removeEventListener("storage", cb); }; },
    () => { try { return localStorage.getItem(key) ?? "{}"; } catch { return "{}"; } },
    () => "{}",
  );
  const checked = useMemo<Record<string, boolean>>(() => { try { return JSON.parse(raw); } catch { return {}; } }, [raw]);
  const toggle = (id: string) => {
    try { localStorage.setItem(key, JSON.stringify({ ...checked, [id]: !checked[id] })); } catch { /* ignore */ }
    window.dispatchEvent(new Event("ff-grocery"));
  };
  const groups = items.reduce<Record<string, typeof items>>((a, i) => ((a[i.category] ??= []).push(i), a), {});
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat}>
          <h3 className="mb-1 text-sm font-semibold text-slate-500">{CAT_FA[cat] ?? cat}</h3>
          <ul className="space-y-1">
            {list.map((g) => (
              <li key={g.foodId}>
                <label className="flex items-center gap-3 py-1">
                  <input type="checkbox" className="size-5 accent-brand-600" checked={!!checked[g.foodId]} onChange={() => toggle(g.foodId)} />
                  <span className={checked[g.foodId] ? "text-slate-400 line-through" : ""}>{g.nameFa}</span>
                  <span className="num ms-auto text-sm text-slate-500">{g.label.replace(/\d+(\.\d+)?/g, (x) => faNum(Number(x), 1))}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function GeneratePlan({ pendingJobId, label = "ساخت برنامه غذایی" }: { pendingJobId?: string | null; label?: string }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(pendingJobId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ job: { id: string } }>("/api/nutrition/plan", { method: "POST" });
      setJobId(r.job.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "nutrition_onboarding") router.push("/nutrition/setup");
      else setError(e instanceof ApiError ? e.message : "خطا");
    } finally { setBusy(false); }
  };
  if (jobId) return <JobStatus jobId={jobId} title="تولید برنامه غذایی" onDone={(j) => { if (j.status === "completed") router.refresh(); }} />;
  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <Button onClick={start} loading={busy}>{label}</Button>
    </div>
  );
}
