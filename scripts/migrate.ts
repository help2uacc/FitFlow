/** Apply database migrations and (re)seed reference catalogs. Safe to run repeatedly. */
import { openDatabase, runMigrations } from "@/db/client";
import { ensureCatalogSeeded } from "@/domain/catalog/seed";
import { env } from "@/lib/env";

const { db, sqlite } = openDatabase(env().DATABASE_PATH);
runMigrations(db);
const seeded = ensureCatalogSeeded(db, process.argv.includes("--reseed"));
const tables = sqlite.prepare("select count(*) n from sqlite_master where type='table'").get() as { n: number };
console.log(`migrations applied (${tables.n} tables)${seeded ? ", catalogs seeded" : ""} → ${env().DATABASE_PATH}`);
sqlite.close();
