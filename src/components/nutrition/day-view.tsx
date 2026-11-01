"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, uid } from "@/lib/client";
import { saveSnapshot, submitOrQueue } from "@/lib/offline";
import { addDays } from "@/lib/dates";
import type { nutritionDay } from "@/domain/tracking/food";
import { MEAL_SLOT_FA } from "@/domain/plans/schemas";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, LinkButton, ProgressBar, faDate, faNum } from "@/components/ui";
import { AddFoodSheet } from "./add-food-sheet";
import { ReplaceSheet, type ReplaceTarget } from "./replace-sheet";
import { Sheet, Stepper } from "./sheet";

export type NutritionDayData = ReturnType<typeof nutritionDay>;
type Meal = NutritionDayData["meals"][number];
type Entry = NutritionDayData["entries"][number];

const slotFa = (s: string) => MEAL_SLOT_FA[s as keyof typeof MEAL_SLOT_FA] ?? s;
const STATUS: Record<Meal["status"], { label: string; tone: "slate" | "brand" | "amber" | "rose" }> = {
  pending: { label: "در انتظار", tone: "slate" }, eaten: { label: "خورده شد", tone: "brand" }, partial: { label: "بخشی خورده شد", tone: "amber" }, skipped: { label: "رد شد", tone: "rose" },
};

function MacroRow({ label, value, target, unit = "گرم", tone }: { label: string; value: number; target: number | null; unit?: string; tone: "brand" | "sky" | "amber" | "rose" }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm"><span>{label}</span><span className="num text-slate-600 dark:text-slate-300">{faNum(value)}{target ? ` / ${faNum(target)}` : ""} {unit}</span></div>
      {target ? <ProgressBar value={value} max={target} tone={tone} label={label} /> : null}
    </div>
  );
}

export function NutritionDayView({ initial, today, replaceQuery }: { initial: NutritionDayData; today: string; replaceQuery?: { slot?: string; criterion?: string; scope?: string } }) {
  const [day, setDay] = useState(initial);
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);
  const [busyMeal, setBusyMeal] = useState<string | null>(null);
  const [localDone, setLocalDone] = useState<Record<string, Meal["status"]>>({});
  const [partialMeal, setPartialMeal] = useState<Meal | null>(null);
  const [portion, setPortion] = useState(0.5);
  const [replaceMeal, setReplaceMeal] = useState<ReplaceTarget | null>(() => {
    // coach deep link: ?replace=1&slot=dinner&criterion=...&scope=...
    if (!replaceQuery?.slot) return null;
    const m = initial.meals.find((x) => x.slot === replaceQuery.slot) ?? initial.meals.find((x) => x.slot.startsWith(replaceQuery.slot!.split("_")[0]));
    return m ? { id: m.id, title: m.title, kcal: m.kcal, proteinG: m.proteinG } : null;
  });
  const [addOpen, setAddOpen] = useState<null | { slot: string; quick: boolean }>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [editGrams, setEditGrams] = useState(100);
  const date = day.date;

  const refresh = useCallback(async () => {
    try {
      const d = await api<NutritionDayData>(`/api/nutrition/day?date=${date}`);
      setDay(d);
      setLocalDone({});
    } catch { /* offline: keep current view */ }
  }, [date]);

  useEffect(() => { void saveSnapshot("nutrition_day", day); }, [day]);
  useEffect(() => {
    const onSync = () => void refresh();
    window.addEventListener("ff-synced", onSync);
    return () => window.removeEventListener("ff-synced", onSync);
  }, [refresh]);

  const queuedMsg = () => setNotice({ tone: "info", text: "آفلاین هستید؛ ثبت ذخیره شد و پس از اتصال همگام می‌شود." });

  const logMeal = async (m: Meal, action: "eaten" | "partial" | "skipped", p = 1) => {
    setBusyMeal(m.id); setNotice(null);
    const payload = { clientId: uid("meal"), date, plannedMealId: m.id, portion: p, action };
    try {
      const r = await submitOrQueue({ type: "log_planned_meal", payload }, () => api("/api/nutrition/log/planned", { body: payload }));
      if (r.queued) { setLocalDone((s) => ({ ...s, [m.id]: action })); queuedMsg(); } else await refresh();
    } catch (e) { setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "ثبت ناموفق بود." }); } finally { setBusyMeal(null); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try { await api(`/api/nutrition/log/${editing.id}`, { method: "PATCH", body: { grams: editGrams } }); setEditing(null); await refresh(); }
    catch (e) { setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "ویرایش ناموفق بود." }); }
  };
  const remove = async (e: Entry) => {
    if (!confirm(`«${e.label}» حذف شود؟`)) return;
    try { await api(`/api/nutrition/log/${e.id}`, { method: "DELETE" }); await refresh(); }
    catch (err) { setNotice({ tone: "error", text: err instanceof ApiError ? err.message : "حذف ناموفق بود." }); }
  };
  const toggleComplete = async () => {
    try { await api("/api/nutrition/day/complete", { body: { date, complete: day.completeness !== "complete" } }); await refresh(); }
    catch (e) { setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "خطا" }); }
  };

  const t = day.target;
  const nextMeal = day.meals.find((m) => (localDone[m.id] ?? m.status) === "pending");
  const extraEntries = day.entries.filter((e) => !e.plannedMealId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/nutrition/log?date=${addDays(date, -1)}`} className="rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200 dark:ring-slate-700" aria-label="روز قبل">→ دیروز</Link>
        <div className="text-center">
          <div className="font-bold">{date === today ? "امروز" : faDate(date, { weekday: "long" })}</div>
          <div className="text-xs text-slate-500">{faDate(date)}</div>
        </div>
        {date < today ? <Link href={`/nutrition/log?date=${addDays(date, 1)}`} className="rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200 dark:ring-slate-700" aria-label="روز بعد">فردا ←</Link> : <span className="w-16" />}
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <Card>
        <CardHeader title="خلاصه امروز" subtitle={t ? "هدف‌ها تخمینی‌اند و از برنامه فعال شما می‌آیند." : "برنامه غذایی فعالی برای این روز وجود ندارد."}
          action={<LinkButton href="/program/adjust?tab=nutrition" size="sm" variant="soft">تنظیم کالری</LinkButton>} />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60"><div className="text-xs text-slate-500">هدف</div><div className="num text-lg font-bold">{t ? faNum(t.kcal) : "—"}</div></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60"><div className="text-xs text-slate-500">ثبت‌شده</div><div className="num text-lg font-bold">{faNum(day.consumed.kcal)}</div></div>
          <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60"><div className="text-xs text-slate-500">باقی‌مانده</div><div className={"num text-lg font-bold " + (day.remainingKcal !== null && day.remainingKcal < 0 ? "text-rose-600" : "")}>{day.remainingKcal === null ? "—" : faNum(day.remainingKcal)}</div></div>
        </div>
        <div className="mt-4 space-y-3">
          <MacroRow label="کالری" value={day.consumed.kcal} target={t?.kcal ?? null} unit="کیلوکالری" tone="brand" />
          <MacroRow label="پروتئین" value={day.consumed.proteinG} target={t?.proteinG ?? null} tone="sky" />
          <MacroRow label="کربوهیدرات" value={day.consumed.carbsG} target={t?.carbsG ?? null} tone="amber" />
          <MacroRow label="چربی" value={day.consumed.fatG} target={t?.fatG ?? null} tone="rose" />
        </div>
        {nextMeal && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">وعده بعدی: <b>{slotFa(nextMeal.slot)}</b> — {nextMeal.title}{nextMeal.time ? ` (${nextMeal.time})` : ""}</p>}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAddOpen({ slot: nextMeal?.slot ?? "snack_pm", quick: false })}>+ افزودن غذا</Button>
        <Button variant="secondary" onClick={() => setAddOpen({ slot: "snack_pm", quick: true })}>میان‌وعده سریع</Button>
        <LinkButton href="/program/nutrition" variant="ghost">مشاهده برنامه هفتگی</LinkButton>
      </div>

      <section aria-label="وعده‌های برنامه" className="space-y-3">
        <h2 className="font-bold">وعده‌های برنامه</h2>
        {!day.meals.length && <EmptyState title="وعده برنامه‌ریزی‌شده‌ای برای این روز نیست">می‌توانید غذاهایتان را آزادانه ثبت کنید.</EmptyState>}
        {day.meals.map((m) => {
          const status = localDone[m.id] ?? m.status;
          return (
            <Card key={m.id} as="article" className={status !== "pending" ? "opacity-90" : ""}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-500">{slotFa(m.slot)}{m.time ? ` · ${m.time}` : ""}{m.substituted ? " · جایگزین امروز" : ""}</div>
                  <h3 className="font-bold">{m.title}</h3>
                </div>
                <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
              </div>
              <ul className="mt-2 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
                {m.items.map((it, i) => <li key={i}>• {it.nameFa} — {it.serving || `${faNum(it.grams)} گرم`}{it.serving ? <span className="num text-xs text-slate-400"> ({faNum(it.grams)} گرم)</span> : null}</li>)}
              </ul>
              <div className="num mt-2 text-sm">{faNum(m.kcal)} کیلوکالری · پروتئین {faNum(m.proteinG)} گرم</div>
              {m.instructions && <details className="mt-1 text-xs text-slate-500"><summary className="cursor-pointer">طرز تهیه{m.prepMinutes ? ` (${faNum(m.prepMinutes)} دقیقه)` : ""}</summary><p className="mt-1">{m.instructions}</p></details>}
              {status === "pending" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" loading={busyMeal === m.id} onClick={() => logMeal(m, "eaten")}>خوردم</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setPortion(0.5); setPartialMeal(m); }}>نصف/مقداری خوردم</Button>
                  <Button size="sm" variant="ghost" onClick={() => logMeal(m, "skipped")}>رد کردن وعده</Button>
                  <Button size="sm" variant="soft" onClick={() => setReplaceMeal({ id: m.id, title: m.title, kcal: m.kcal, proteinG: m.proteinG })}>جایگزین</Button>
                </div>
              )}
              {status !== "pending" && (
                <ul className="mt-2 space-y-1">
                  {day.entries.filter((e) => e.plannedMealId === m.id && e.status !== "skipped").map((e) => <EntryRow key={e.id} e={e} onEdit={() => { setEditing(e); setEditGrams(Math.round(e.grams)); }} onDelete={() => remove(e)} />)}
                </ul>
              )}
            </Card>
          );
        })}
      </section>

      <section aria-label="ثبت‌های خارج از برنامه" className="space-y-2">
        <h2 className="font-bold">غذاهای اضافه و خارج از برنامه</h2>
        {!extraEntries.length ? <p className="text-sm text-slate-500">موردی ثبت نشده است.</p> : (
          <Card><ul className="space-y-1">{extraEntries.map((e) => <EntryRow key={e.id} e={e} showSlot onEdit={() => { setEditing(e); setEditGrams(Math.round(e.grams)); }} onDelete={() => remove(e)} />)}</ul></Card>
        )}
      </section>

      <Card>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-5 accent-brand-600" checked={day.completeness === "complete"} onChange={toggleComplete} />
          <span>
            <span className="font-medium">همه غذاهای این روز را ثبت کرده‌ام</span>
            <span className="block text-xs text-slate-500">روزهایی که کامل علامت نخورده‌اند «داده ناقص» حساب می‌شوند، نه مصرف صفر؛ این کار دقت تحلیل‌ها را بیشتر می‌کند.</span>
          </span>
        </label>
      </Card>

      <AddFoodSheet open={!!addOpen} quick={addOpen?.quick} defaultSlot={addOpen?.slot} date={date} onClose={() => setAddOpen(null)}
        onLogged={(queued) => { if (queued) queuedMsg(); else { setNotice({ tone: "success", text: "ثبت شد." }); void refresh(); } }} />
      <ReplaceSheet meal={replaceMeal} date={date} initialCriterion={replaceQuery?.criterion} initialScope={replaceQuery?.scope} onClose={() => setReplaceMeal(null)}
        onApplied={(scope) => { setNotice({ tone: "success", text: scope === "plan" ? "وعده در برنامه جایگزین شد (نسخه جدید برنامه ساخته شد)." : "جایگزین برای امروز اعمال شد." }); void refresh(); }} />
      <Sheet open={!!partialMeal} onClose={() => setPartialMeal(null)} title="چه مقدار خوردید؟">
        {partialMeal && (
          <div className="space-y-4">
            <div className="font-medium">{partialMeal.title}</div>
            <input type="range" min={0.25} max={0.9} step={0.05} value={portion} onChange={(e) => setPortion(Number(e.target.value))} className="w-full" aria-label="مقدار مصرف" />
            <div className="num text-center text-lg font-bold">{faNum(Math.round(portion * 100))}٪ ≈ {faNum(partialMeal.kcal * portion)} کیلوکالری</div>
            <Button block loading={busyMeal === partialMeal.id} onClick={async () => { await logMeal(partialMeal, "partial", portion); setPartialMeal(null); }}>ثبت</Button>
          </div>
        )}
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title="ویرایش مقدار">
        {editing && (
          <div className="space-y-4">
            <div className="font-medium">{editing.label}</div>
            <Stepper value={editGrams} onChange={setEditGrams} />
            <Button block onClick={saveEdit}>ذخیره</Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function EntryRow({ e, onEdit, onDelete, showSlot }: { e: Entry; onEdit: () => void; onDelete: () => void; showSlot?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="min-w-0">
        <span className="font-medium">{e.label}</span>
        <span className="num block text-xs text-slate-500">{showSlot ? `${slotFa(e.mealSlot)} · ` : ""}{faNum(e.grams)} گرم · {faNum(e.kcal)} کیلوکالری · پروتئین {faNum(e.proteinG, 1)}</span>
      </span>
      <span className="flex shrink-0 gap-1">
        {e.foodId && <button onClick={onEdit} className="rounded-lg px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30">ویرایش</button>}
        <button onClick={onDelete} className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30">حذف</button>
      </span>
    </li>
  );
}
