import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { CATALOG, CATALOG_VERSION, similarity } from "@/domain/exercises/catalog";
import { FOODS, FOOD_SOURCES } from "@/domain/nutrition/foods.data";

const KEY = "catalog_version";

/** Idempotently seed the exercise and food catalogs (reference data, not user data). */
export function ensureCatalogSeeded(db: DB, force = false) {
  const row = db.select().from(t.appSettings).where(eq(t.appSettings.key, KEY)).get();
  if (!force && row && row.value === CATALOG_VERSION) return false;

  db.transaction((tx) => {
    for (const ex of CATALOG) {
      const values = {
        id: ex.id, nameFa: ex.nameFa, nameEn: ex.nameEn, pattern: ex.pattern, category: ex.category, level: ex.level, mechanic: ex.mechanic,
        equipment: ex.equipment, stress: ex.stress, primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles,
        instructionsEn: ex.instructionsEn, cuesFa: ex.cuesFa, mistakesFa: ex.mistakesFa, safetyFa: ex.safetyFa, isActive: true,
        lastValidatedAt: ex.media[0]?.verifiedAt ?? null,
      };
      tx.insert(t.exercises).values(values).onConflictDoUpdate({ target: t.exercises.id, set: values }).run();
      tx.delete(t.exerciseMedia).where(eq(t.exerciseMedia.exerciseId, ex.id)).run();
      ex.media.forEach((m, i) =>
        tx.insert(t.exerciseMedia).values({
          id: `${ex.id}#img${i}`, exerciseId: ex.id, kind: "image", localPath: m.localPath, url: m.sourceUrl,
          license: "Unlicense (public domain) — free-exercise-db", embeddable: true, verified: true, verifiedAt: m.verifiedAt, sortOrder: i,
        }).run(),
      );
      tx.delete(t.exerciseSources).where(eq(t.exerciseSources.exerciseId, ex.id)).run();
      tx.insert(t.exerciseSources).values([
        { id: `${ex.id}#dataset`, exerciseId: ex.id, kind: "dataset", title: "free-exercise-db: " + ex.nameEn, url: ex.referenceUrl,
          attribution: "yuhonas/free-exercise-db (Unlicense)", license: "Unlicense", verified: ex.media.length > 0, verifiedAt: ex.media[0]?.verifiedAt ?? null },
        { id: `${ex.id}#video`, exerciseId: ex.id, kind: "video_search", title: "جستجوی ویدیوی آموزشی: " + ex.nameEn,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.nameEn + " exercise form tutorial")}`,
          attribution: "YouTube search (not a specific endorsed video)", license: null, verified: false, verifiedAt: null },
      ]).run();
    }
    tx.delete(t.exerciseAlternatives).run();
    for (const a of CATALOG) {
      const alts = CATALOG.map((b) => ({ b, s: similarity(a, b) })).filter((x) => x.s >= 0.5).sort((x, y) => y.s - x.s).slice(0, 8);
      for (const { b, s } of alts) tx.insert(t.exerciseAlternatives).values({ exerciseId: a.id, alternativeId: b.id, score: s }).run();
    }
    for (const s of FOOD_SOURCES) {
      tx.insert(t.foodSources).values({ ...s, url: s.url ?? null }).onConflictDoUpdate({ target: t.foodSources.id, set: { name: s.name, url: s.url ?? null, license: s.license, notes: s.notes } }).run();
    }
    for (const f of FOODS) {
      const values = {
        id: f.id, userId: null, nameFa: f.fa, nameEn: f.en, category: f.cat, state: f.state, servingG: f.servingG, servingLabel: f.serving,
        kcal100: f.kcal, protein100: f.p, carbs100: f.c, fat100: f.f, fiber100: f.fiber ?? null, tags: f.tags, costLevel: f.cost,
        sourceId: f.src, confidence: (f.src === "usda_sr" ? "medium" : "low") as "medium" | "low", isActive: true,
      };
      tx.insert(t.foods).values(values).onConflictDoUpdate({ target: t.foods.id, set: values }).run();
    }
    tx.insert(t.appSettings).values({ key: KEY, value: CATALOG_VERSION }).onConflictDoUpdate({ target: t.appSettings.key, set: { value: CATALOG_VERSION } }).run();
  });
  return true;
}
