import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { env } from "@/lib/env";
import { CodexCLIProvider } from "./codex-provider";
import { AiEngine } from "./engine";
import { MockAIProvider } from "./mock-provider";
import type { AIProvider } from "./types";

export function mockAllowed() {
  const e = env();
  return e.NODE_ENV !== "production" || e.FITFLOW_ALLOW_MOCK_AI;
}

export function createProvider(db: DB): AIProvider {
  const e = env();
  if (e.AI_PROVIDER === "mock") {
    if (!mockAllowed()) throw new Error("AI_PROVIDER=mock is not allowed in production (set FITFLOW_ALLOW_MOCK_AI=1 only for automated tests).");
    return new MockAIProvider(() => {
      const row = db.select().from(t.appSettings).where(eq(t.appSettings.key, "mock_ai_mode")).get();
      return typeof row?.value === "string" ? row.value : "ok";
    });
  }
  return new CodexCLIProvider({ bin: e.CODEX_BIN, workdir: e.CODEX_WORKDIR, model: e.CODEX_MODEL, codexHome: e.CODEX_HOME });
}

export function createEngine(db: DB) {
  return new AiEngine(createProvider(db), { timeoutMs: env().AI_JOB_TIMEOUT_MS, maxRepairs: 1 });
}
