/** Calendar-day helpers. Days are ISO `YYYY-MM-DD` strings in the user's time zone. */
export function todayISO(tz = "Asia/Tehran", now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso: string): number {
  return parseISODate(iso).getUTCDay();
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000);
}
export function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseISODate(s).getTime()) && parseISODate(s).toISOString().slice(0, 10) === s;
}
export const WEEKDAY_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
/** Persian week order starting Saturday. */
export const PERSIAN_WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
