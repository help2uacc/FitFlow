/**
 * Restore a backup created by scripts/backup.ts.
 * STOP both services first:  sudo systemctl stop fitflow-web fitflow-worker
 *
 *   pnpm restore backups/fitflow-2026-01-01T03-00-00 [--yes]
 */
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

const dir = process.argv[2];
if (!dir || !existsSync(path.join(dir, "manifest.json"))) {
  console.error("usage: pnpm restore <backup-dir> [--yes]");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
const file = path.join(dir, manifest.db);
const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
if (sha !== manifest.sha256) { console.error("checksum mismatch — backup is corrupted"); process.exit(1); }
const chk = new Database(file, { readonly: true });
const integrity = chk.pragma("integrity_check", { simple: true });
chk.close();
if (integrity !== "ok") { console.error("integrity check failed: " + integrity); process.exit(1); }
if (!process.argv.includes("--yes")) {
  console.log(`Backup verified (${manifest.createdAt}, users=${manifest.users}). Re-run with --yes to replace the current database.`);
  process.exit(0);
}
const e = env();
const target = path.resolve(e.DATABASE_PATH);
if (existsSync(target)) {
  const keep = `${target}.pre-restore-${Date.now()}`;
  renameSync(target, keep);
  console.log(`current database moved to ${keep}`);
}
for (const ext of ["-wal", "-shm"]) rmSync(target + ext, { force: true });
copyFileSync(file, target);
if (manifest.photos && existsSync(path.join(dir, "photos"))) {
  cpSync(path.join(dir, "photos"), path.resolve(e.STORAGE_DIR, "photos"), { recursive: true });
}
console.log("restore complete — start the services again: sudo systemctl start fitflow-worker fitflow-web");
