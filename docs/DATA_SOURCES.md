# Data sources & licensing

## Exercise library
- **Dataset:** [free-exercise-db](https://github.com/yuhonas/free-exercise-db) by yuhonas. Licence: **Unlicense (public domain)**.
  FitFlow ships a curated subset of about 100 exercises in `src/domain/exercises/catalog.generated.json`, built by `scripts/catalog/build-catalog.ts`.
- **Images:** downloaded from the dataset's GitHub raw URLs into `public/media/exercises/`. They are public domain, so they may be embedded in the app and in PDFs.
  Each image was **verified** when the catalog was built: HTTP 200 plus a JPEG signature check. The verification date is stored in `exercise_media.verified_at` and `exercises.last_validated_at`.
  An exercise without verified media is never eligible for a plan (`isEligible`).
- **Original FitFlow content:** Persian names, movement patterns, equipment and joint-stress tags, and the Persian cues, common mistakes and safety notes (`scripts/catalog/curation.ts`).
- **Reference link:** each exercise links to its entry in the dataset repository.
- **Video:** FitFlow does **not** invent specific video URLs. Each exercise has a clearly labelled *YouTube search* link (`exercise_sources.kind = "video_search"`, `verified = false`).
  To add a verified, specific video or an ExRx/ACE/NSCA reference, insert a row into `exercise_sources` with `kind = "video"` or `"reference"` and `verified = 1` after checking the link yourself. External sites were not reachable from the build environment, so none were added automatically.
- **Refreshing:** run `pnpm tsx scripts/catalog/build-catalog.ts`, then `pnpm db:seed`.

## Food & nutrient data
- **USDA FoodData Central, SR Legacy:** public domain (CC0 1.0). Generic foods (meats, dairy, grains, legumes, fruit, vegetables, nuts, oils) are stored per 100 g in `src/domain/nutrition/foods.data.ts`.
  The values were transcribed and rounded manually, so `confidence = "medium"`.
- **Typical label values:** whey protein and textured soy protein are generic averages (`confidence = "low"`).
- **FitFlow estimates:** Iranian prepared dishes (قورمه‌سبزی, قیمه, کوبیده, جوجه‌کباب, آش رشته, کوکو سبزی, عدس‌پلو, ماست‌وخیار, عدسی) and Iranian breads are estimated from standard home recipes (`confidence = "low"`). Real values vary by recipe.
  Prepared dishes already include their ingredients, and rice is served separately, which avoids double counting.
- **User data:** user-defined foods and recipes are stored per user (`foods.user_id`). Recipe nutrition is computed once from its ingredients; the recipe is then logged as a single derived food.
- Source and confidence are stored per food (`foods.source_id`, `foods.confidence`, table `food_sources`). The UI presents all energy values as estimates.

## Fonts
- **Vazirmatn:** SIL Open Font License 1.1 (`assets/fonts/LICENSE-Vazirmatn.txt`; also served via `@fontsource/vazirmatn`).
