export interface ProgressData {
  range: string; from: string; to: string;
  adherence: { planned: number; plannedSoFar: number; completed: number; completedPlanned: number; unscheduled: number; missed: number; adherencePct: number | null; totalVolumeKg: number; totalMinutes: number };
  weekly: { week: string; volume: number; completed: number; planned: number }[];
  weight: { points: { date: string; weightKg: number; avg7: number }[]; measurements: { date: string; waistCm: number | null; chestCm: number | null; armCm: number | null; hipCm: number | null; thighCm: number | null }[]; trendKgPerWeek: number | null };
  nutrition: { days: { date: string; kcal: number; proteinG: number; targetKcal: number | null; targetProteinG: number | null; entries: number; completeness: string }[]; loggedDays: number; completeDays: number; loggingRatePct: number; avgKcal: number | null; avgProteinG: number | null; avgTargetKcal: number | null; adherencePct: number | null; note: string | null };
  feedback: { avgDifficulty: number | null; difficultySeries: { date: string; difficulty: number }[]; painReports: number };
  personalBests: { exerciseId: string; nameFa: string; maxWeight: number; bestE1rm: number; bestDate: string; sessions: number }[];
}
export interface ProgressAnalysis {
  summary: string; wins: string[]; concerns: string[];
  recommendations: { title: string; detail: string; action: string }[];
  dataQuality: "insufficient" | "limited" | "good";
}
