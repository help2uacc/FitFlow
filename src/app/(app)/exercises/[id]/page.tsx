import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireOnboardedUser } from "@/server/auth";
import { exerciseDetail } from "@/domain/tracking/workout-views";
import { exerciseAlternatives } from "@/domain/adjust/service";
import { EQUIPMENT_FA, MUSCLE_FA, PATTERN_FA } from "@/domain/exercises/catalog";
import { AppError } from "@/lib/errors";
import { Badge, Card, CardHeader, PageHeader, faDate } from "@/components/ui";

export const dynamic = "force-dynamic";
const LEVEL_FA: Record<string, string> = { beginner: "مبتدی", intermediate: "متوسط", expert: "پیشرفته", advanced: "پیشرفته" };

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const user = await requireOnboardedUser();
  const db = getDb();
  let d;
  try {
    d = exerciseDetail(db, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const { exercise: ex, media, sources } = d;
  const alts = exerciseAlternatives(db, user.id, id);
  const dataset = sources.find((s) => s.kind === "dataset" || s.kind === "reference");
  const video = sources.find((s) => s.kind === "video" || s.kind === "video_search");
  const images = media.filter((m) => m.kind === "image" && m.verified);
  return (
    <div className="space-y-4">
      <PageHeader title={ex.nameFa} subtitle={<span className="ltr">{ex.nameEn}</span>} back="/exercises" />
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((m) => <img key={m.id} src={m.localPath ?? m.url} alt={`${ex.nameFa} — مرحله ${m.sortOrder + 1}`} loading="lazy" className="aspect-[4/3] w-full rounded-2xl bg-slate-100 object-cover dark:bg-slate-800" />)}
        </div>
      )}
      <Card>
        <div className="flex flex-wrap gap-1.5">
          {ex.primaryMuscles.map((m) => <Badge key={m} tone="brand">{MUSCLE_FA[m] ?? m}</Badge>)}
          {ex.secondaryMuscles.map((m) => <Badge key={m}>{MUSCLE_FA[m] ?? m}</Badge>)}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-slate-500">تجهیزات</dt><dd>{ex.equipment.map((e) => EQUIPMENT_FA[e] ?? e).join("، ")}</dd></div>
          <div><dt className="text-slate-500">سطح</dt><dd>{LEVEL_FA[ex.level] ?? ex.level}</dd></div>
          <div><dt className="text-slate-500">الگوی حرکتی</dt><dd>{PATTERN_FA[ex.pattern] ?? ex.pattern}</dd></div>
          <div><dt className="text-slate-500">نوع</dt><dd>{ex.mechanic === "compound" ? "چندمفصلی" : ex.mechanic === "isolation" ? "تک‌مفصلی" : "—"}</dd></div>
        </dl>
      </Card>
      <Card>
        <CardHeader title="نکات اجرای صحیح" />
        <ul className="list-disc space-y-1 pr-5 text-sm">{ex.cuesFa.map((c, i) => <li key={i}>{c}</li>)}</ul>
        <h3 className="mt-3 text-sm font-semibold">اشتباهات رایج</h3>
        <ul className="list-disc space-y-1 pr-5 text-sm">{ex.mistakesFa.map((c, i) => <li key={i}>{c}</li>)}</ul>
        {ex.safetyFa && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">⚠ {ex.safetyFa}</p>}
        {ex.instructionsEn.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium">دستورالعمل کامل (انگلیسی)</summary>
            <ol dir="ltr" className="mt-2 list-decimal space-y-1 pl-5 text-left text-slate-600 dark:text-slate-300">{ex.instructionsEn.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </details>
        )}
      </Card>
      <Card>
        <CardHeader title="منابع و ویدیو" />
        <ul className="space-y-2 text-sm">
          {dataset && (
            <li>
              <a href={dataset.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline dark:text-brand-300">مرجع: {dataset.title}</a>{" "}
              {dataset.verified ? <Badge tone="brand">تأییدشده{dataset.verifiedAt ? ` · ${faDate(dataset.verifiedAt)}` : ""}</Badge> : <Badge>تأیید نشده</Badge>}
              <div className="text-xs text-slate-500">{dataset.attribution}</div>
            </li>
          )}
          {video && (
            <li>
              <a href={video.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline dark:text-brand-300">جستجوی ویدیوی آموزشی در یوتیوب</a>
              <div className="text-xs text-slate-500">این پیوند یک جستجو است، نه ویدیوی مشخصِ تأییدشده.</div>
            </li>
          )}
        </ul>
        {images[0] && <p className="mt-3 text-xs text-slate-500">تصاویر: free-exercise-db — Unlicense / مالکیت عمومی ({images[0].license}){ex.lastValidatedAt ? ` · آخرین بررسی ${faDate(ex.lastValidatedAt)}` : ""}</p>}
      </Card>
      {alts.length > 0 && (
        <Card>
          <CardHeader title="حرکات جایگزین مناسب شما" subtitle="بر اساس تجهیزات و محدودیت‌های پروفایل" />
          <ul className="grid gap-2 sm:grid-cols-2">
            {alts.map((a) => (
              <li key={a.id}>
                <Link href={`/exercises/${encodeURIComponent(a.id)}`} className="flex items-center gap-3 rounded-xl p-2 ring-1 ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800">
                  {a.image ? <img src={a.image} alt="" loading="lazy" className="size-12 rounded-lg object-cover" /> : <div className="size-12 rounded-lg bg-slate-100 dark:bg-slate-800" />}
                  <div className="min-w-0"><div className="truncate font-medium">{a.nameFa}</div><div className="ltr truncate text-xs text-slate-500">{a.nameEn}</div></div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
