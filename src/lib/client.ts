"use client";
/** Browser-side helpers: typed fetch wrapper, job polling, client IDs. */
import { useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "network", "اتصال اینترنت برقرار نیست.");
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    window.location.href = "/login";
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? "error", e.message ?? "خطایی رخ داد.", e.details);
  }
  return data as T;
}

export const uid = (prefix = "c") =>
  `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)}`;

export interface JobView {
  id: string; type: string; status: "queued" | "running" | "validating" | "completed" | "failed" | "cancelled";
  progress: string | null; attempts: number; maxAttempts: number; errorCode: string | null; error: string | null; retryAt: number | null; result: unknown;
}

/** Poll a background job until it reaches a terminal state. */
export function useJob(jobId: string | null | undefined, onDone?: (j: JobView) => void) {
  const [job, setJob] = useState<JobView | null>(null);
  const cb = useRef(onDone);
  useEffect(() => {
    cb.current = onDone;
  });
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const j = await api<JobView>(`/api/jobs/${jobId}`);
        if (stop) return;
        setJob(j);
        if (["completed", "failed", "cancelled"].includes(j.status)) {
          cb.current?.(j);
          return;
        }
      } catch {
        /* keep polling through transient errors */
      }
      timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId]);
  return job;
}

export const JOB_STATUS_FA: Record<string, string> = {
  queued: "در صف", running: "در حال تولید", validating: "در حال اعتبارسنجی", completed: "آماده", failed: "ناموفق", cancelled: "لغو شد",
};
