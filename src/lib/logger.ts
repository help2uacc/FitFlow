/** Structured JSON logger. Never pass secrets or raw health data in `fields`. */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT = /(token|secret|password|authorization|cookie|api[_-]?key)/i;

function sanitize(fields: Record<string, unknown> | undefined) {
  if (!fields) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else if (typeof v === "string" && v.length > 500) out[k] = v.slice(0, 500) + "…";
    else out[k] = v;
  }
  return out;
}

function log(level: Level, msg: string, fields?: Record<string, unknown>) {
  const min = (process.env.LOG_LEVEL as Level) || "info";
  if (order[level] < order[min]) return;
  if (process.env.NODE_ENV === "test" && level !== "error" && !process.env.DEBUG_LOGS) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...sanitize(fields) });
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
}

export const logger = {
  debug: (m: string, f?: Record<string, unknown>) => log("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => log("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => log("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => log("error", m, f),
};
