"use client";
import { useState } from "react";
import { api, uid } from "@/lib/client";
import { submitOrQueue } from "@/lib/offline";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";

const FIELDS = [["waistCm", "دور کمر"], ["chestCm", "دور سینه"], ["armCm", "دور بازو"], ["hipCm", "دور باسن"], ["thighCm", "دور ران"]] as const;

export function BodyForm({ today, onSaved }: { today: string; onSaved?: () => void }) {
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [more, setMore] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const toNum = (s: string) => { const v = Number(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٫,]/g, ".")); return s.trim() && Number.isFinite(v) ? v : null; };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const w = toNum(weight);
    const extra = Object.fromEntries(FIELDS.map(([k]) => [k, toNum(vals[k] ?? "")]).filter(([, v]) => v !== null));
    if (w === null && !Object.keys(extra).length && !energy) { setMsg({ tone: "error", text: "حداقل یک مقدار وارد کنید." }); return; }
    setBusy(true);
    try {
      const clientId = uid("body");
      const payload = { clientId, date, weightKg: w, ...extra, energy };
      const onlyWeight = w !== null && !Object.keys(extra).length && !energy;
      if (onlyWeight) {
        const r = await submitOrQueue({ type: "log_weight", payload: { clientId, date, weightKg: w } }, () => api("/api/body", { body: payload }));
        setMsg(r.queued ? { tone: "info", text: "آفلاین هستید؛ وزن ذخیره شد و پس از اتصال همگام می‌شود." } : { tone: "success", text: "ثبت شد." });
      } else {
        await api("/api/body", { body: payload });
        setMsg({ tone: "success", text: "ثبت شد." });
      }
      setWeight(""); setVals({}); setEnergy(null);
      onSaved?.();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="ثبت وزن و اندازه‌ها" subtitle="بهتر است صبح، ناشتا و پس از دستشویی وزن کنید." />
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="وزن (کیلوگرم)" htmlFor="bw"><Input id="bw" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="مثلاً ۷۸٫۴" /></Field>
          <Field label="تاریخ" htmlFor="bd"><Input id="bd" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <button type="button" className="text-sm text-brand-700 dark:text-brand-300" onClick={() => setMore(!more)}>{more ? "پنهان کردن اندازه‌ها" : "+ اندازه‌های بدن و انرژی (اختیاری)"}</button>
        {more && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {FIELDS.map(([k, l]) => <Field key={k} label={`${l} (سانتی‌متر)`} htmlFor={k}><Input id={k} inputMode="decimal" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></Field>)}
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium">سطح انرژی امروز</div>
              <div className="flex gap-2">{[1, 2, 3, 4, 5].map((v) => <button type="button" key={v} onClick={() => setEnergy(energy === v ? null : v)} className={`size-11 rounded-xl ring-1 ${energy === v ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-300 dark:ring-slate-700"}`}>{v.toLocaleString("fa-IR")}</button>)}</div>
            </div>
          </div>
        )}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" loading={busy} block>ذخیره</Button>
      </form>
    </Card>
  );
}
