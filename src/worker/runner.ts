/**
 * Job runner shared by the worker process and integration tests.
 * Lanes: "ai" (Codex, default concurrency 1), "pdf" (1), "system" (1).
 */
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { logger } from "@/lib/logger";
import { claimNext, completeJob, failJob, heartbeat, type Job, type Lane } from "@/domain/ai/jobs";
import { runJob } from "@/domain/ai/handlers";
import type { AiEngine } from "@/domain/ai/engine";
import { AiError, AI_ERROR_FA, type AIProvider } from "@/domain/ai/types";

export class JobRunner {
  readonly running: Record<Lane, Set<string>> = { ai: new Set(), pdf: new Set(), system: new Set() };
  private inflight = new Set<Promise<void>>();

  constructor(private db: DB, private engine: AiEngine, private provider: AIProvider, private capacity: Record<Lane, number>, private heartbeatMs = 3000) {}

  async execute(job: Job, lane: Lane) {
    const db = this.db;
    this.running[lane].add(job.id);
    const ac = new AbortController();
    const hb = setInterval(() => {
      try {
        if (heartbeat(db, job.id)) ac.abort();
      } catch (err) {
        logger.error("heartbeat failed", { err: err as Error });
      }
    }, this.heartbeatMs);
    const started = Date.now();
    logger.info("job started", { jobId: job.id, type: job.type, attempt: job.attempts });
    try {
      const result = await runJob(db, job, this.engine, this.provider, {
        signal: ac.signal,
        progress: (msg, phase) => { if (heartbeat(db, job.id, msg, phase)) ac.abort(); },
      });
      if (ac.signal.aborted) throw new AiError("cancelled", "cancelled");
      completeJob(db, job.id, result ?? {});
      logger.info("job completed", { jobId: job.id, type: job.type, ms: Date.now() - started });
    } catch (err) {
      const ai = err instanceof AiError ? err : null;
      const code = ac.signal.aborted ? "cancelled" : ai?.code ?? "process";
      const outcome = failJob(db, job, {
        code, retryable: ai ? ai.retryable : false,
        message: ai ? AI_ERROR_FA[ai.code] : "خطای داخلی هنگام پردازش. برنامه فعلی شما بدون تغییر باقی ماند.",
        retryDelayMs: code === "usage_limit" ? 20 * 60_000 : undefined,
      });
      logger.warn("job failed", { jobId: job.id, type: job.type, code, outcome, err: err as Error });
      if (outcome !== "requeued") {
        const input = (job.input ?? {}) as { requestId?: string; reportId?: string };
        if (input.requestId) db.update(t.planAdjustmentRequests).set({ status: outcome === "cancelled" ? "cancelled" : "failed", updatedAt: Date.now() }).where(eq(t.planAdjustmentRequests.id, input.requestId)).run();
        if (job.type === "pdf_export" && input.reportId) {
          db.update(t.exportedReports).set({ status: "failed", error: code }).where(eq(t.exportedReports.id, input.reportId)).run();
        }
      }
    } finally {
      clearInterval(hb);
      this.running[lane].delete(job.id);
    }
  }

  /** Claim as many jobs as capacity allows. Returns the promises started. */
  tick(): Promise<void>[] {
    const started: Promise<void>[] = [];
    for (const lane of ["system", "ai", "pdf"] as Lane[]) {
      while (this.running[lane].size < this.capacity[lane]) {
        const job = claimNext(this.db, lane);
        if (!job) break;
        const p = this.execute(job, lane).finally(() => this.inflight.delete(p));
        this.inflight.add(p);
        started.push(p);
      }
    }
    return started;
  }

  /** Test helper: process until the queue has no runnable jobs. */
  async drain(maxRounds = 50) {
    for (let i = 0; i < maxRounds; i++) {
      const started = this.tick();
      if (!started.length && !this.inflight.size) return;
      await Promise.all([...this.inflight]);
    }
  }

  get busy() {
    return this.running.ai.size + this.running.pdf.size + this.running.system.size;
  }
}
