/** Force re-seed of the exercise & food reference catalogs (never touches user data). */
import { openDatabase, runMigrations } from "@/db/client";
import { ensureCatalogSeeded } from "@/domain/catalog/seed";
import { env } from "@/lib/env";

const { db, sqlite } = openDatabase(env().DATABASE_PATH);
runMigrations(db);
ensureCatalogSeeded(db, true);
console.log("reference catalogs seeded");
sqlite.close();
