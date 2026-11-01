/**
 * Diagnose the Codex CLI integration as the CURRENT OS user (run it as the worker's user):
 *   sudo -u fitflow -H pnpm ai:check            # binary, version, login status
 *   sudo -u fitflow -H pnpm ai:check --smoke    # + one real lightweight structured request
 */
import { CodexCLIProvider } from "@/domain/ai/codex-provider";
import { env } from "@/lib/env";

const e = env();
const p = new CodexCLIProvider({ bin: e.CODEX_BIN, workdir: e.CODEX_WORKDIR, model: e.CODEX_MODEL, codexHome: e.CODEX_HOME });
const d = await p.diagnose({ smoke: process.argv.includes("--smoke") });
console.log(JSON.stringify(d, null, 2));
process.exit(d.problems.length ? 1 : 0);
