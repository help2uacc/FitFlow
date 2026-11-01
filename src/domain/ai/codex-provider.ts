/**
 * CodexCLIProvider — runs the locally installed & authenticated Codex CLI in
 * non-interactive mode. Security properties:
 *  - spawn() with an argument array and shell:false (no shell interpolation);
 *  - the prompt (which contains user text) is sent only via stdin;
 *  - `--sandbox read-only` + `--ephemeral` + a private per-job working dir;
 *  - output constrained by `--output-schema` and re-validated by the app;
 *  - app secrets are stripped from the child environment;
 *  - process group is killed on timeout/cancel.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "@/lib/logger";
import { AiError, type AIProvider, type AiDiagnostic, type AiRequest, type AiResponse } from "./types";

export interface CodexConfig { bin: string; workdir: string; model?: string; codexHome?: string }

const AUTH_RE = /not logged in|unauthori[sz]ed|\b401\b|please (run )?`?codex login|authentication|refresh[_ ]token|token (has )?expired|login required/i;
const USAGE_RE = /usage limit|rate[_ ]limit|\b429\b|quota|too many requests|try again in|limit reached/i;
const NET_RE = /reconnecting|connection failed|stream disconnected|network|dns|connect(ion)? (refused|reset)|proxy/i;

function childEnv(cfg: CodexConfig): NodeJS.ProcessEnv {
  const out = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) {
    if (/SECRET|VAPID|DATABASE|SESSION|PASSWORD|_KEY$/i.test(k) && !/^(OPENAI_API_KEY|CODEX_API_KEY)$/.test(k)) continue;
    out[k] = v;
  }
  if (cfg.codexHome) out.CODEX_HOME = cfg.codexHome;
  out.NO_COLOR = "1";
  return out;
}

export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("no JSON object in output");
  }
}

interface RunResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; cancelled: boolean; earlyAbort?: string }

function run(cfg: CodexConfig, args: string[], opts: { cwd: string; stdin?: string; timeoutMs: number; signal?: AbortSignal; onLine?: (l: string) => string | void }): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cfg.bin, args, { cwd: opts.cwd, env: childEnv(cfg), shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      reject(e);
      return;
    }
    let stdout = "", stderr = "", buf = "", timedOut = false, cancelled = false, earlyAbort: string | undefined;
    const kill = () => {
      try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
      setTimeout(() => { try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { /* gone */ } }, 5000).unref();
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, opts.timeoutMs);
    const onAbort = () => { cancelled = true; kill(); };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.stdout.on("data", (d: Buffer) => {
      const s = d.toString();
      if (stdout.length < 2_000_000) stdout += s;
      buf += s;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        const stop = opts.onLine?.(line);
        if (stop && !earlyAbort) { earlyAbort = stop; kill(); }
      }
    });
    child.stderr.on("data", (d: Buffer) => { if (stderr.length < 200_000) stderr += d.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({ code, stdout, stderr, timedOut, cancelled, earlyAbort });
    });
    child.stdin.on("error", () => { /* child may exit early */ });
    if (opts.stdin !== undefined) child.stdin.end(opts.stdin);
    else child.stdin.end();
  });
}

export class CodexCLIProvider implements AIProvider {
  readonly name = "codex-cli";
  private versionCache: string | null = null;
  constructor(private cfg: CodexConfig) {}

  private async version(): Promise<string | null> {
    if (this.versionCache) return this.versionCache;
    try {
      const r = await run(this.cfg, ["--version"], { cwd: os.tmpdir(), timeoutMs: 15000 });
      if (r.code === 0) this.versionCache = r.stdout.trim().split("\n")[0] ?? null;
    } catch { /* not installed */ }
    return this.versionCache;
  }

  async generate(req: AiRequest): Promise<AiResponse> {
    const started = Date.now();
    const dir = path.resolve(this.cfg.workdir, `job-${req.jobId.slice(0, 8)}-${randomBytes(4).toString("hex")}`);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const schemaPath = path.join(dir, "schema.json");
    const outPath = path.join(dir, "output.json");
    await writeFile(schemaPath, JSON.stringify(req.jsonSchema), { mode: 0o600 });
    const args = [
      "exec", "--sandbox", "read-only", "--ephemeral", "--skip-git-repo-check", "--json", "--color", "never",
      "--output-schema", schemaPath, "--output-last-message", outPath, "-C", dir,
    ];
    if (this.cfg.model) args.push("-m", this.cfg.model);
    args.push("-");
    const messages: string[] = [];
    let netErrors = 0;
    let lastAgentText = "";
    try {
      let r: RunResult;
      try {
        r = await run(this.cfg, args, {
          cwd: dir, stdin: req.prompt, timeoutMs: req.timeoutMs, signal: req.signal,
          onLine: (line) => {
            let ev: { type?: string; message?: string; error?: { message?: string }; item?: { type?: string; text?: string; message?: string } };
            try { ev = JSON.parse(line); } catch { return; }
            const msg = ev.message ?? ev.error?.message ?? (ev.item?.type === "error" ? ev.item.message : undefined);
            if (msg) {
              messages.push(msg);
              if (NET_RE.test(msg)) netErrors++;
              if (AUTH_RE.test(msg)) return "auth";
              if (USAGE_RE.test(msg) && /limit|429|quota/i.test(msg)) return "usage";
              if (netErrors >= 8) return "network";
            }
            if (ev.type === "turn.started") req.onProgress?.("مدل در حال طراحی برنامه است…");
            if (ev.item?.type === "reasoning") req.onProgress?.("در حال تحلیل اطلاعات شما…");
            if (ev.item?.type === "agent_message" && ev.item.text) lastAgentText = ev.item.text;
          },
        });
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ENOENT") throw new AiError("not_installed", `Codex binary not found: ${this.cfg.bin}`);
        throw new AiError("process", err.message, true);
      }
      const diag = [...messages, r.stderr].join("\n");
      if (r.cancelled) throw new AiError("cancelled", "cancelled");
      if (r.earlyAbort === "auth" || AUTH_RE.test(diag) && r.code !== 0) throw new AiError("auth", "Codex is not authenticated for the worker account");
      if (r.earlyAbort === "usage" || (USAGE_RE.test(diag) && r.code !== 0)) throw new AiError("usage_limit", "Codex usage limit reached", true);
      if (r.timedOut) throw new AiError("timeout", `Codex did not finish within ${Math.round(req.timeoutMs / 1000)}s`, true);
      if (r.earlyAbort === "network") throw new AiError("unavailable", "Codex could not reach the model service", true);
      let text = "";
      try { text = await readFile(outPath, "utf8"); } catch { text = lastAgentText; }
      if (!text.trim()) {
        if (r.code !== 0) throw new AiError(NET_RE.test(diag) ? "unavailable" : "process", `codex exited with code ${r.code}: ${diag.slice(-400)}`, true);
        throw new AiError("invalid_output", "empty output");
      }
      let raw: unknown;
      try { raw = extractJson(text); } catch (e) { throw new AiError("invalid_output", `output is not valid JSON: ${(e as Error).message}`, false, { sample: text.slice(0, 300) }); }
      return { raw, text, durationMs: Date.now() - started, providerVersion: await this.version() };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch((e) => logger.warn("failed to remove codex job dir", { err: e }));
    }
  }

  async diagnose(opts: { smoke: boolean }): Promise<AiDiagnostic> {
    const problems: string[] = [];
    const d: AiDiagnostic = {
      provider: this.name, binaryFound: false, binaryPath: this.cfg.bin, version: null, loggedIn: null, loginStatusText: null, smokeTest: null,
      osUser: os.userInfo().username, workdir: path.resolve(this.cfg.workdir), checkedAt: Date.now(), problems,
    };
    await mkdir(this.cfg.workdir, { recursive: true, mode: 0o700 }).catch(() => problems.push("cannot create Codex working directory"));
    this.versionCache = null;
    d.version = await this.version();
    d.binaryFound = !!d.version;
    if (!d.binaryFound) { problems.push(`Codex CLI not found at "${this.cfg.bin}"`); return d; }
    try {
      const r = await run(this.cfg, ["login", "status"], { cwd: os.tmpdir(), timeoutMs: 20000 });
      const txt = (r.stdout + "\n" + r.stderr).trim();
      d.loginStatusText = txt.replace(/(sk-|eyJ)[A-Za-z0-9._-]{8,}/g, "[redacted]").slice(0, 300);
      d.loggedIn = r.code === 0 && !/not logged in/i.test(txt);
      if (!d.loggedIn) problems.push(`Codex is not logged in for OS user "${d.osUser}"`);
    } catch (e) {
      problems.push("login status check failed: " + (e as Error).message);
    }
    if (opts.smoke && d.loggedIn) {
      const { z } = await import("zod");
      const schema = z.object({ ok: z.boolean() });
      const t0 = Date.now();
      try {
        const res = await this.generate({
          jobId: "diag-" + createHash("sha1").update(String(Date.now())).digest("hex"), task: "smoke",
          prompt: 'Health check. Do not run any commands. Respond with exactly {"ok": true}.',
          schema, jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
          context: {}, timeoutMs: 120000,
        });
        const ok = schema.safeParse(res.raw).success;
        d.smokeTest = { ok, durationMs: Date.now() - t0, error: ok ? undefined : "unexpected output" };
      } catch (e) {
        d.smokeTest = { ok: false, durationMs: Date.now() - t0, error: e instanceof AiError ? `${e.code}: ${e.message}` : (e as Error).message };
        problems.push("smoke test failed");
      }
    }
    return d;
  }
}
