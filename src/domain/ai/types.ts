import type { z } from "zod";

export type AiErrorCode = "auth" | "usage_limit" | "timeout" | "cancelled" | "invalid_output" | "unavailable" | "not_installed" | "process";

export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string, public retryable = false, public details?: unknown) {
    super(message);
  }
}

export const AI_ERROR_FA: Record<AiErrorCode, string> = {
  auth: "Codex روی سرور احراز هویت نشده یا نشست آن منقضی شده است. مدیر سرور باید «codex login» را برای کاربر سرویس اجرا کند.",
  usage_limit: "سقف استفاده موقت Codex پر شده است؛ درخواست به‌صورت خودکار بعداً دوباره امتحان می‌شود.",
  timeout: "تولید برنامه بیش از حد مجاز طول کشید.",
  cancelled: "درخواست لغو شد.",
  invalid_output: "پاسخ هوش مصنوعی معتبر نبود و منتشر نشد. برنامه فعلی شما بدون تغییر باقی ماند.",
  unavailable: "اتصال به سرویس هوش مصنوعی برقرار نشد؛ بعداً دوباره تلاش کنید.",
  not_installed: "Codex CLI روی سرور نصب نیست یا مسیر آن اشتباه است.",
  process: "اجرای Codex با خطا مواجه شد.",
};

export interface AiRequest<T = unknown> {
  jobId: string;
  task: string;
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  /** Structured context (also embedded in the prompt) — used by the mock provider. */
  context: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
}

export interface AiResponse {
  raw: unknown;
  text: string;
  durationMs: number;
  providerVersion: string | null;
}

export interface AiDiagnostic {
  provider: string;
  binaryFound: boolean;
  binaryPath: string | null;
  version: string | null;
  loggedIn: boolean | null;
  loginStatusText: string | null;
  smokeTest: { ok: boolean; durationMs: number; error?: string } | null;
  osUser: string;
  workdir: string;
  checkedAt: number;
  problems: string[];
}

export interface AIProvider {
  readonly name: string;
  generate(req: AiRequest): Promise<AiResponse>;
  diagnose(opts: { smoke: boolean }): Promise<AiDiagnostic>;
}
