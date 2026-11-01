import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "dist/**", "node_modules/**", "public/sw.js", "storage*/**", "data/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@next/next/no-img-element": "off",
      // auth transitions intentionally do a full reload so no client state survives login/logout
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
]);
