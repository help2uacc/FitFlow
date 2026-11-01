/**
 * PDF report pipeline: request → queued job (pdf lane, sequential) → HTML →
 * Chromium (Playwright) → private file under STORAGE_DIR/reports → verified.
 */
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { env, storagePath } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { todayISO } from "@/lib/dates";
import { enqueueJob } from "@/domain/ai/jobs";
import { notify } from "@/domain/notifications/service";
import { getActiveNutritionVersion } from "@/domain/plans/nutrition-service";
import { getActiveWorkoutVersion, getCycle } from "@/domain/plans/workout-service";
import type { NutritionPlan, ProgressAnalysis, WorkoutPlan } from "@/domain/plans/schemas";
import { getProfile } from "@/domain/profile/service";
import { nutritionStats, personalBests, rangeFor, weeklyTraining, weightSeries, workoutAdherence } from "@/domain/progress/analytics";
import { listWorkoutLogs } from "@/domain/tracking/workouts";
import { cover, esc, fa, faDate, lineChartSvg, nutritionSection, workoutSection, wrap } from "./templates";

export type ReportKind = "workout" | "nutrition" | "combined" | "progress";
const KIND_FA: Record<ReportKind, string> = { workout: "برنامه تمرینی", nutrition: "برنامه غذایی", combined: "برنامه تمرینی و غذایی", progress: "گزارش پیشرفت" };
const GOAL_FA: Record<string, string> = { muscle_gain: "افزایش عضله", fat_loss: "کاهش چربی", recomp: "ترکیب بدنی", strength: "قدرت", endurance: "استقامت", general: "تناسب عمومی", mobility: "تحرک", maintain: "حفظ وزن" };

export function requestReport(db: DB, userId: string, kind: ReportKind, params: { range?: string } = {}) {
  if ((kind === "workout" || kind === "combined") && !getActiveWorkoutVersion(db, userId)) throw new AppError("no_plan", "برنامه تمرینی فعالی وجود ندارد.", 409);
  if ((kind === "nutrition" || kind === "combined") && !getActiveNutritionVersion(db, userId)) throw new AppError("no_nutrition", "برنامه غذایی فعال نیست؛ ابتدا برنامه غذایی را فعال کنید.", 409);
  const id = newId();
  db.insert(t.exportedReports).values({ id, userId, kind, status: "queued", params }).run();
  const { job } = enqueueJob(db, { userId, type: "pdf_export", payload: { reportId: id }, maxAttempts: 2 });
  db.update(t.exportedReports).set({ jobId: job.id }).where(eq(t.exportedReports.id, id)).run();
  return db.select().from(t.exportedReports).where(eq(t.exportedReports.id, id)).get()!;
}

export function listReports(db: DB, userId: string) {
  return db.select().from(t.exportedReports).where(eq(t.exportedReports.userId, userId)).orderBy(desc(t.exportedReports.createdAt)).limit(30).all();
}

export function markReportFailed(db: DB, reportId: string, code: string) {
  db.update(t.exportedReports).set({ status: "failed", error: code }).where(eq(t.exportedReports.id, reportId)).run();
}

export function reportFilePath(userId: string, fileName: string) {
  return storagePath("reports", userId, path.basename(fileName));
}

/** Read a ready report after verifying ownership. */
export async function readReport(db: DB, userId: string, id: string) {
  const r = db.select().from(t.exportedReports).where(and(eq(t.exportedReports.id, id), eq(t.exportedReports.userId, userId))).get();
  if (!r || r.status !== "ready" || !r.fileName) throw notFound("گزارش");
  const buf = await readFile(reportFilePath(userId, r.fileName));
  return { report: r, buf };
}

export async function deleteReports(db: DB, userId: string) {
  const rows = db.select().from(t.exportedReports).where(eq(t.exportedReports.userId, userId)).all();
  for (const r of rows) if (r.fileName) await unlink(reportFilePath(userId, r.fileName)).catch(() => {});
  db.delete(t.exportedReports).where(inArray(t.exportedReports.id, rows.map((r) => r.id).concat(["-"]))).run();
}

export async function buildReportHtml(db: DB, userId: string, kind: ReportKind, params: { range?: string } = {}) {
  const user = db.select().from(t.users).where(eq(t.users.id, userId)).get()!;
  const profile = getProfile(db, userId);
  const goal = GOAL_FA[profile.goals.primary ?? ""] ?? "—";
  const appUrl = env().APP_URL;
  const wv = getActiveWorkoutVersion(db, userId);
  const nv = getActiveNutritionVersion(db, userId);
  const cycle = wv ? getCycle(db, userId, wv.cycleId) : null;
  let body = "";
  if (kind === "workout" || kind === "combined") {
    const plan = wv!.plan as WorkoutPlan;
    const weeks = cycle ? Math.round((new Date(cycle.endDate).getTime() - new Date(cycle.startDate).getTime()) / 86400000 / 7) + (1 / 7 > 0 ? 0 : 0) : plan.durationWeeks;
    body += cover({
      title: kind === "combined" ? "برنامه تمرینی و غذایی" : plan.title, subtitle: plan.objective, name: user.displayName,
      rows: [["هدف اصلی", goal], ["دوره", cycle ? `دوره ${fa(cycle.cycleNumber)} — نسخه ${fa(wv!.version)}` : "—"], ["شروع", cycle ? faDate(cycle.startDate) : "—"], ["پایان", cycle ? faDate(cycle.endDate) : "—"], ["بازبینی", cycle ? faDate(cycle.reviewDate) : "—"], ["جلسات در هفته", fa(plan.sessions.length)]],
    });
    body += `<div class="page-break"></div>` + (await workoutSection(plan, { appUrl, weeks: Math.max(4, Math.min(6, Math.round(weeks) || plan.durationWeeks)), goal }));
  }
  if (kind === "nutrition" || kind === "combined") {
    const plan = nv!.plan as NutritionPlan;
    if (kind === "nutrition") body += cover({ title: plan.title, subtitle: "برنامه غذایی هفتگی", name: user.displayName, rows: [["هدف", goal], ["کالری روزانه", `${fa(plan.targets.kcal)} کیلوکالری`], ["نسخه", fa(nv!.version)], ["تاریخ تهیه", faDate(todayISO())]] });
    body += `<div class="page-break"></div>` + nutritionSection(plan);
  }
  if (kind === "progress") {
    const range = params.range ?? "30";
    const { from, to } = rangeFor(range);
    const adh = workoutAdherence(db, userId, from, to);
    const weekly = weeklyTraining(db, userId, from, to);
    const pbs = personalBests(db, userId).slice(0, 12);
    const weight = weightSeries(db, userId, from, to);
    const nut = nutritionStats(db, userId, from, to);
    const logs = listWorkoutLogs(db, userId, { limit: 50 }).items.filter((l) => l.date >= from);
    const analysis = db.select().from(t.aiJobs).where(and(eq(t.aiJobs.userId, userId), eq(t.aiJobs.type, "analyze_progress"), eq(t.aiJobs.status, "completed"))).orderBy(desc(t.aiJobs.createdAt)).get();
    const a = analysis?.result as ProgressAnalysis | undefined;
    body += cover({ title: "گزارش پیشرفت", subtitle: `بازه گزارش: ${faDate(from < "2001-01-01" ? to : from)} تا ${faDate(to)}`, name: user.displayName, rows: [["هدف اصلی", goal], ["جلسات انجام‌شده", fa(adh.completed)], ["پایبندی", adh.adherencePct === null ? "—" : `${fa(adh.adherencePct)}٪`], ["روند وزن", weight.trendKgPerWeek === null ? "داده ناکافی" : `${fa(weight.trendKgPerWeek, 2)} کیلوگرم در هفته`]] });
    body += `<div class="page-break"></div><h2>خلاصه تمرین</h2><div class="kpis"><div class="kpi">جلسات برنامه‌ریزی‌شده تاکنون<b>${fa(adh.plannedSoFar)}</b></div><div class="kpi">انجام‌شده<b>${fa(adh.completed)}</b></div><div class="kpi">ازدست‌رفته<b>${fa(adh.missed)}</b></div><div class="kpi">حجم کل (کیلوگرم)<b>${fa(adh.totalVolumeKg)}</b></div></div>`;
    body += `<h3>حجم هفتگی</h3>${lineChartSvg(weekly.map((w) => ({ x: w.week, y: w.volume })), { unit: "kg" })}`;
    body += `<h3>جلسات اخیر</h3><table><thead><tr><th>تاریخ</th><th>جلسه</th><th>وضعیت</th><th>مدت</th><th>حجم</th></tr></thead><tbody>${logs.map((l) => `<tr><td>${faDate(l.date)}</td><td>${esc(l.title)}</td><td>${{ completed: "انجام شد", missed: "از دست رفت", skipped: "رد شد", in_progress: "ناتمام", paused: "متوقف" }[l.status]}</td><td>${l.durationSec ? fa(Math.round(l.durationSec / 60)) + " دقیقه" : "—"}</td><td>${fa(l.totalVolumeKg)}</td></tr>`).join("") || `<tr><td colspan="5">جلسه‌ای ثبت نشده است.</td></tr>`}</tbody></table>`;
    body += `<h2>پیشرفت قدرت (رکوردها)</h2><table><thead><tr><th>حرکت</th><th>بیشترین وزنه</th><th>1RM تخمینی</th><th>تاریخ</th><th>جلسات</th></tr></thead><tbody>${pbs.map((p) => `<tr><td>${esc(p.nameFa)}</td><td>${fa(p.maxWeight, 1)}</td><td>${fa(p.bestE1rm, 1)}</td><td>${faDate(p.bestDate)}</td><td>${fa(p.sessions)}</td></tr>`).join("") || `<tr><td colspan="5">داده‌ای ثبت نشده است.</td></tr>`}</tbody></table><div class="muted">1RM تخمینی با فرمول اپلی محاسبه شده و فقط برآورد است.</div>`;
    body += `<h2>وزن و اندازه‌ها</h2>${lineChartSvg(weight.points.map((p) => ({ x: p.date, y: p.weightKg })), { unit: "kg" })}`;
    body += `<h2>تغذیه</h2><div class="kpis"><div class="kpi">روزهای ثبت‌شده<b>${fa(nut.loggedDays)}</b></div><div class="kpi">میانگین کالری (روزهای ثبت‌شده)<b>${fa(nut.avgKcal)}</b></div><div class="kpi">میانگین پروتئین<b>${fa(nut.avgProteinG)}</b></div><div class="kpi">پایبندی کالری<b>${nut.adherencePct === null ? "—" : fa(nut.adherencePct) + "٪"}</b></div></div>${nut.note ? `<div class="muted">${esc(nut.note)}</div>` : ""}`;
    if (a) body += `<h2>تحلیل و توصیه‌ها</h2><div class="box">${esc(a.summary)}${a.recommendations.length ? `<ul>${a.recommendations.map((r) => `<li><b>${esc(r.title)}:</b> ${esc(r.detail)}</li>`).join("")}</ul>` : ""}</div>`;
  }
  body += `<p class="disclaimer">تهیه‌شده توسط FitFlow در ${faDate(todayISO())}. مقادیر انرژی و 1RM تخمینی‌اند.</p>`;
  return wrap(KIND_FA[kind], body);
}

export async function renderPdf(html: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: env().CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<div></div>",
      footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#64748b;font-family:sans-serif">FitFlow · <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generateReport(db: DB, userId: string, reportId: string, ctl?: { progress: (m: string) => void }) {
  const r = db.select().from(t.exportedReports).where(and(eq(t.exportedReports.id, reportId), eq(t.exportedReports.userId, userId))).get();
  if (!r) throw new Error("report not found");
  ctl?.progress("در حال آماده‌سازی محتوا…");
  const html = await buildReportHtml(db, userId, r.kind, r.params as { range?: string });
  ctl?.progress("در حال ساخت فایل PDF…");
  const pdf = await renderPdf(html);
  const dir = storagePath("reports", userId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const fileName = `${r.kind}-${todayISO()}-${reportId.slice(0, 8)}.pdf`;
  const full = path.join(dir, fileName);
  await writeFile(full, pdf, { mode: 0o600 });
  // verify the file exists, is readable and is a PDF
  const st = await stat(full);
  const head = (await readFile(full)).subarray(0, 5).toString("latin1");
  if (st.size < 1000 || head !== "%PDF-") {
    await unlink(full).catch(() => {});
    throw new Error("generated PDF failed verification");
  }
  db.update(t.exportedReports).set({ status: "ready", fileName, sizeBytes: st.size, error: null }).where(eq(t.exportedReports.id, reportId)).run();
  notify(db, userId, { kind: "report_ready", title: "فایل PDF آماده است", body: `${KIND_FA[r.kind]} آماده دانلود است.`, url: "/reports", dedupeKey: `report:${reportId}` });
  return { reportId, fileName, sizeBytes: st.size };
}
