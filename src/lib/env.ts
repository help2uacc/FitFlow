import path from "node:path";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_PATH: z.string().default("./data/fitflow.db"),
  STORAGE_DIR: z.string().default("./storage"),
  SESSION_SECRET: z.string().min(16).optional(),
  ALLOW_REGISTRATION: bool,
  AI_PROVIDER: z.enum(["codex", "mock"]).default("codex"),
  FITFLOW_ALLOW_MOCK_AI: bool,
  CODEX_BIN: z.string().default("codex"),
  CODEX_WORKDIR: z.string().default("./storage/codex-work"),
  CODEX_HOME: z.string().optional(),
  CODEX_MODEL: z.string().optional(),
  AI_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AI_MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(4).default(1),
  AI_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  CHROMIUM_PATH: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  BACKUP_DIR: z.string().default("./backups"),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(14),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Invalid environment configuration: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    cached = parsed.data;
  }
  return cached;
}

/** Reset cached env (tests). */
export function resetEnvCache() {
  cached = null;
}

export const storagePath = (...parts: string[]) => path.resolve(env().STORAGE_DIR, ...parts);
export const isSecureCookie = () => env().APP_URL.startsWith("https://");
