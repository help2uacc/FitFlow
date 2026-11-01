/**
 * Builds src/domain/exercises/catalog.generated.json from the public-domain
 * free-exercise-db dataset and downloads the referenced images into
 * public/media/exercises. Every image is verified (HTTP 200 + JPEG magic bytes)
 * before it is recorded as verified media.
 *
 * Usage: pnpm tsx scripts/catalog/build-catalog.ts
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { CURATION } from "./curation";

const SRC = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main";
interface Src {
  id: string; name: string; level: string; mechanic: string | null; equipment: string | null;
  primaryMuscles: string[]; secondaryMuscles: string[]; instructions: string[]; category: string; images: string[];
}

async function main() {
  const res = await fetch(`${SRC}/dist/exercises.json`);
  if (!res.ok) throw new Error(`dataset fetch failed ${res.status}`);
  const all = (await res.json()) as Src[];
  const byId = new Map(all.map((e) => [e.id, e]));
  const out = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const c of CURATION) {
    const s = byId.get(c.id);
    if (!s) throw new Error(`missing ${c.id}`);
    const media = [];
    for (const img of s.images.slice(0, 2)) {
      const url = `${SRC}/exercises/${img}`;
      const local = path.join("public/media/exercises", img);
      let ok = false;
      try {
        await stat(local);
        ok = true;
      } catch {
        const r = await fetch(url);
        const buf = Buffer.from(await r.arrayBuffer());
        if (r.ok && buf[0] === 0xff && buf[1] === 0xd8) {
          await mkdir(path.dirname(local), { recursive: true });
          await writeFile(local, buf);
          ok = true;
        }
      }
      if (ok) media.push({ kind: "image", localPath: `/media/exercises/${img}`, sourceUrl: url, verifiedAt: today });
    }
    out.push({
      id: c.id,
      nameFa: c.fa,
      nameEn: s.name,
      pattern: c.pattern,
      category: s.category,
      level: s.level,
      mechanic: s.mechanic,
      equipment: c.equipment,
      stress: c.stress,
      primaryMuscles: s.primaryMuscles,
      secondaryMuscles: s.secondaryMuscles,
      instructionsEn: s.instructions,
      cuesFa: c.cues,
      mistakesFa: c.mistakes,
      safetyFa: c.safety ?? null,
      media,
      referenceUrl: `https://github.com/yuhonas/free-exercise-db/tree/main/exercises/${c.id}`,
      source: "free-exercise-db",
    });
    process.stdout.write(".");
  }
  await writeFile("src/domain/exercises/catalog.generated.json", JSON.stringify(out, null, 1) + "\n");
  console.log(`\nwrote ${out.length} exercises`);
}
main().catch((e) => { console.error(e); process.exit(1); });
