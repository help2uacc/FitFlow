# Implementation report

## Summary
FitFlow is implemented as a working Next.js 16 + SQLite PWA with a separate background worker that runs Codex CLI jobs, PDF generation and reminders. It covers all eight PRD milestones.
All verification in this report was run in the development container. **Codex CLI was not authenticated there, and outbound access to OpenAI was blocked**, so no live AI generation ran. The Codex integration is tested against the real CLI's flags (verified with `codex exec --help`, v0.166.0) using a fake `codex` executable. The rest of the pipeline is tested with the deterministic mock provider.

## Verification results
| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ no errors |
| `pnpm lint` | ✅ 0 errors, 0 warnings |
| `pnpm build` (web + bundled worker/scripts) | ✅ |
| Migrations (`node dist/migrate.mjs`) on a fresh DB | ✅ 45 tables, catalogs seeded |
| `pnpm test` (Vitest) | ✅ 64 tests: unit (calculations, scaling, validation, adjustments, intent parsing, lifecycle, rate limits) and integration (full pipeline, AI failure handling, Codex provider vs. fake binary, auth/authorization, real PDF rendering) |
| `pnpm test:e2e` (Playwright, production build + worker + mock AI) | ✅ 12 tests covering PRD §36 items 1–16, plus unauthorized access, duplicate generation requests, invalid AI JSON, expired Codex auth and cross-origin write rejection |
| Backup → verify → restore (`dist/backup.mjs`, `scripts/restore.ts`) | ✅ integrity check, checksum and data restored |
| Restart without data loss | ✅ E2E logs out and back in against the persisted SQLite DB; the worker recovers jobs that were "running" on restart (unit-tested via `recoverStaleJobs`) |

## Bugs found and fixed during verification
- An onboarding slider with no recommended value showed a number but submitted nothing.
- With only 2 meals per day, sparse menus could not be scaled to high calorie targets. The fitter now runs a bounded second pass with per-food portion caps.
- Login rate limiting counted successful logins. It now counts failures per account/IP, plus a generous overall cap.
- Workout history pagination could skip workouts on the same date. It now uses a `(date, createdAt)` cursor.

## Known limitations / follow-ups
- **Live Codex:** run `sudo -u fitflow -H codex login`, then `pnpm ai:check --smoke` on the server (docs/DEPLOYMENT.md §3). Prompt quality with the real model should be reviewed on the first generations; the validation and repair loop protects publication either way.
- **Exercise videos:** external sites (ExRx, MuscleWiki, YouTube) were unreachable from the build environment. Each exercise therefore has a verified public-domain image and dataset reference, plus a clearly labelled YouTube *search* link instead of an unverified specific video. Verified video/reference rows can be added (docs/DATA_SOURCES.md).
- **Food values:** USDA values were transcribed manually (`confidence: medium`). Iranian dishes are recipe estimates (`low`). Both are labelled as estimates in the UI.
- **Passkeys/biometrics:** not implemented (PRD: "if practical"). Password recovery is the server-side CLI.
- **Offline:** viewing the plan and logging workouts, planned meals and weight work offline. A workout started offline has no server ID until sync, so the full live logger needs one online load; the offline page offers a simplified logger instead.
- **Push notifications:** implemented (VAPID + service worker) but not exercised end-to-end, because that needs a real browser push service.
- **Multi-user:** every table is user-scoped and registration can be reopened, but the UI targets a single owner.

## Where to look
See `README.md` (overview and scripts), `docs/ARCHITECTURE.md` (design), `docs/DEPLOYMENT.md`, `docs/TROUBLESHOOTING.md` and `docs/DATA_SOURCES.md`.
