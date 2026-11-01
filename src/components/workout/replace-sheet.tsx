"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Alert, Button, Spinner } from "@/components/ui";
import { MUSCLE_FA } from "@/domain/exercises/catalog";

export interface Alternative { id: string; nameFa: string; nameEn: string; equipment: string[]; primaryMuscles: string[]; image: string | null; score: number }

/**
 * Bottom sheet listing suitable alternatives for an exercise.
 * `allowToday` shows the "only for this session" option.
 */
export function ReplaceSheet({ exerciseId, exerciseName, sessionKey, index, allowToday, onClose, onToday, onPlanReplaced }: {
  exerciseId: string; exerciseName: string; sessionKey?: string | null; index?: number | null; allowToday: boolean;
  onClose: () => void; onToday?: (alt: Alternative) => void; onPlanReplaced?: (versionId: string) => void;
}) {
  const [items, setItems] = useState<Alternative[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Alternative | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPlan, setConfirmPlan] = useState(false);

  useEffect(() => {
    api<{ items: Alternative[] }>(`/api/exercises/${encodeURIComponent(exerciseId)}/alternatives`).then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, [exerciseId]);

  const replaceInPlan = async () => {
    if (!chosen || sessionKey == null || index == null) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ versionId: string }>("/api/programs/substitute", { body: { sessionKey, index, newExerciseId: chosen.id } });
      onPlanReplaced?.(r.versionId);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="جایگزینی حرکت" onClick={onClose}>
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 sm:rounded-3xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">جایگزینی حرکت</h2>
            <p className="text-sm text-slate-500">به‌جای «{exerciseName}»</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="بستن">✕</Button>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        {!items && !error && <div className="flex justify-center p-6"><Spinner /></div>}
        {items && !items.length && <Alert tone="info">جایگزین مناسبی با تجهیزات و محدودیت‌های شما پیدا نشد.</Alert>}
        <ul className="space-y-2">
          {items?.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => { setChosen(a); setConfirmPlan(false); }}
                className={`flex w-full items-center gap-3 rounded-2xl p-2 text-right ring-1 ${chosen?.id === a.id ? "bg-brand-50 ring-brand-400 dark:bg-brand-900/40" : "ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800"}`}
              >
                {a.image ? <img src={a.image} alt="" loading="lazy" className="size-14 rounded-xl object-cover" /> : <div className="size-14 rounded-xl bg-slate-100 dark:bg-slate-800" />}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{a.nameFa}</div>
                  <div className="ltr truncate text-xs text-slate-500">{a.nameEn}</div>
                  <div className="text-xs text-slate-500">{a.primaryMuscles.map((m) => MUSCLE_FA[m] ?? m).join("، ")}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
        {chosen && (
          <div className="sticky bottom-0 mt-3 space-y-2 bg-white pt-2 dark:bg-slate-900">
            {allowToday && onToday && <Button block variant="secondary" onClick={() => { onToday(chosen); onClose(); }}>فقط برای همین جلسه</Button>}
            {sessionKey != null && index != null && (
              confirmPlan ? (
                <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
                  <p>یک نسخه جدید از برنامه با «{chosen.nameFa}» ساخته می‌شود. نسخه فعلی و سوابق تمرین حفظ می‌شوند.</p>
                  <div className="flex gap-2">
                    <Button onClick={replaceInPlan} loading={busy}>تأیید و اعمال</Button>
                    <Button variant="ghost" onClick={() => setConfirmPlan(false)}>انصراف</Button>
                  </div>
                </div>
              ) : <Button block onClick={() => setConfirmPlan(true)}>جایگزینی در کل برنامه</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
