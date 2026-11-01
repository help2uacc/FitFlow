import catalogData from "./catalog.generated.json";

export interface CatalogExercise {
  id: string; nameFa: string; nameEn: string; pattern: string; category: string; level: string; mechanic: string | null;
  equipment: string[]; stress: string[]; primaryMuscles: string[]; secondaryMuscles: string[];
  instructionsEn: string[]; cuesFa: string[]; mistakesFa: string[]; safetyFa: string | null;
  media: { kind: string; localPath: string; sourceUrl: string; verifiedAt: string }[];
  referenceUrl: string; source: string;
}

export const CATALOG = catalogData as CatalogExercise[];
export const CATALOG_VERSION = "2026.11.1";

export const MUSCLE_FA: Record<string, string> = {
  abdominals: "شکم", hamstrings: "همسترینگ (پشت ران)", adductors: "نزدیک‌کننده ران", quadriceps: "چهارسر ران", biceps: "جلوبازو",
  shoulders: "سرشانه", chest: "سینه", "middle back": "میانه پشت", calves: "ساق پا", glutes: "باسن", "lower back": "پایین کمر",
  lats: "زیربغل (لت)", triceps: "پشت بازو", traps: "کول (ذوزنقه)", forearms: "ساعد", neck: "گردن", abductors: "دورکننده ران",
};
export const EQUIPMENT_FA: Record<string, string> = {
  barbell: "هالتر", dumbbell: "دمبل", machine: "دستگاه", cable: "سیم‌کش", bodyweight: "وزن بدن", bands: "کش", kettlebell: "کتل‌بل",
  bench: "نیمکت", pullup_bar: "میله بارفیکس", cardio_machine: "دستگاه هوازی", ezbar: "میله EZ", dip_bar: "پارالل", box: "سکو",
};
export const PATTERN_FA: Record<string, string> = {
  horizontal_push: "فشاری افقی", vertical_push: "فشاری عمودی", horizontal_pull: "کششی افقی", vertical_pull: "کششی عمودی",
  squat: "اسکوات", hinge: "لولای لگن", lunge: "لانج", upper_isolation: "تک‌مفصلی بالاتنه", lower_isolation: "تک‌مفصلی پایین‌تنه",
  core: "میان‌تنه", carry: "حمل", cardio: "هوازی", mobility: "تحرک/کشش",
};
export const LEVEL_RANK: Record<string, number> = { beginner: 1, intermediate: 2, expert: 3, advanced: 3 };

/** Map onboarding body areas to dataset muscle names. */
export const AREA_TO_MUSCLES: Record<string, string[]> = {
  chest: ["chest"], back: ["lats", "middle back", "lower back", "traps"], shoulders: ["shoulders"], arms: ["biceps", "triceps", "forearms"],
  abs: ["abdominals"], glutes: ["glutes"], legs: ["quadriceps", "hamstrings", "adductors", "abductors"], calves: ["calves"],
};

/** All of an exercise's equipment must be available. */
export function equipmentAvailable(ex: Pick<CatalogExercise, "equipment">, available: string[]) {
  return ex.equipment.every((e) => available.includes(e));
}

/** Alternatives score: same pattern & overlapping primary muscle. */
export function similarity(a: CatalogExercise, b: CatalogExercise) {
  if (a.id === b.id) return 0;
  let s = 0;
  if (a.pattern === b.pattern) s += 0.5;
  const overlap = a.primaryMuscles.filter((m) => b.primaryMuscles.includes(m)).length;
  if (overlap) s += 0.4;
  const sec = a.secondaryMuscles.filter((m) => b.secondaryMuscles.includes(m)).length;
  s += Math.min(0.1, sec * 0.03);
  return Math.round(s * 100) / 100;
}
