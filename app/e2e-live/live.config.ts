import { defineConfig, devices } from "@playwright/test";

// Smoke check of the live site after a deploy. No web server: it drives https://undercover.ph (or LIVE_URL).
export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  expect: { timeout: 60_000 },
  retries: 0,
  workers: 3,
  reporter: [["list"]],
  use: {
    baseURL: process.env.LIVE_URL ?? "https://undercover.ph",
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
});
