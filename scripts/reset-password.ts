/**
 * Offline password recovery for this private, self-hosted app (run on the server):
 *   pnpm user:reset-password owner@example.com
 * Prompts for the new password (input hidden) and revokes all sessions.
 */
import { createInterface } from "node:readline";
import { openDatabase, runMigrations } from "@/db/client";
import { resetPasswordOffline } from "@/domain/auth/service";
import { env } from "@/lib/env";

const email = process.argv[2];
if (!email) { console.error("usage: pnpm user:reset-password <email>"); process.exit(1); }

function ask(q: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => { if (s.includes(q)) out.output.write(s); };
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}
const pw = process.env.NEW_PASSWORD ?? (await ask("New password: "));
const pw2 = process.env.NEW_PASSWORD ?? (await ask("Repeat: "));
if (pw !== pw2) { console.error("passwords do not match"); process.exit(1); }
const { db, sqlite } = openDatabase(env().DATABASE_PATH);
runMigrations(db);
try {
  await resetPasswordOffline(db, email, pw);
  console.log("password updated; all sessions revoked");
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  sqlite.close();
}
