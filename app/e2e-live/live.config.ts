import { defineConfig, devices } from "@playwright/test";

// Smoke check of the live site after a deploy. No web server: it drives https://undercover.ph (or LIVE_URL).
export default defineConfig({
  testDir: ".",
  // The route-quality suite takes about 40 minutes, so it runs only with LIVE_QUALITY=1 (pnpm e2e:quality).
  testIgnore: process.env.LIVE_QUALITY ? [] : [/quality\.spec\.ts/],
  timeout: 180_000,
  expect: { timeout: 60_000 },
  retries: 0,
  // Three parallel pages on the software GPU timed out 3 times on 2026-10-23, and all passed on a rerun.
  // One worker by default, so a failure means the site, not the test machine. LIVE_WORKERS overrides it.
  workers: Number(process.env.LIVE_WORKERS ?? 1),
  reporter: [["list"]],
  use: {
    baseURL: process.env.LIVE_URL ?? "https://undercover.ph",
    ...devices["Pixel 7"],
    viewport: { width: 390, height: 844 },
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
});
