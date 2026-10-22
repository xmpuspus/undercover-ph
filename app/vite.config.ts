/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { chunkSizeWarningLimit: 1500 },
  // Unit tests live under src. Playwright owns e2e/.
  test: { include: ["src/**/*.test.ts"] },
});
