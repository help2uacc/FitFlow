/**
 * HTML templates for PDF reports (A4, RTL, embedded Vazirmatn font).
 * Only licensed media (public-domain exercise images stored locally) are embedded.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { getCatalogExercise } from "@/domain/plans/validate-workout";
import { MUSCLE_FA } from "@/domain/exercises/catalog";
import { MEAL_SLOT_FA, type NutritionPlan, type WorkoutPlan } from "@/domain/plans/schemas";
import { WEEKDAY_FA, PERSIAN_WEEK_ORDER } from "@/lib/dates";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const fa = (n: number | null | undefined, digits = 0) => (n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: digits }));
export const faDate = (iso: string) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

function fontFace() {
  const dir = path.join(process.cwd(), "assets/fonts");
  const face = (file: string, weight: number, range: string) => {
    const p = path.join(dir, file);
    if (!existsSync(p)) return "";
    return `@font-face{font-family:Vazirmatn;font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(p).toString("base64")}) format("woff2");unicode-range:${range};}`;
  };
  const AR = "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC";
  const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  return face("vazirmatn-arabic-400-normal.woff2", 400, AR) + face("vazirmatn-arabic-700-normal.woff2", 700, AR) + face("vazirmatn-latin-400-normal.woff2", 400, LAT) + face("vazirmatn-latin-700-normal.woff2", 700, LAT);
}

const CSS = `
*{box-sizing:border-box} html,body{margin:0;padding:0}
body{font-family:Vazirmatn,Tahoma,sans-serif;direction:rtl;color:#1b2430;font-size:10.5pt;line-height:1.75}
h1{font-size:22pt;margin:0 0 6mm;color:#0f5132} h2{font-size:15pt;color:#0f5132;border-bottom:2px solid #d9efe3;padding-bottom:2mm;margin:8mm 0 4mm}
h3{font-size:12pt;margin:5mm 0 2mm;color:#14532d}
.page-break{page-break-before:always}
.cover{height:250mm;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:0 10mm;background:linear-gradient(160deg,#ecfdf3 0%,#ffffff 60%);border-radius:6mm}
.cover .brand{font-size:12pt;letter-spacing:2px;color:#15803d;font-weight:700;direction:ltr}
.cover .sub{font-size:13pt;color:#334155}
.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:3mm 8mm;margin-top:8mm;font-size:11pt}
.meta b{color:#0f5132}
table{width:100%;border-collapse:collapse;margin:2mm 0 4mm;font-size:9.5pt}
th,td{border:1px solid #d6dde4;padding:1.6mm 2mm;text-align:right;vertical-align:top}
th{background:#f0f7f3;font-weight:700}
tr{page-break-inside:avoid}
thead{display:table-header-group}
.en{direction:ltr;unicode-bidi:isolate;color:#64748b;font-size:8.5pt}
.pill{display:inline-block;background:#ecfdf3;color:#166534;border-radius:3mm;padding:0 2.5mm;font-size:8.5pt;margin-left:1mm}
.box{border:1px solid #d6dde4;border-radius:3mm;padding:3mm 4mm;margin:3mm 0;page-break-inside:avoid}
.muted{color:#64748b;font-size:9pt}
.ex{display:grid;grid-template-columns:44mm 1fr 26mm;gap:4mm;border:1px solid #e2e8f0;border-radius:3mm;padding:3mm;margin:3mm 0;page-break-inside:avoid}
.ex img{width:44mm;height:32mm;object-fit:cover;border-radius:2mm;background:#f1f5f9}
.ex .qr{text-align:center;font-size:7.5pt;color:#64748b} .ex .qr img{width:24mm;height:24mm;object-fit:contain;background:none}
a{color:#0e7490;text-decoration:underline;word-break:break-all}
ul{margin:1mm 0;padding-right:5mm} li{margin:0.5mm 0}
.track td{height:8mm}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:3mm 0}
.kpi{border:1px solid #d6dde4;border-radius:3mm;padding:3mm;text-align:center} .kpi b{display:block;font-size:14pt;color:#0f5132}
.disclaimer{font-size:8.5pt;color:#64748b;margin-top:6mm}
`;

export function wrap(title: string, body: string) {
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${fontFace()}${CSS}</style></head><body>${body}</body></html>`;
}

function imageDataUri(localPath: string | undefined) {
  if (!localPath) return null;
  const p = path.join(process.cwd(), "public", localPath.replace(/^\//, ""));
  if (!existsSync(p)) return null;
  return `data:image/jpeg;base64,${readFileSync(p).toString("base64")}`;
}

export function cover(o: { title: string; subtitle: string; name: string; rows: [string, string][] }) {
  return `<section class="cover"><div class="brand">FITFLOW</div><h1>${esc(o.title)}</h1><div class="sub">${esc(o.subtitle)}</div>
  <div class="meta">${o.rows.map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`).join("")}<div><b>کاربر:</b> ${esc(o.name)}</div></div></section>`;
}

const sortWeek = <T extends { dayOfWeek: number }>(xs: T[]) => [...xs].sort((a, b) => PERSIAN_WEEK_ORDER.indexOf(a.dayOfWeek) - PERSIAN_WEEK_ORDER.indexOf(b.dayOfWeek));
const unitFa = (u: string) => (u === "seconds" ? "ثانیه" : u === "minutes" ? "دقیقه" : "تکرار");

export async function workoutSection(plan: WorkoutPlan, opts: { appUrl: string; weeks: number; goal: string }) {
  const sessions = sortWeek(plan.sessions);
  let html = `<h2>خلاصه برنامه</h2><div class="box"><b>هدف:</b> ${esc(plan.objective)}<br><b>تقسیم‌بندی:</b> ${esc(plan.split)} — <b>سطح سختی:</b> ${fa(plan.difficulty)} از ۵<br><b>شدت:</b> ${esc(plan.intensityGuidance)}<p>${esc(plan.coachMessage)}</p></div>`;
  html += `<h2>برنامه هفتگی</h2><table><thead><tr><th>روز</th><th>جلسه</th><th>تمرکز</th><th>مدت تقریبی</th><th>تعداد حرکات</th></tr></thead><tbody>${sessions.map((s) => `<tr><td>${WEEKDAY_FA[s.dayOfWeek]}</td><td>${esc(s.title)}</td><td>${esc(s.focus.join("، "))}</td><td>${fa(s.estimatedMinutes)} دقیقه</td><td>${fa(s.exercises.length)}</td></tr>`).join("")}</tbody></table>`;
  for (const s of sessions) {
    html += `<div class="page-break"></div><h2>${esc(WEEKDAY_FA[s.dayOfWeek])} — ${esc(s.title)}</h2>`;
    html += `<div class="box"><b>گرم کردن:</b><ul>${s.warmup.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`;
    html += `<table><thead><tr><th>#</th><th>حرکت</th><th>ست</th><th>تکرار/زمان</th><th>استراحت</th><th>RIR</th><th>راهنمای وزنه</th></tr></thead><tbody>${s.exercises.map((e, i) => {
      const ex = getCatalogExercise(e.exerciseId);
      return `<tr><td>${fa(i + 1)}</td><td>${esc(ex?.nameFa ?? e.exerciseId)}<div class="en">${esc(ex?.nameEn ?? "")}</div></td><td>${fa(e.sets)}</td><td>${fa(e.repMin)}–${fa(e.repMax)} ${unitFa(e.unit)}</td><td>${fa(e.restSec)} ث</td><td>${e.targetRir === null ? "—" : fa(e.targetRir)}</td><td>${esc(e.loadGuidance)}${e.notes ? `<div class="muted">${esc(e.notes)}</div>` : ""}</td></tr>`;
    }).join("")}</tbody></table>`;
    html += `<div class="box"><b>سرد کردن:</b><ul>${s.cooldown.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`;
  }
  html += `<div class="page-break"></div><h2>قوانین پیشرفت و ریکاوری</h2><h3>قوانین پیشرفت</h3><ul>${plan.progressionRules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><h3>ریکاوری</h3><ul>${plan.recoveryGuidance.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${plan.safetyNotes.length ? `<h3>نکات ایمنی</h3><ul>${plan.safetyNotes.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}`;
  // exercise guide
  const ids = [...new Set(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
  html += `<div class="page-break"></div><h2>راهنمای حرکات</h2><p class="muted">تصاویر از مجموعه داده عمومی free-exercise-db (مالکیت عمومی/Unlicense). کد QR صفحه راهنمای حرکت در FitFlow را باز می‌کند که شامل منبع و جستجوی ویدیوی آموزشی است.</p>`;
  for (const id of ids) {
    const ex = getCatalogExercise(id);
    if (!ex) continue;
    const img = imageDataUri(ex.media[0]?.localPath);
    const pageUrl = `${opts.appUrl.replace(/\/$/, "")}/exercises/${encodeURIComponent(ex.id)}`;
    const videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.nameEn + " exercise form tutorial")}`;
    const qr = await QRCode.toDataURL(pageUrl, { margin: 0, width: 220 });
    html += `<div class="ex">${img ? `<img src="${img}" alt="">` : "<div></div>"}<div><h3 style="margin-top:0">${esc(ex.nameFa)} <span class="en">${esc(ex.nameEn)}</span></h3>
      <div>${ex.primaryMuscles.map((m) => `<span class="pill">${esc(MUSCLE_FA[m] ?? m)}</span>`).join("")}</div>
      <b>نکات اجرا:</b><ul>${ex.cuesFa.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <b>اشتباهات رایج:</b> ${esc(ex.mistakesFa.join("؛ "))}${ex.safetyFa ? `<br><b>ایمنی:</b> ${esc(ex.safetyFa)}` : ""}
      <div class="muted">منبع: <a href="${esc(ex.referenceUrl)}">${esc(ex.referenceUrl)}</a><br>ویدیو: <a href="${esc(videoUrl)}">جستجوی ویدیوی آموزشی</a></div></div>
      <div class="qr"><img src="${qr}" alt="QR"><div>راهنمای حرکت</div></div></div>`;
  }
  // tracking pages
  html += `<div class="page-break"></div><h2>صفحات ثبت تمرین</h2>`;
  for (const s of sessions) {
    html += `<h3>${esc(WEEKDAY_FA[s.dayOfWeek])} — ${esc(s.title)}</h3><table class="track"><thead><tr><th>حرکت</th>${Array.from({ length: opts.weeks }, (_, i) => `<th>هفته ${fa(i + 1)}<div class="muted">وزنه × تکرار</div></th>`).join("")}</tr></thead><tbody>${s.exercises.map((e) => `<tr><td>${esc(getCatalogExercise(e.exerciseId)?.nameFa ?? e.exerciseId)}</td>${"<td></td>".repeat(opts.weeks)}</tr>`).join("")}</tbody></table>`;
  }
  return html;
}

export function nutritionSection(plan: NutritionPlan) {
  const t = plan.targets;
  let html = `<h2>اهداف تغذیه‌ای روزانه</h2><div class="kpis"><div class="kpi">کالری<b>${fa(t.kcal)}</b></div><div class="kpi">پروتئین<b>${fa(t.proteinG)} گرم</b></div><div class="kpi">کربوهیدرات<b>${fa(t.carbsG)} گرم</b></div><div class="kpi">چربی<b>${fa(t.fatG)} گرم</b></div></div>
  <div class="box"><b>متابولیسم پایه تخمینی:</b> ${fa(t.bmr)} کیلوکالری — <b>نیاز نگهداری تخمینی:</b> ${fa(t.tdee)} کیلوکالری — <b>آب پیشنهادی:</b> حدود ${fa(t.waterMl / 1000, 1)} لیتر<ul>${t.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul><div class="muted">مقادیر تغذیه‌ای بر اساس پایگاه داده مواد غذایی محاسبه شده و تخمینی هستند، نه اندازه‌گیری آزمایشگاهی.</div></div>
  <p>${esc(plan.coachMessage)}</p>`;
  for (const d of sortWeek(plan.days)) {
    html += `<div class="page-break"></div><h2>${esc(WEEKDAY_FA[d.dayOfWeek])} <span class="muted">— ${fa(d.totals.kcal)} کیلوکالری، پروتئین ${fa(d.totals.proteinG)} گرم</span></h2>`;
    for (const m of d.meals) {
      html += `<h3>${esc(MEAL_SLOT_FA[m.slot as keyof typeof MEAL_SLOT_FA] ?? m.slot)} — ${esc(m.title)} <span class="muted">(${fa(Number(m.time.split(":")[0]))}:${m.time.split(":")[1]})</span></h3>
      <table><thead><tr><th>ماده غذایی</th><th>مقدار</th><th>کالری</th><th>پروتئین</th><th>کربوهیدرات</th><th>چربی</th></tr></thead><tbody>${m.items.map((i) => `<tr><td>${esc(i.nameFa)}</td><td>${fa(i.grams)} گرم<div class="muted">${esc(i.serving)}</div></td><td>${fa(i.kcal)}</td><td>${fa(i.proteinG, 1)}</td><td>${fa(i.carbsG, 1)}</td><td>${fa(i.fatG, 1)}</td></tr>`).join("")}
      <tr><th>جمع</th><th></th><th>${fa(m.totals.kcal)}</th><th>${fa(m.totals.proteinG, 1)}</th><th>${fa(m.totals.carbsG, 1)}</th><th>${fa(m.totals.fatG, 1)}</th></tr></tbody></table>
      ${m.instructions ? `<div class="muted">آماده‌سازی (${fa(m.prepMinutes)} دقیقه): ${esc(m.instructions)}</div>` : ""}`;
    }
  }
  if (plan.alternatives.length) {
    html += `<div class="page-break"></div><h2>وعده‌های جایگزین</h2><table><thead><tr><th>وعده</th><th>عنوان</th><th>اقلام</th><th>کالری</th><th>پروتئین</th></tr></thead><tbody>${plan.alternatives.map((a) => `<tr><td>${esc(MEAL_SLOT_FA[a.slot as keyof typeof MEAL_SLOT_FA] ?? a.slot)}</td><td>${esc(a.title)}</td><td>${esc(a.items.map((i) => `${i.nameFa} ${fa(i.grams)}g`).join("، "))}</td><td>${fa(a.totals.kcal)}</td><td>${fa(a.totals.proteinG)}</td></tr>`).join("")}</tbody></table>`;
  }
  html += `<h2>فهرست خرید هفتگی</h2><table><thead><tr><th>ماده غذایی</th><th>مقدار تقریبی</th><th>✓</th></tr></thead><tbody>${plan.groceryList.map((g) => `<tr><td>${esc(g.nameFa)}</td><td>${esc(g.label.replace(/\d+(\.\d+)?/g, (x) => fa(Number(x), 1)))}</td><td></td></tr>`).join("")}</tbody></table>
  <div class="box"><b>آب و مایعات:</b> ${esc(plan.hydrationGuidance)}</div>`;
  html += `<div class="page-break"></div><h2>صفحه ثبت تغذیه</h2><table class="track"><thead><tr><th>روز</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th>میان‌وعده</th><th>وزن صبح</th></tr></thead><tbody>${PERSIAN_WEEK_ORDER.map((d) => `<tr><td>${WEEKDAY_FA[d]}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join("")}</tbody></table>`;
  return html;
}

export function lineChartSvg(points: { x: string; y: number }[], opts: { width?: number; height?: number; unit?: string } = {}) {
  const w = opts.width ?? 640, h = opts.height ?? 180, pad = 30;
  if (points.length < 2) return `<div class="muted">داده کافی برای نمودار وجود ندارد.</div>`;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const X = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const Y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="direction:ltr"><rect x="0" y="0" width="${w}" height="${h}" fill="#fafcfb" rx="8"/>
  <path d="${d}" fill="none" stroke="#15803d" stroke-width="2.5"/>${points.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.y)}" r="3" fill="#15803d"/>`).join("")}
  <text x="6" y="${Y(max) + 4}" font-size="10" fill="#64748b">${max}${opts.unit ?? ""}</text><text x="6" y="${Y(min) + 4}" font-size="10" fill="#64748b">${min}${opts.unit ?? ""}</text></svg>`;
}
