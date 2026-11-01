import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import { requireOnboardedUser } from "@/server/auth";
import { workoutHistory } from "@/domain/plans/workout-service";
import { nutritionHistory } from "@/domain/plans/nutrition-service";
import { Badge, Card, CardHeader, EmptyState, PageHeader, faDate, faDateTime, faNum } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "تاریخچه برنامه‌ها" };

const STATUS: Record<string, { l: string; tone: "brand" | "slate" | "amber" | "rose" | "sky" }> = {
  active: { l: "فعال", tone: "brand" }, superseded: { l: "جایگزین‌شده", tone: "slate" }, draft: { l: "پیش‌نویس", tone: "amber" }, rejected: { l: "ردشده", tone: "rose" },
  archived: { l: "بایگانی", tone: "slate" }, completed: { l: "تکمیل‌شده", tone: "sky" }, expired: { l: "منقضی", tone: "amber" },
};

export default async function HistoryPage() {
  const user = await requireOnboardedUser();
  const db = getDb();
  const cycles = workoutHistory(db, user.id);
  const nutrition = nutritionHistory(db, user.id);
  const changes = db.select().from(t.planChangeHistory).where(eq(t.planChangeHistory.userId, user.id)).orderBy(desc(t.planChangeHistory.createdAt)).limit(30).all();
  return (
    <div className="space-y-4">
      <PageHeader title="تاریخچه برنامه‌ها" subtitle="همه نسخه‌ها و دوره‌ها حفظ می‌شوند؛ هیچ سابقه‌ای حذف نمی‌شود." back="/program/workout" />
      {!cycles.length && <EmptyState title="هنوز برنامه‌ای ساخته نشده است" />}
      {cycles.map((c) => (
        <Card key={c.id}>
          <CardHeader title={`دوره ${faNum(c.cycleNumber)}`} subtitle={`${faDate(c.startDate)} تا ${faDate(c.endDate)}`} action={<Badge tone={STATUS[c.status]?.tone}>{STATUS[c.status]?.l ?? c.status}</Badge>} />
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {c.versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">نسخه {faNum(v.version)} — {v.revisionReason}</div>
                  <div className="text-xs text-slate-500">{faDateTime(v.createdAt)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={STATUS[v.status]?.tone}>{STATUS[v.status]?.l ?? v.status}</Badge>
                  <Link className="text-brand-700 underline dark:text-brand-300" href={v.status === "draft" ? `/program/review/${v.id}` : `/program/version/${v.id}`}>مشاهده</Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {nutrition.length > 0 && (
        <Card>
          <CardHeader title="نسخه‌های برنامه غذایی" />
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {nutrition.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                <div><div className="font-medium">نسخه {faNum(v.version)} — {v.revisionReason}</div><div className="num text-xs text-slate-500">{faNum(v.targetKcal)} کیلوکالری · پروتئین {faNum(v.proteinG)} گرم · {faDateTime(v.createdAt)}</div></div>
                <div className="flex items-center gap-2"><Badge tone={STATUS[v.status]?.tone}>{STATUS[v.status]?.l ?? v.status}</Badge>{v.status === "draft" && <Link className="text-brand-700 underline" href={`/program/review-nutrition/${v.id}`}>بررسی</Link>}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {changes.length > 0 && (
        <Card>
          <CardHeader title="گزارش تغییرات" />
          <ul className="space-y-2 text-sm">
            {changes.map((c) => {
              const lines = ((c.changes as { lines?: string[] })?.lines ?? []).slice(0, 4);
              return <li key={c.id}><div className="font-medium">{c.domain === "workout" ? "تمرین" : "تغذیه"}: {c.summary}</div><div className="text-xs text-slate-500">{faDateTime(c.createdAt)}{lines.length ? " — " + lines.join("؛ ") : ""}</div></li>;
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
