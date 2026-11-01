import { authed } from "@/server/api";
import { personalBests, rangeFor, recentFeedback, weeklyTraining, weightSeries, workoutAdherence, nutritionStats } from "@/domain/progress/analytics";
import { todayISO } from "@/lib/dates";

export const GET = authed(({ req, db, user }) => {
  const range = req.nextUrl.searchParams.get("range") ?? "30";
  const { from, to } = rangeFor(["7", "14", "30", "90", "all"].includes(range) ? range : "30", todayISO(user.timezone));
  const fb = recentFeedback(db, user.id, from);
  return {
    range, from, to,
    adherence: workoutAdherence(db, user.id, from, to),
    weekly: weeklyTraining(db, user.id, from, to),
    weight: weightSeries(db, user.id, from, to),
    nutrition: nutritionStats(db, user.id, from, to),
    feedback: { avgDifficulty: fb.avgDifficulty, difficultySeries: fb.difficultySeries, painReports: fb.painReports.length },
    personalBests: personalBests(db, user.id),
  };
});
