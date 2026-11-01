# Architecture

```
Browser (PWA, RTL)  ──HTTPS──▶ Nginx ──▶ Next.js web process (pages + route handlers)
   │ IndexedDB outbox/snapshot                    │ auth · validation · domain services
   │                                              ▼
   └──── /api/sync (idempotent) ─────────▶  SQLite (WAL)  ◀───────────┐
                                                  │ ai_jobs (persistent queue)
                                                  ▼                    │
                                   Worker process (dist/worker.mjs)    │
                                   ├─ ai lane (concurrency 1) ── spawn `codex exec` (read-only sandbox, stdin prompt, --output-schema)
                                   ├─ pdf lane (1) ── Playwright/Chromium
                                   └─ system lane ── Codex diagnostics; periodic reminders, push, cleanup
```

**Core rule:** the AI decides and explains. Deterministic code validates, calculates, persists and enforces constraints. UI, PDFs, grocery lists and charts all render from the same validated, structured plan model, never from AI prose.

## Source layout

| Path | Responsibility |
|---|---|
| `src/db/schema.ts`, `drizzle/` | Schema (45 tables) and SQL migrations |
| `src/domain/auth` | Argon2id, server-side sessions (only a SHA-256 of the token is stored), password change/reset |
| `src/domain/onboarding` | Question bank (types, conditions, `affects` flags) and answer validation, shared by client and server |
| `src/domain/profile` | Profile sections, safety flags, auto-save, significant-change detection |
| `src/domain/exercises`, `catalog` | Verified exercise catalog, similarity and alternatives, seeding |
| `src/domain/nutrition` | Food DB, energy and macro calculations, custom foods and recipes |
| `src/domain/plans` | AI output schemas (Zod → strict JSON Schema), workout validation and repair, nutrition build/fit, immutable versioning, diffs |
| `src/domain/adjust` | Deterministic adjustments (difficulty, duration, emphasis, focus, cardio, calories, macros), meal replacement, Persian intent parser, preview/confirm orchestration, renewal |
| `src/domain/ai` | Provider abstraction (`CodexCLIProvider`, `MockAIProvider`), prompts, context builder, engine with repair loop, job queue, handlers |
| `src/domain/tracking` | Workout and food logging (client-ID idempotency, nutrient snapshots) |
| `src/domain/progress` | Adherence, e1RM, volume, weight trend, nutrition stats (missing logs = missing data), photos |
| `src/domain/pdf` | HTML templates and Chromium rendering with file verification |
| `src/worker` | Job runner and worker entry point |
| `src/app` | Pages (server components) and `/api` route handlers |

## AI pipeline

1. A user action creates an `ai_jobs` row. A `dedupe_key` collapses duplicate requests.
2. The worker claims the job atomically and builds a **minimal** context (no name/email; profile summary, safety flags, constraints, eligible exercise IDs or allowed food IDs, compact history).
3. `CodexCLIProvider.generate` runs `codex exec --sandbox read-only --ephemeral --json --output-schema … --output-last-message … -C <0700 job dir> -` via `spawn(…, {shell:false})`. The prompt goes only through stdin. JSONL events drive progress updates and early detection of auth or usage-limit errors. The process group is killed on timeout or cancel, and the job dir is deleted afterwards.
4. The engine validates the output with Zod plus business rules. On failure the errors are fed back once (bounded repair). If it is still invalid, the job fails with `invalid_output`.
5. Only validated output is persisted, as a new version: active for the first plan, otherwise a **draft** the user reviews and accepts. Each attempt is recorded in `ai_generation_metadata` (prompt hash, sizes and duration, never the prompt text).
6. Errors are classified as `auth`, `usage_limit` (auto-retry in about 20 min), `timeout`/`unavailable` (exponential retry, max attempts), or `invalid_output`. Existing plans are never touched. Stale running jobs are recovered after a crash.

Method names in `AiEngine` follow the PRD: `generateInitialProgram`, `reviseWorkoutPlan`, `reviseNutritionPlan` (plus `generateNutritionPlan`), `generateNextCycle`, `analyzeProgress`, `explainAdjustment` (coach classification) and `checkNutritionConsistency`.

## Versioning model

`program_cycles` (cycle number, dates, status) 1─* `workout_plan_versions` (immutable `plan` JSON, `previous_version_id`, `revision_reason`, profile snapshot, AI job). Sessions, exercises and prescribed sets are materialised for logging references. `nutrition_plan_versions` are versioned the same way, with materialised `planned_meals` and items.
Statuses are `draft → active → superseded/archived/rejected`. A cycle moves `draft → active → completed`; "ending soon" and "ended" are derived from the dates.
`plan_change_history` records each activation with a structured diff. Completed workouts and sets, and food log entries, keep their plan version id and a nutrient snapshot, so revisions never change history.

## Security model

- Every page is authenticated server-side (`requireUser`/`requireOnboardedUser`) and so is every API route (`authed()`). `proxy.ts` is only a cheap cookie gate.
- Cookies are HTTP-only, `SameSite=Lax`, and `Secure` under https. State-changing requests require a same origin (Origin/Sec-Fetch-Site check). Login and registration are rate limited (Nginx rate limit as well).
- All inputs are validated with Zod. Ownership (`user_id`) is checked on every query.
- Private files live under `STORAGE_DIR` (never `public/`) with mode 0600 and are served only through authenticated routes with `Cache-Control: private, no-store`. Uploads are type-, size- and magic-byte-checked.
- The service worker never caches `/api/*` or private HTML. Offline data stays in the device's IndexedDB and is cleared on logout.
- CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy are set.
- Natural-language input maps only to a whitelisted intent schema and never to SQL, shell or file operations. Plan-wide changes need preview and confirmation.
- Logs are structured JSON with secret-like keys redacted. Codex credentials stay in the worker user's `CODEX_HOME`; app secrets are stripped from the Codex child environment.
- Users can export all their data (JSON) and delete their account (files plus cascade delete).
