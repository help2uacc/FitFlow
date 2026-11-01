/** CodexCLIProvider against a fake `codex` executable (no real AI usage). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { CodexCLIProvider } from "@/domain/ai/codex-provider";
import { AiError } from "@/domain/ai/types";

let dir: string;
const fake = (name: string, body: string) => {
  const p = path.join(dir, name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
};
// writes args + stdin to log, then the output file given after -o / --output-last-message
const OK = `
LOG="$(dirname "$0")/calls.log"; echo "ARGS:$*" >> "$LOG"; STDIN=$(cat); echo "STDIN:$STDIN" >> "$LOG"
OUT=""; prev=""; for a in "$@"; do if [ "$prev" = "--output-last-message" ]; then OUT="$a"; fi; prev="$a"; done
echo '{"type":"thread.started"}'; echo '{"type":"turn.started"}'
echo '{"ok": true}' > "$OUT"; echo '{"type":"turn.completed"}'`;

beforeAll(() => { dir = mkdtempSync(path.join(os.tmpdir(), "ff-codex-")); });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const req = (over: Partial<Parameters<CodexCLIProvider["generate"]>[0]> = {}) => ({
  jobId: "job-1234567890", task: "smoke", prompt: 'user text $(rm -rf /) "; echo pwned', schema: z.object({ ok: z.boolean() }),
  jsonSchema: { type: "object" }, context: {}, timeoutMs: 10_000, ...over,
});

describe("CodexCLIProvider", () => {
  it("invokes codex exec non-interactively with the safe flags and passes the prompt via stdin only", async () => {
    const bin = fake("codex-ok", OK);
    const p = new CodexCLIProvider({ bin, workdir: path.join(dir, "work") });
    const r = await p.generate(req());
    expect(r.raw).toEqual({ ok: true });
    const log = readFileSync(path.join(dir, "calls.log"), "utf8");
    expect(log).toContain("exec --sandbox read-only --ephemeral --skip-git-repo-check --json");
    expect(log).toContain("--output-schema");
    expect(log).toMatch(/ARGS:.* -$/m);
    expect(log.split("\n").find((l) => l.startsWith("ARGS:"))).not.toContain("rm -rf");
    expect(log).toContain("STDIN:user text $(rm -rf /)");
  });
  it("classifies an expired login as auth error", async () => {
    const bin = fake("codex-auth", `cat >/dev/null; echo '{"type":"error","message":"Not logged in. Please run codex login"}'; exit 1`);
    await expect(new CodexCLIProvider({ bin, workdir: path.join(dir, "work") }).generate(req())).rejects.toMatchObject({ code: "auth" });
  });
  it("classifies usage limits as retryable", async () => {
    const bin = fake("codex-limit", `cat >/dev/null; echo '{"type":"error","message":"You have hit your usage limit. Try again in 20 minutes"}'; exit 1`);
    const e = await new CodexCLIProvider({ bin, workdir: path.join(dir, "work") }).generate(req()).catch((x) => x);
    expect(e).toBeInstanceOf(AiError);
    expect(e.code).toBe("usage_limit");
    expect(e.retryable).toBe(true);
  });
  it("times out and kills the process", async () => {
    const bin = fake("codex-hang", `cat >/dev/null; sleep 30`);
    const t0 = Date.now();
    await expect(new CodexCLIProvider({ bin, workdir: path.join(dir, "work") }).generate(req({ timeoutMs: 800 }))).rejects.toMatchObject({ code: "timeout" });
    expect(Date.now() - t0).toBeLessThan(5000);
  });
  it("supports cancellation", async () => {
    const bin = fake("codex-hang2", `cat >/dev/null; sleep 30`);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 300);
    await expect(new CodexCLIProvider({ bin, workdir: path.join(dir, "work") }).generate(req({ signal: ac.signal }))).rejects.toMatchObject({ code: "cancelled" });
  });
  it("rejects non-JSON output", async () => {
    const bin = fake("codex-bad", `cat >/dev/null; prev=""; for a in "$@"; do if [ "$prev" = "--output-last-message" ]; then echo "Sure! here is your plan" > "$a"; fi; prev="$a"; done`);
    await expect(new CodexCLIProvider({ bin, workdir: path.join(dir, "work") }).generate(req())).rejects.toMatchObject({ code: "invalid_output" });
  });
  it("reports a missing binary", async () => {
    await expect(new CodexCLIProvider({ bin: path.join(dir, "nope"), workdir: path.join(dir, "work") }).generate(req())).rejects.toMatchObject({ code: "not_installed" });
  });
  it("diagnoses login status", async () => {
    const bin = fake("codex-diag", `if [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; elif [ "$1" = "login" ]; then echo "Not logged in"; exit 1; fi`);
    const d = await new CodexCLIProvider({ bin, workdir: path.join(dir, "work") }).diagnose({ smoke: false });
    expect(d.version).toBe("codex-cli 9.9.9");
    expect(d.loggedIn).toBe(false);
    expect(d.problems.join()).toMatch(/not logged in/);
  });
});
