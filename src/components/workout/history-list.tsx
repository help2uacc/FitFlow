"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Badge, Button, Card, EmptyState, faDate, faNum } from "@/components/ui";

export interface HistoryItem { id: string; title: string; date: string; status: string; durationSec: number | null; totalVolumeKg: number | null; unscheduled: boolean }
const STATUS: Record<string, { label: string; tone: "brand" | "amber" | "rose" | "slate" }> = {
  completed: { label: "انجام شد", tone: "brand" }, in_progress: { label: "در حال اجرا", tone: "amber" }, paused: { label: "متوقف", tone: "amber" },
  missed: { label: "از دست رفت", tone: "rose" }, skipped: { label: "رد شد", tone: "slate" },
};

export function HistoryList({ initial, nextBefore }: { initial: HistoryItem[]; nextBefore: string | null }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextBefore);
  const [busy, setBusy] = useState(false);
  const more = async () => {
    if (!cursor) return;
    setBusy(true);
    try {
      const r = await api<{ items: HistoryItem[]; nextBefore: string | null }>(`/api/workouts?before=${cursor}&limit=20`);
      setItems((x) => [...x, ...r.items.filter((i) => !x.some((y) => y.id === i.id))]);
      setCursor(r.nextBefore);
    } finally {
      setBusy(false);
    }
  };
  if (!items.length) return <EmptyState title="هنوز تمرینی ثبت نشده است">پس از اولین جلسه، سوابق اینجا نمایش داده می‌شود.</EmptyState>;
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <Link key={i.id} href={`/workouts/session/${i.id}`} className="block">
          <Card className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-semibold">{i.title}{i.unscheduled && <span className="text-xs text-slate-500"> (خارج از برنامه)</span>}</div>
              <div className="text-xs text-slate-500">{faDate(i.date)}{i.durationSec ? ` · ${faNum(Math.round(i.durationSec / 60))} دقیقه` : ""}{i.totalVolumeKg ? ` · ${faNum(i.totalVolumeKg)} کیلوگرم` : ""}</div>
            </div>
            <Badge tone={STATUS[i.status]?.tone ?? "slate"}>{STATUS[i.status]?.label ?? i.status}</Badge>
          </Card>
        </Link>
      ))}
      {cursor && <Button variant="secondary" block onClick={more} loading={busy}>نمایش بیشتر</Button>}
    </div>
  );
}
