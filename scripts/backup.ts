/**
 * Consistent online backup of the SQLite database (better-sqlite3 backup API,
 * safe while the app is running) plus private user files (progress photos).
 * Verifies integrity, writes a checksum manifest and prunes old backups.
 * Generated PDFs and temporary AI files are NOT backed up (they are reproducible).
 *
 *   pnpm backup            # create backup + prune
 */
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

const e = env();
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = path.resolve(e.BACKUP_DIR, `fitflow-${stamp}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });

const src = new Database(path.resolve(e.DATABASE_PATH), { readonly: true, fileMustExist: true });
const dbOut = path.join(dir, "fitflow.db");
await src.backup(dbOut);
src.close();

const check = new Database(dbOut, { readonly: true });
const integrity = (check.pragma("integrity_check", { simple: true }) as string) ?? "unknown";
const users = (check.prepare("select count(*) n from users").get() as { n: number }).n;
check.close();
if (integrity !== "ok") {
  console.error(`backup integrity check FAILED: ${integrity}`);
  process.exit(1);
}

const photos = path.resolve(e.STORAGE_DIR, "photos");
if (existsSync(photos)) cpSync(photos, path.join(dir, "photos"), { recursive: true });

const sha = createHash("sha256").update(readFileSync(dbOut)).digest("hex");
writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), db: "fitflow.db", sha256: sha, integrity, users, photos: existsSync(photos) }, null, 2), { mode: 0o600 });
console.log(`backup ok → ${dir} (sha256 ${sha.slice(0, 12)}…, integrity ${integrity})`);

// retention
const cutoff = Date.now() - e.BACKUP_RETENTION_DAYS * 86400000;
for (const d of readdirSync(path.resolve(e.BACKUP_DIR))) {
  const p = path.resolve(e.BACKUP_DIR, d);
  if (d.startsWith("fitflow-") && p !== dir && statSync(p).mtimeMs < cutoff) {
    rmSync(p, { recursive: true, force: true });
    console.log(`pruned ${d}`);
  }
}
