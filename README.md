# FitFlow — AI Fitness & Nutrition PWA

FitFlow is a private, self-hosted, Persian (RTL) progressive web app that acts as a persistent AI personal trainer and nutrition planner.
You register once and complete one onboarding interview. FitFlow then generates personalised training plans, plus optional nutrition plans, using the **Codex CLI already installed and authenticated on your Linux server**. It keeps your history and adapts every future plan to your logged progress.

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · SQLite (WAL) + Drizzle ORM · Zod · Argon2id · Recharts · Playwright/Chromium (PDF) · Vitest + Playwright tests.
- **Processes:** the web server (`next start`) and a separate **worker** (`dist/worker.mjs`). The worker runs the AI jobs (Codex, one at a time by default), PDF generation and reminders from a persistent SQLite job queue.
- **No Docker, Redis or Postgres needed.** The target is a 2 vCPU / 4 GB VPS behind Nginx + systemd.

## Contents

| Doc | What's inside |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, data model, AI pipeline, security model |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Step-by-step VPS install (Node, pnpm, Codex login, systemd, Nginx, HTTPS, backups, updates) |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Operational troubleshooting guide |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Exercise media & nutrient data sources and licences |
| [docs/IMPLEMENTATION_REPORT.md](docs/IMPLEMENTATION_REPORT.md) | What was built, test results, known limitations |

## Quick start (development)

```bash
pnpm install
```

```bash
cp .env.example .env   # then edit: APP_URL=http://localhost:3000, DATABASE_PATH=./data/fitflow.db, STORAGE_DIR=./storage, CODEX_WORKDIR=./storage/codex-work, NODE_ENV=development
```

```bash
pnpm db:migrate
```

In two terminals:

```bash
pnpm dev
```

```bash
pnpm dev:worker
```

Open http://localhost:3000, register the owner account and complete onboarding.

To develop without Codex, set `AI_PROVIDER=mock`. The mock provider is a deterministic rule-based stand-in for tests. It is **refused when `NODE_ENV=production`** unless `FITFLOW_ALLOW_MOCK_AI=1` is set, which exists only for automated E2E runs.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm build` | Production build of the web app plus the bundled worker and CLI scripts in `dist/` |
| `pnpm start` / `pnpm start:worker` | Run the web server / worker |
| `pnpm db:migrate` | Apply migrations and seed the reference catalogs (idempotent) |
| `pnpm db:generate` | Generate a new migration after changing `src/db/schema.ts` |
| `pnpm test` | Unit and integration tests (Vitest, mock AI, in-memory SQLite) |
| `pnpm test:e2e` | End-to-end tests (Playwright). These start a throwaway production instance on port 3200; run `pnpm build` first |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint |
| `pnpm ai:check [--smoke]` | Diagnose Codex CLI (binary, version, login, optional live request) as the current OS user |
| `pnpm backup` / `pnpm restore <dir>` | Consistent SQLite backup with integrity check and retention / verified restore |
| `pnpm user:reset-password <email>` | Offline password recovery on the server |
| `pnpm vapid:generate` | Keys for optional Web Push notifications |

## Feature overview

- **Account:** owner registration (public registration closes afterwards), Argon2id passwords, server-side sessions in HTTP-only SameSite cookies, remember-me, session management, password change, rate limiting and same-origin checks.
- **Onboarding:** about 80 conditional questions, one per screen, with interactive controls. Each answer auto-saves and the interview resumes where you left off. Every answer stays editable from the profile. Significant changes trigger **"Update my plan based on these changes"**.
- **AI plans:** Codex returns strict JSON (`--output-schema`). FitFlow validates it with Zod and business rules: exercise IDs must exist in the catalog, equipment and joint-pain safety are enforced, durations must be plausible, and food IDs and allergies are checked. Invalid output gets one bounded repair attempt; otherwise it is never published.
- **Versioning:** every plan version is immutable. Revisions, substitutions and renewals create new versions. History, comparison and re-applying an older version are supported. Logs keep the version they were recorded against.
- **Workouts:** today's session, live logger (weight, reps, RIR, skip, replace today-only or in-plan), automatic rest timer, pause/finish, feedback, missed/unscheduled sessions, history.
- **Nutrition (optional):** deterministic energy and macro targets (Mifflin-St Jeor / Katch-McArdle), AI-selected 7-day menu, nutrient totals computed from the food database, one-tap meal logging, partial/skip/replace (today or plan), custom foods and recipes, grocery list.
- **Adjustments:** calories ±100/200/300, custom target, AI recommendation, protein, meals per day. Workout difficulty is treated as multidimensional (sets, RIR, reps, exercise count, duration), alongside frequency, duration, emphasis, muscle priority and cardio. Every change shows a preview and safety warnings and needs confirmation.
- **Ask My AI Coach:** Persian free text is classified into a whitelisted intent schema by a local parser, with AI as fallback. It always ends in a previewable action and never runs commands.
- **Progress:** adherence, weekly volume, e1RM per exercise, PRs, weight trend, measurements, private progress photos, nutrition adherence on logged days only, weekly check-in, AI progress analysis.
- **Renewal:** cycle lifecycle (active, ending soon, ended, completed), next cycle from history (maintain, harder, easier, prioritise, frequency, calories, AI decides), extension, early-renewal warning.
- **PDFs:** workout, nutrition, combined and progress reports. Chromium renders them with embedded Vazirmatn, RTL and A4 layout, clickable links, QR codes, page numbers and tracking pages.
- **PWA:** manifest, icons, service worker (never caches private API data), offline view of the last plan, IndexedDB outbox for offline workout, meal and weight logging with idempotent sync, and optional Web Push reminders.
- **Ops:** health endpoint, structured JSON logs, systemd units, Nginx config, nightly backup timer, data export and account deletion.
