"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { Alert, Button, Card, CardHeader, Select, faDate } from "@/components/ui";

interface Photo { id: string; date: string; pose: string | null; sizeBytes: number }
const POSES = [["front", "روبه‌رو"], ["side", "نیم‌رخ"], ["back", "پشت"]] as const;

export function ProgressPhotos({ today }: { today: string }) {
  const [items, setItems] = useState<Photo[]>([]);
  const [pose, setPose] = useState("front");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { try { setItems((await api<{ items: Photo[] }>("/api/progress/photos")).items); } catch { /* ignore */ } }, []);
  useEffect(() => { api<{ items: Photo[] }>("/api/progress/photos").then((r) => setItems(r.items)).catch(() => {}); }, []);

  const upload = async (file: File) => {
    setErr(null);
    if (file.size > 8 * 1024 * 1024) { setErr("حجم تصویر حداکثر ۸ مگابایت است."); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("date", today); fd.append("pose", pose);
      const res = await fetch("/api/progress/photos", { method: "POST", body: fd, credentials: "same-origin" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "بارگذاری ناموفق بود.");
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const remove = async (id: string) => {
    if (!confirm("این عکس برای همیشه حذف شود؟")) return;
    await api(`/api/progress/photos/${id}`, { method: "DELETE" });
    setItems((x) => x.filter((p) => p.id !== id));
  };

  return (
    <Card>
      <CardHeader title="عکس‌های پیشرفت (اختیاری)" subtitle="عکس‌ها خصوصی‌اند، فقط برای شما نمایش داده می‌شوند و هر زمان قابل حذف هستند." action={items.length ? <Button size="sm" variant="ghost" onClick={() => setShow(!show)}>{show ? "پنهان" : `نمایش (${items.length.toLocaleString("fa-IR")})`}</Button> : undefined} />
      <div className="flex flex-wrap items-end gap-2">
        <Select value={pose} onChange={(e) => setPose(e.target.value)} aria-label="زاویه عکس" className="w-36">{POSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>افزودن عکس</Button>
      </div>
      {err && <div className="mt-2"><Alert tone="error">{err}</Alert></div>}
      {show && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((p) => (
            <figure key={p.id} className="relative overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
              <img src={`/api/progress/photos/${p.id}`} alt={`عکس پیشرفت ${faDate(p.date)}`} loading="lazy" className="aspect-[3/4] w-full object-cover" />
              <figcaption className="flex items-center justify-between p-1.5 text-[11px]">
                <span>{faDate(p.date)} · {POSES.find(([v]) => v === p.pose)?.[1] ?? ""}</span>
                <button onClick={() => remove(p.id)} className="text-rose-600" aria-label="حذف عکس">حذف</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Card>
  );
}
