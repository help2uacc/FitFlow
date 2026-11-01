"use client";
import { useEffect, useState } from "react";
import { api, uid, ApiError } from "@/lib/client";
import { submitOrQueue } from "@/lib/offline";
import { MEAL_SLOT_FA, MEAL_SLOTS } from "@/domain/plans/schemas";
import { Alert, Button, Field, Input, Select, faNum } from "@/components/ui";
import { Segmented, Sheet, Stepper } from "./sheet";

export interface FoodItem {
  id: string; nameFa: string; nameEn: string; category: string; servingG: number; servingLabel: string;
  kcal100: number; protein100: number; carbs100: number; fat100: number; confidence: string; userId: string | null;
}

const per = (f: FoodItem, g: number) => ({ kcal: (f.kcal100 * g) / 100, p: (f.protein100 * g) / 100, c: (f.carbs100 * g) / 100, f: (f.fat100 * g) / 100 });

export function useFoodSearch(q: string) {
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api<{ foods: FoodItem[] }>(`/api/foods?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        setFoods(r.foods);
      } catch { /* aborted/offline */ } finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q]);
  return { foods, loading };
}

function FoodPicker({ onPick }: { onPick: (f: FoodItem) => void }) {
  const [q, setQ] = useState("");
  const { foods, loading } = useFoodSearch(q);
  return (
    <div className="space-y-2">
      <Input placeholder="جستجوی غذا (مثلاً مرغ، برنج، سیب)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجوی غذا" autoFocus />
      <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
        {foods.map((f) => (
          <li key={f.id}>
            <button onClick={() => onPick(f)} className="flex w-full items-center justify-between gap-2 px-1 py-2.5 text-right hover:bg-slate-50 dark:hover:bg-slate-800">
              <span><span className="font-medium">{f.nameFa}</span><span className="block text-xs text-slate-500">{f.servingLabel}{f.userId ? " · شخصی" : ""}</span></span>
              <span className="num shrink-0 text-xs text-slate-500">{faNum(f.kcal100)} کالری/۱۰۰گ</span>
            </button>
          </li>
        ))}
        {!loading && !foods.length && <li className="py-4 text-center text-sm text-slate-500">موردی پیدا نشد؛ می‌توانید غذای سفارشی بسازید.</li>}
      </ul>
    </div>
  );
}

export function AddFoodSheet(props: {
  open: boolean; onClose: () => void; date: string; defaultSlot?: string; quick?: boolean; onLogged: (queued: boolean) => void;
}) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title={props.quick ? "ثبت سریع میان‌وعده" : "افزودن غذا"}>
      <AddFoodBody {...props} />
    </Sheet>
  );
}

function AddFoodBody({ onClose, date, defaultSlot = "snack_pm", quick = false, onLogged }: {
  onClose: () => void; date: string; defaultSlot?: string; quick?: boolean; onLogged: (queued: boolean) => void;
}) {
  const [tab, setTab] = useState<"search" | "custom" | "recipe">("search");
  const [food, setFood] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState(100);
  const [slot, setSlot] = useState(quick ? "snack_pm" : defaultSlot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (f: FoodItem) => { setFood(f); setGrams(Math.round(f.servingG)); };
  const log = async (f: FoodItem, g: number) => {
    setBusy(true); setError(null);
    const payload = { clientId: uid("food"), date, mealSlot: slot, foodId: f.id, grams: g, status: "eaten" as const };
    try {
      const r = await submitOrQueue({ type: "log_food", payload }, () => api("/api/nutrition/log", { body: payload }));
      onLogged(r.queued);
      onClose();
    } catch (e) { setError(e instanceof ApiError ? e.message : "ثبت ناموفق بود."); } finally { setBusy(false); }
  };

  return (
    <>
      {!food && (
        <div className="mb-3">
          <Segmented label="نوع افزودن" value={tab} onChange={setTab} options={[{ value: "search", label: "جستجو" }, { value: "custom", label: "غذای سفارشی" }, { value: "recipe", label: "دستور پخت" }]} />
        </div>
      )}
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {food ? (
        <div className="space-y-4">
          <div>
            <div className="font-semibold">{food.nameFa}</div>
            <div className="text-xs text-slate-500">واحد پیشنهادی: {food.servingLabel}{food.confidence === "low" ? " · مقادیر تخمینی" : ""}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Stepper value={grams} onChange={setGrams} step={food.servingG >= 50 ? 10 : 5} />
            <div className="flex gap-1">
              {[0.5, 1, 1.5, 2].map((m) => (
                <button key={m} onClick={() => setGrams(Math.round(food.servingG * m))} className="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{faNum(m, 1)} واحد</button>
              ))}
            </div>
          </div>
          {(() => { const m = per(food, grams); return <div className="num text-sm text-slate-600 dark:text-slate-300">{faNum(m.kcal)} کیلوکالری · پروتئین {faNum(m.p, 1)} · کربوهیدرات {faNum(m.c, 1)} · چربی {faNum(m.f, 1)} گرم</div>; })()}
          <Field label="وعده" htmlFor="slot">
            <Select id="slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
              {MEAL_SLOTS.map((s) => <option key={s} value={s}>{MEAL_SLOT_FA[s]}</option>)}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button block loading={busy} onClick={() => log(food, grams)}>ثبت</Button>
            <Button variant="secondary" onClick={() => setFood(null)}>تغییر غذا</Button>
          </div>
        </div>
      ) : tab === "search" ? (
        <FoodPicker onPick={pick} />
      ) : tab === "custom" ? (
        <CustomFoodForm onCreated={pick} />
      ) : (
        <RecipeBuilder onCreated={pick} />
      )}
    </>
  );
}

function num(v: string) {
  const n = Number(v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٫,]/g, "."));
  return Number.isFinite(n) ? n : NaN;
}

function CustomFoodForm({ onCreated }: { onCreated: (f: FoodItem) => void }) {
  const [v, setV] = useState({ nameFa: "", servingG: "100", servingLabel: "", kcal100: "", protein100: "", carbs100: "", fat100: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const f = await api<FoodItem>("/api/foods", { body: { nameFa: v.nameFa, servingG: num(v.servingG), servingLabel: v.servingLabel || undefined, kcal100: num(v.kcal100), protein100: num(v.protein100), carbs100: num(v.carbs100), fat100: num(v.fat100) } });
      onCreated(f);
    } catch (err) { setError(err instanceof ApiError ? (err.details as { message: string }[] | undefined)?.[0]?.message ?? err.message : "خطا"); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-slate-500">مقادیر را از برچسب تغذیه‌ای محصول، به ازای ۱۰۰ گرم وارد کنید.</p>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="نام غذا" htmlFor="cf-name"><Input id="cf-name" required value={v.nameFa} onChange={set("nameFa")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="اندازه هر واحد (گرم)" htmlFor="cf-sg"><Input id="cf-sg" inputMode="decimal" required value={v.servingG} onChange={set("servingG")} /></Field>
        <Field label="نام واحد (اختیاری)" htmlFor="cf-sl"><Input id="cf-sl" placeholder="مثلاً ۱ عدد" value={v.servingLabel} onChange={set("servingLabel")} /></Field>
        <Field label="کالری در ۱۰۰ گرم" htmlFor="cf-k"><Input id="cf-k" inputMode="decimal" required value={v.kcal100} onChange={set("kcal100")} /></Field>
        <Field label="پروتئین (گرم)" htmlFor="cf-p"><Input id="cf-p" inputMode="decimal" required value={v.protein100} onChange={set("protein100")} /></Field>
        <Field label="کربوهیدرات (گرم)" htmlFor="cf-c"><Input id="cf-c" inputMode="decimal" required value={v.carbs100} onChange={set("carbs100")} /></Field>
        <Field label="چربی (گرم)" htmlFor="cf-f"><Input id="cf-f" inputMode="decimal" required value={v.fat100} onChange={set("fat100")} /></Field>
      </div>
      <Button type="submit" block loading={busy}>ذخیره و انتخاب</Button>
    </form>
  );
}

function RecipeBuilder({ onCreated }: { onCreated: (f: FoodItem) => void }) {
  const [name, setName] = useState("");
  const [servings, setServings] = useState(2);
  const [items, setItems] = useState<{ food: FoodItem; grams: number }[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = items.reduce((a, i) => { const m = per(i.food, i.grams); return { kcal: a.kcal + m.kcal, p: a.p + m.p }; }, { kcal: 0, p: 0 });
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<{ food: FoodItem }>("/api/recipes", { body: { name, servings, ingredients: items.map((i) => ({ foodId: i.food.id, grams: i.grams })) } });
      onCreated(r.food);
    } catch (e) { setError(e instanceof ApiError ? e.message : "خطا"); } finally { setBusy(false); }
  };
  if (picking) return <FoodPicker onPick={(f) => { setItems([...items, { food: f, grams: Math.round(f.servingG) }]); setPicking(false); }} />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">مواد اولیه فقط یک بار محاسبه می‌شوند و دستور پخت به‌عنوان یک غذای شخصی ذخیره می‌شود.</p>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="نام دستور پخت" htmlFor="rc-name"><Input id="rc-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="تعداد پرس" htmlFor="rc-s"><Stepper value={servings} onChange={setServings} step={1} min={1} max={50} unit="پرس" /></Field>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
            <span className="text-sm">{it.food.nameFa}</span>
            <div className="flex items-center gap-1">
              <Stepper value={it.grams} onChange={(g) => setItems(items.map((x, j) => (j === i ? { ...x, grams: g } : x)))} />
              <button aria-label="حذف" onClick={() => setItems(items.filter((_, j) => j !== i))} className="px-2 text-rose-600">✕</button>
            </div>
          </li>
        ))}
      </ul>
      <Button variant="secondary" block onClick={() => setPicking(true)}>+ افزودن ماده اولیه</Button>
      {items.length > 0 && <div className="num text-sm text-slate-600 dark:text-slate-300">هر پرس ≈ {faNum(total.kcal / servings)} کیلوکالری، پروتئین {faNum(total.p / servings, 1)} گرم</div>}
      <Button block loading={busy} disabled={!name.trim() || !items.length} onClick={save}>ذخیره دستور پخت</Button>
    </div>
  );
}
