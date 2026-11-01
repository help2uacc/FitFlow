"use client";
import { useEffect, type ReactNode } from "react";

/** Simple accessible bottom sheet / dialog (bottom on mobile, centered on desktop). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="بستن" className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <div className="safe-bottom relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="بستن" className="grid size-9 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={"rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors " + (value === o.value ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, step = 10, min = 5, max = 3000, unit = "گرم" }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v))));
  return (
    <div className="inline-flex items-center gap-1 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700">
      <button type="button" aria-label="افزایش" onClick={() => set(value + step)} className="grid size-10 place-items-center text-lg">+</button>
      <input aria-label="مقدار" inputMode="numeric" value={value} onChange={(e) => { const n = Number(e.target.value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))); if (Number.isFinite(n)) onChange(n); }} onBlur={() => set(value)} className="num w-16 bg-transparent text-center" />
      <span className="text-xs text-slate-500">{unit}</span>
      <button type="button" aria-label="کاهش" onClick={() => set(value - step)} className="grid size-10 place-items-center text-lg">−</button>
    </div>
  );
}
