"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, Input, Select, faNum } from "@/components/ui";
import { EQUIPMENT_FA, MUSCLE_FA, PATTERN_FA } from "@/domain/exercises/catalog";

export interface LibraryItem { id: string; nameFa: string; nameEn: string; pattern: string; level: string; equipment: string[]; primaryMuscles: string[]; image: string | null }

export function ExerciseLibrary({ items }: { items: LibraryItem[] }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [pattern, setPattern] = useState("");
  const muscles = useMemo(() => [...new Set(items.flatMap((i) => i.primaryMuscles))], [items]);
  const filtered = items.filter((i) => {
    const t = q.trim().toLowerCase();
    return (!t || i.nameFa.includes(t) || i.nameEn.toLowerCase().includes(t)) && (!muscle || i.primaryMuscles.includes(muscle)) && (!equipment || i.equipment.includes(equipment)) && (!pattern || i.pattern === pattern);
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="search" placeholder="جستجوی حرکت (فارسی یا انگلیسی)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجو" className="sm:col-span-2" />
        <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label="عضله">
          <option value="">همه عضلات</option>
          {muscles.map((m) => <option key={m} value={m}>{MUSCLE_FA[m] ?? m}</option>)}
        </Select>
        <Select value={equipment} onChange={(e) => setEquipment(e.target.value)} aria-label="تجهیزات">
          <option value="">همه تجهیزات</option>
          {Object.entries(EQUIPMENT_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="الگوی حرکتی" className="sm:col-span-2">
          <option value="">همه الگوها</option>
          {Object.entries(PATTERN_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <p className="text-sm text-slate-500">{faNum(filtered.length)} حرکت</p>
      {!filtered.length && <EmptyState title="حرکتی پیدا نشد">فیلترها را تغییر دهید.</EmptyState>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {filtered.map((i) => (
          <li key={i.id}>
            <Link href={`/exercises/${encodeURIComponent(i.id)}`} className="block">
              <Card className="flex gap-3 transition hover:ring-brand-300">
                {i.image ? <img src={i.image} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" /> : <div className="size-20 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800" />}
                <div className="min-w-0">
                  <div className="font-bold">{i.nameFa}</div>
                  <div className="ltr truncate text-xs text-slate-500">{i.nameEn}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i.primaryMuscles.map((m) => <Badge key={m} tone="brand">{MUSCLE_FA[m] ?? m}</Badge>)}
                    <Badge>{PATTERN_FA[i.pattern] ?? i.pattern}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{i.equipment.map((e) => EQUIPMENT_FA[e] ?? e).join("، ")}</div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
