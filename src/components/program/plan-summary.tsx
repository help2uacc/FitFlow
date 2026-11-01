import { WEEKDAY_FA, PERSIAN_WEEK_ORDER } from "@/lib/dates";
import { getCatalogExercise } from "@/domain/plans/validate-workout";
import type { WorkoutPlan } from "@/domain/plans/schemas";
import { Badge, Card, faNum } from "@/components/ui";

/** Compact read-only rendering of a workout plan (used by review/history pages). */
export function WorkoutPlanSummary({ plan }: { plan: WorkoutPlan }) {
  const sessions = [...plan.sessions].sort((a, b) => PERSIAN_WEEK_ORDER.indexOf(a.dayOfWeek) - PERSIAN_WEEK_ORDER.indexOf(b.dayOfWeek));
  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <Card key={s.key}>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-bold">{WEEKDAY_FA[s.dayOfWeek]} — {s.title}</div>
            <Badge>{faNum(s.estimatedMinutes)} دقیقه</Badge>
          </div>
          <ol className="space-y-1 text-sm">
            {s.exercises.map((e, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{getCatalogExercise(e.exerciseId)?.nameFa ?? e.exerciseId}</span>
                <span className="num shrink-0 text-slate-500">{faNum(e.sets)}×{faNum(e.repMin)}–{faNum(e.repMax)}{e.unit === "seconds" ? " ث" : e.unit === "minutes" ? " دقیقه" : ""}{e.targetRir !== null ? ` · RIR ${faNum(e.targetRir)}` : ""}</span>
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}

export function ChangeSummaryCard({ cs, coachMessage }: { cs: WorkoutPlan["changeSummary"]; coachMessage?: string }) {
  const block = (t: string, xs: string[]) => (xs.length ? <div><div className="mb-1 text-sm font-semibold">{t}</div><ul className="list-disc space-y-0.5 pr-5 text-sm">{xs.map((x) => <li key={x}>{x}</li>)}</ul></div> : null);
  return (
    <Card className="space-y-3">
      {coachMessage && <p className="text-sm leading-7">{coachMessage}</p>}
      {block("چه چیزی ثابت ماند", cs.kept)}
      {block("چه چیزی تغییر کرد", cs.changed)}
      {block("چرا", cs.reasons)}
      {block("اهداف این نسخه", cs.targets)}
    </Card>
  );
}
