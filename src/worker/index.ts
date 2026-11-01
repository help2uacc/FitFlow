/**
 * FitFlow background worker — runs as its own process/systemd unit, separate
 * from the Next.js web server. Processes the persistent job queue, recovers
 * jobs abandoned by a crash, and runs light periodic maintenance.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { getDb } from "@/db/client";
import * as t from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { enqueueJob, recoverStaleJobs } from "@/domain/ai/jobs";
import { createEngine, createProvider } from "@/domain/ai/provider-factory";
import { purgeExpiredSessions } from "@/domain/auth/service";
import { runPeriodicTasks } from "@/domain/notifications/scheduler";
import { JobRunner } from "./runner";

const db = getDb();
const e = env();
const provider = createProvider(db);
const runner = new JobRunner(db, createEngine(db), provider, { ai: e.AI_MAX_CONCURRENT_JOBS, pdf: 1, system: 1 });
let stopping = false;

mkdirSync(e.CODEX_WORKDIR, { recursive: true, mode: 0o700 });

function writeStatus() {
  const value = { at: Date.now(), pid: process.pid, provider: provider.name, running: { ai: runner.running.ai.size, pdf: runner.running.pdf.size } };
  db.insert(t.systemStatus).values({ key: "worker_heartbeat", value }).onConflictDoUpdate({ target: t.systemStatus.key, set: { value, updatedAt: Date.now() } }).run();
}

function cleanupCodexDirs() {
  try {
    for (const d of readdirSync(e.CODEX_WORKDIR)) {
      const p = path.join(e.CODEX_WORKDIR, d);
      if (d.startsWith("job-") && Date.now() - statSync(p).mtimeMs > 2 * 3600_000) rmSync(p, { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }
}

const recovered = recoverStaleJobs(db, 0);
if (recovered) logger.warn("recovered jobs left running by a previous worker", { count: recovered });
cleanupCodexDirs();
writeStatus();
logger.info("worker started", { provider: provider.name, aiConcurrency: e.AI_MAX_CONCURRENT_JOBS });

// Startup diagnostic (version + login status only; the paid smoke test is on demand).
const owner = db.select().from(t.users).limit(1).get();
if (owner) enqueueJob(db, { userId: owner.id, type: "ai_diagnostic", payload: { smoke: false }, dedupeKey: "ai_diagnostic" });

const loop = setInterval(() => { if (!stopping) runner.tick(); }, 1000);
const statusTimer = setInterval(writeStatus, 15000);
const maintenance = setInterval(() => {
  try {
    recoverStaleJobs(db, 120_000);
    purgeExpiredSessions(db);
    runPeriodicTasks(db);
    cleanupCodexDirs();
  } catch (err) {
    logger.error("maintenance failed", { err: err as Error });
  }
}, 60_000);
runner.tick();

async function shutdown(sig: string) {
  if (stopping) return;
  stopping = true;
  logger.info("worker stopping", { sig });
  clearInterval(loop);
  clearInterval(statusTimer);
  clearInterval(maintenance);
  const deadline = Date.now() + 20000;
  while (runner.busy && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
