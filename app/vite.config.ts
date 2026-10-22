/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The landing line shows the area counts before the area list loads, so the build bakes them in from the
// same areas.json it ships.
const areas: { region?: { id: string } }[] = JSON.parse(readFileSync(new URL("./public/data/areas.json", import.meta.url), "utf8")).areas;
const ncr = areas.filter((a) => (a.region?.id ?? "ncr") === "ncr").length;

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { chunkSizeWarningLimit: 1500 },
  define: { __AREA_COUNTS__: JSON.stringify({ ncr, other: areas.length - ncr }) },
  // Unit tests live under src. Playwright owns e2e/.
  test: { include: ["src/**/*.test.ts"] },
});
