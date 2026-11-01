/**
 * End-to-end user journey against a production build + worker (mock AI provider).
 * Covers the PRD §36 E2E list in order; tests share one account (serial).
 */
import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

const EMAIL = "owner@fitflow.test";
const PASSWORD = "Sup3rSecretPass";
const dbPath = () => path.join(process.env.E2E_DIR ?? path.join(process.cwd(), ".e2e"), "fitflow.db");

function setMockMode(mode: string) {
  const db = new Database(dbPath());
  db.prepare("insert into app_settings(key, value, updated_at) values ('mock_ai_mode', ?, ?) on conflict(key) do update set value=excluded.value").run(JSON.stringify(mode), Date.now());
  db.close();
}

/** Answers for numeric/text questions; choice questions use recommended or first option. */
const ANSWERS: Record<string, string> = {
  birth_year: "1993", weight: "82", waist: "88", target_weight: "78", lift_bench: "60", lift_squat: "80", lift_deadlift: "100",
};
const CHOICE: Record<string, string> = { sex: "مرد", primary_goal: "هم‌زمان: چربی کمتر، عضله بیشتر", nutrition_mode: "فقط برنامه تمرینی", location: "باشگاه کامل", days_per_week: "۳ روز", experience: "۶ ماه تا ۲ سال", level: "متوسط" };

async function answerCurrent(page: Page, root = page.locator("[data-qid]")) {
  const qid = await root.getAttribute("data-qid");
  const scope = page.locator("main");
  if (qid && CHOICE[qid]) {
    await scope.getByRole("radio", { name: CHOICE[qid] }).first().click();
  } else if (qid && ANSWERS[qid]) {
    await scope.locator("input").first().fill(ANSWERS[qid]);
  } else {
    const radios = scope.getByRole("radio");
    const chips = scope.locator("button[aria-pressed]");
    if (await radios.count()) await radios.first().click();
    else if ((await chips.count()) && !(await scope.getByRole("button", { name: "رد کردن" }).count())) await chips.first().click();
    else if (await scope.locator('input[type="time"]').count()) await scope.locator('input[type="time"]').fill("08:00");
  }
  return qid;
}

test.describe.serial("FitFlow journey", () => {
  test.beforeEach(async ({ page }, info) => {
    if (/unauthorized|1-3|16:/.test(info.title)) return;
    const r = await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD, remember: true }, headers: { origin: "http://localhost:" + (process.env.E2E_PORT ?? 3200) } });
    expect(r.ok()).toBeTruthy();
  });
  test("unauthorized access is blocked", async ({ page, request }) => {
    const r = await request.get("/api/programs/active");
    expect(r.status()).toBe(401);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("1-3: register, onboarding (workout only)", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("نام نمایشی").fill("سارا");
    await page.getByLabel("ایمیل").fill(EMAIL);
    await page.getByLabel("رمز عبور", { exact: true }).fill(PASSWORD);
    await page.getByLabel("تکرار رمز عبور").fill(PASSWORD);
    await page.getByRole("button", { name: "ثبت‌نام" }).click();
    await expect(page).toHaveURL(/\/onboarding/);

    for (let i = 0; i < 120; i++) {
      if (await page.getByRole("button", { name: "تأیید و ادامه" }).isVisible().catch(() => false)) break;
      const qid = await answerCurrent(page);
      const skip = page.getByRole("button", { name: "رد کردن" });
      const cont = page.getByRole("button", { name: "ادامه", exact: true });
      if (qid && !ANSWERS[qid] && !CHOICE[qid] && (await skip.isVisible())) await skip.click();
      else await cont.click();
      await page.waitForTimeout(150);
      if (i === 5) {
        // resume after reload: should continue where we left off, not restart
        await page.reload();
        await expect(page.locator("[data-qid]")).not.toHaveAttribute("data-qid", "birth_year");
      }
    }
    await page.getByRole("button", { name: "تأیید و ادامه" }).click();
    await expect(page.getByText("پروفایل شما کامل شد")).toBeVisible();
  });

  test("4: generate & view the workout plan (duplicate requests collapse)", async ({ page }) => {
    await page.goto("/dashboard");
    const dup = await page.request.post("/api/programs/initial", { headers: { origin: new URL(page.url()).origin } });
    expect(dup.ok()).toBeTruthy();
    const dup2 = await page.request.post("/api/programs/initial", { headers: { origin: new URL(page.url()).origin } });
    expect((await dup2.json()).duplicate).toBe(true);
    await page.reload();
    await expect(page.getByText("تمرین امروز")).toBeVisible({ timeout: 60_000 });
    await page.goto("/program/workout");
    await expect(page.locator("main")).toContainText("دوره");
    await expect(page.locator("main")).toContainText("RIR");
  });

  test("5: record a workout", async ({ page }) => {
    await page.goto("/workouts/today");
    const start = page.getByRole("button", { name: "شروع تمرین" });
    if (await start.isVisible()) await start.click();
    else await page.getByRole("button", { name: "ثبت تمرین خارج از برنامه" }).click();
    await expect(page).toHaveURL(/\/workouts\/session\//);
    const setBtn = page.getByRole("button", { name: "ثبت ست ۱" }).first();
    if (await setBtn.isVisible()) {
      await page.getByLabel("وزنه ست ۱").first().fill("40");
      await page.getByLabel("تکرار ست ۱").first().fill("10");
      await setBtn.click();
      await expect(setBtn).toHaveAttribute("aria-pressed", "true");
    }
    await page.getByRole("button", { name: "پایان تمرین" }).click();
    await expect(page.getByText("سختی این جلسه چطور بود؟")).toBeVisible();
    await page.getByRole("button", { name: "۳", exact: true }).first().click();
    await page.getByRole("button", { name: "ثبت بازخورد" }).click();
    await page.goto("/workouts/history");
    await expect(page.locator("main")).toContainText("انجام شد");
  });

  test("6-8: enable nutrition later, generate plan, log food", async ({ page }) => {
    await page.goto("/nutrition/setup");
    await page.getByRole("button", { name: "انتخاب" }).first().click();
    for (let i = 0; i < 40; i++) {
      const q = page.locator("[data-qid]");
      if (!(await q.count())) break;
      await answerCurrent(page, q);
      const next = page.getByRole("button", { name: /^(ادامه|پایان و ساخت برنامه)$/ });
      if (await next.isDisabled()) await page.locator("main button[aria-pressed]").first().click();
      await next.click();
      await page.waitForTimeout(150);
    }
    await expect(page).toHaveURL(/\/program\/nutrition/, { timeout: 60_000 });
    await expect(page.locator("main")).toContainText("کالری");
    await page.goto("/nutrition/log");
    await page.getByRole("button", { name: "خوردم" }).first().click();
    await expect(page.locator("main")).not.toContainText("مصرفی ۰");
  });

  test("9-10: increase and decrease daily calories", async ({ page }) => {
    const before = await (await page.request.get("/api/programs/active")).json();
    const kcal0 = before.nutrition.targetKcal as number;
    await page.goto("/program/adjust?tab=nutrition");
    await page.getByRole("button", { name: "+۲۰۰" }).click();
    await expect(page.getByRole("heading", { name: "پیش‌نمایش", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "اعمال تغییرات" }).click();
    await expect(page).toHaveURL(/\/program\/nutrition/);
    const mid = await (await page.request.get("/api/programs/active")).json();
    expect(mid.nutrition.targetKcal).toBe(kcal0 + 200);
    await page.goto("/program/adjust?tab=nutrition");
    await page.getByRole("button", { name: "−۲۰۰" }).click();
    await page.getByRole("button", { name: "اعمال تغییرات" }).click();
    await expect(page).toHaveURL(/\/program\/nutrition/);
    const after = await (await page.request.get("/api/programs/active")).json();
    expect(after.nutrition.targetKcal).toBe(kcal0);
  });

  test("11: increase workout difficulty", async ({ page }) => {
    const before = (await (await page.request.get("/api/programs/active")).json()).workout;
    await page.goto("/program/adjust");
    await page.getByRole("radio", { name: "کمی سخت‌تر" }).click();
    await page.getByRole("button", { name: "پیش‌نمایش تغییرات" }).click();
    await expect(page.getByText("تغییرات (قبل ← بعد)")).toBeVisible();
    await page.getByRole("button", { name: "اعمال تغییرات" }).click();
    await expect(page).toHaveURL(/\/program\/workout/);
    const after = (await (await page.request.get("/api/programs/active")).json()).workout;
    expect(after.version).toBe(before.version + 1);
  });

  test("12: exercise substitution in plan", async ({ page }) => {
    const before = (await (await page.request.get("/api/programs/active")).json()).workout;
    await page.goto("/program/workout");
    await page.getByRole("button", { name: "جایگزینی حرکت" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button").nth(1).click(); // first alternative (index 0 is "close")
    await dialog.getByRole("button", { name: "جایگزینی در کل برنامه" }).click();
    await dialog.getByRole("button", { name: "تأیید و اعمال" }).click();
    await expect.poll(async () => (await (await page.request.get("/api/programs/active")).json()).workout.version).toBe(before.version + 1);
  });

  test("13-14: complete the cycle and generate the next one from history", async ({ page }) => {
    await page.goto("/program/renew");
    await page.getByRole("radio", { name: "هوش مصنوعی بر اساس پیشرفتم تصمیم بگیرد" }).click();
    await page.getByRole("button", { name: "ساخت برنامه دوره بعد" }).click();
    await expect(page).toHaveURL(/\/program\/review\//, { timeout: 60_000 });
    await page.getByRole("button", { name: "تأیید و فعال‌سازی" }).click();
    await expect(page).toHaveURL(/\/program\/workout/);
    await page.goto("/program/history");
    await expect(page.locator("main")).toContainText("دوره ۲");
    await expect(page.locator("main")).toContainText("تکمیل‌شده");
  });

  test("15: generate and download PDFs", async ({ page }) => {
    await page.goto("/reports");
    await page.getByRole("button", { name: "ساخت PDF" }).first().click();
    const link = page.getByRole("link", { name: "دانلود" }).first();
    await expect(link).toBeVisible({ timeout: 90_000 });
    const href = await link.getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("error paths: invalid AI output and expired auth keep the current plan", async ({ page }) => {
    const origin = "http://localhost:" + (process.env.E2E_PORT ?? 3200);
    const before = (await (await page.request.get("/api/programs/active")).json()).workout.id;
    for (const mode of ["invalid_json", "auth_error"]) {
      setMockMode(mode);
      const r = await page.request.post("/api/adjust/workout", { data: { daysPerWeek: 5, source: "controls" }, headers: { origin } });
      const { jobId } = await r.json();
      await expect.poll(async () => (await (await page.request.get(`/api/jobs/${jobId}`)).json()).status, { timeout: 30_000 }).toBe("failed");
      const after = (await (await page.request.get("/api/programs/active")).json()).workout.id;
      expect(after).toBe(before);
    }
    setMockMode("ok");
    // cross-origin writes are rejected
    const bad = await page.request.post("/api/adjust/workout", { data: { difficultyDelta: 1 }, headers: { origin: "https://evil.example" } });
    expect(bad.status()).toBe(403);
  });

  test("16: logout and login without losing progress", async ({ page }) => {
    await page.request.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD }, headers: { origin: "http://localhost:" + (process.env.E2E_PORT ?? 3200) } });
    await page.goto("/settings");
    await page.getByRole("button", { name: /خروج از حساب|خروج/ }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("ایمیل").fill(EMAIL);
    await page.getByLabel("رمز عبور").fill(PASSWORD);
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("برنامه فعلی")).toBeVisible();
    await page.goto("/workouts/history");
    await expect(page.locator("main")).toContainText("انجام شد");
  });
});
