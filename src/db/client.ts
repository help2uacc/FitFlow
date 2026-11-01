import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { ensureCatalogSeeded } from "@/domain/catalog/seed";

export type DB = BetterSQLite3Database<typeof schema>;

declare global {
  var __fitflowDb: { db: DB; sqlite: Database.Database } | undefined;
}

export function openDatabase(file: string) {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export function migrationsFolder() {
  return path.resolve(process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle"));
}

export function runMigrations(db: DB) {
  migrate(db, { migrationsFolder: migrationsFolder() });
}

/** Process-wide singleton connection (migrated on first use). */
export function getDb(): DB {
  if (!globalThis.__fitflowDb) {
    const conn = openDatabase(env().DATABASE_PATH);
    runMigrations(conn.db);
    ensureCatalogSeeded(conn.db);
    globalThis.__fitflowDb = conn;
  }
  return globalThis.__fitflowDb.db;
}

export function getSqlite(): Database.Database {
  getDb();
  return globalThis.__fitflowDb!.sqlite;
}

/** Test helper: replace the singleton. */
export function setDbForTests(conn: { db: DB; sqlite: Database.Database } | undefined) {
  globalThis.__fitflowDb = conn;
}
