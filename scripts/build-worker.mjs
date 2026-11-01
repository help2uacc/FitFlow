// Bundles the background worker and CLI scripts into dist/ (native deps stay external).
import { build } from "esbuild";
const external = ["better-sqlite3", "@node-rs/argon2", "playwright-core", "web-push", "qrcode"];
const common = { bundle: true, platform: "node", target: "node22", format: "esm", external, sourcemap: true, tsconfig: "tsconfig.json", logLevel: "warning",
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } };
await build({ ...common, entryPoints: { worker: "src/worker/index.ts", migrate: "scripts/migrate.ts", backup: "scripts/backup.ts", "reset-password": "scripts/reset-password.ts" }, outdir: "dist", outExtension: { ".js": ".mjs" } });
console.log("worker + scripts bundled into dist/");
