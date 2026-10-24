/// <reference types="node" />
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect as visible, type Browser, type Page } from "@playwright/test";
import { build, type Rollup } from "vite";
import { afterAll, beforeAll, expect, it as vitestIt, vi } from "vitest";
import { decodeSearch } from "./searchIndex";

// These browser regressions are part of app-unit, since the acceptance specs and their config are
// protected. Build the actual production config in memory; serve source data read-only. No dist or
// public/data files are changed. New screenshots stay in memory; saved review evidence is read-only.
const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const publicRoot = resolve(appRoot, "public");
const shots = resolve(appRoot, "scripts/review-evidence");
// The Vercel build runs the unit tests with the area data but without a Playwright browser, and the CI app job
// runs them without the area data. CI installs Chromium in its deploy-build job, so these tests still run there.
const READY = existsSync(chromium.executablePath()) && existsSync(resolve(publicRoot, "data/areas/metro-core/manifest.json"));
const it = vitestIt.skipIf(!READY);
const files = new Map<string, Buffer>();
let browser: Browser | undefined;
let server: Server | undefined;
let origin: string;
let date: string;
let evidenceBefore: Awaited<ReturnType<typeof evidenceSnapshot>>;
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff" };

async function evidenceSnapshot() {
  let entries;
  try { entries = await readdir(shots, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort().map(async (name) => {
    const path = resolve(shots, name);
    const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
    return { name, size: info.size, modified: info.mtimeMs, sha256: createHash("sha256").update(bytes).digest("hex") };
  }));
}

beforeAll(async () => {
  if (!READY) return;
  evidenceBefore = await evidenceSnapshot();
  server = createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url!, "http://localhost").pathname).slice(1) || "index.html";
      const path = resolve(publicRoot, name);
      if (!path.startsWith(publicRoot + sep)) { res.writeHead(403).end(); return; }
      let body = files.get(name);
      if (!body) {
        try { body = await readFile(path); } catch { res.writeHead(404).end(); return; }
      }
      res.writeHead(200, { "Content-Type": types[extname(name)] ?? "application/octet-stream", "Content-Length": body.length, "Cache-Control": "no-cache" });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch { res.writeHead(400).end(); }
  });
  await new Promise<void>((done, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", done); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Browser regression server did not bind.");
  origin = `http://127.0.0.1:${address.port}`;
  // Vitest sets NODE_ENV=test. Use the production branch of React and import.meta.env here too.
  const previousEnv = process.env.NODE_ENV;
  let output;
  try {
    process.env.NODE_ENV = "production";
    output = await build({ root: appRoot, configFile: resolve(appRoot, "vite.config.ts"), configLoader: "runner", logLevel: "warn", cacheDir: resolve(appRoot, "scripts/.browser-cache"), build: { write: false } });
  } finally {
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
  for (const result of (Array.isArray(output) ? output : [output]) as Rollup.RollupOutput[]) {
    for (const file of result.output) files.set(file.fileName, Buffer.from(file.type === "chunk" ? file.code : file.source));
  }
  const manifest = JSON.parse(await readFile(resolve(publicRoot, "data/areas/metro-core/manifest.json"), "utf8"));
  date = manifest.dates[0];
  browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  server?.closeAllConnections();
  if (server?.listening) await new Promise<void>((done) => server!.close(() => done()));
  files.clear();
});

async function start(page: Page, hour = "09:00") {
  // Exercise the app's existing plain-ground fallback without relying on external map services.
  await page.route((url) => url.origin !== origin || url.pathname.endsWith(".pmtiles"), (route) => route.abort());
  await page.goto(`${origin}/?now=${date}T${hour}`);
  await visible(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("pick-shade").click();
}
const option = (page: Page, name: string) => page.getByTestId("place-option").filter({ has: page.getByText(name, { exact: true }) }).first();
async function pick(page: Page, field: string, name: string) {
  await page.getByTestId(field).fill(name);
  await visible(option(page, name)).toBeVisible();
  await option(page, name).click();
}

it("adds a real background-only place to the visible results without another keystroke", async () => {
  const name = "Yankee Candle At True Value Greenbelt";
  const top = decodeSearch(JSON.parse(files.get("data/search/top.json")!.toString()));
  const rest = decodeSearch(JSON.parse(files.get("data/search/area-metro-core.json")!.toString()));
  expect(top.entries.some((e) => e.place.name === name)).toBe(false);
  expect(rest.entries.some((e) => e.place.name === name)).toBe(true);
  let count = 0;
  const gated = await browser!.newContext({ serviceWorkers: "block", viewport: { width: 375, height: 812 } });
  const target = await gated.newPage();
  let open!: () => void;
  const gate = new Promise<void>((done) => { open = done; });
  try {
    await gated.route("**/data/search/area-*.json", async (r) => { count++; await gate; await r.continue(); });
    await start(target);
    await target.getByTestId("destination-input").fill("Greenbelt");
    await visible(option(target, "Greenbelt")).toBeVisible();
    await target.getByTestId("destination-input").fill(name);
    await visible(option(target, name)).toHaveCount(0);
    await vi.waitFor(() => expect(count).toBeGreaterThan(0));
    open();
    await visible(option(target, name)).toBeVisible({ timeout: 30_000 });
    await visible(target.getByTestId("destination-input")).toHaveValue(name);
    expect((await target.screenshot()).byteLength).toBeGreaterThan(1000);
  } finally { open(); await gated.close(); }
}, 120_000);

it("ships a curated install download rather than precaching every emitted asset", () => {
  const worker = files.get("sw.js")!.toString();
  const shell = JSON.parse(/const SHELL = (\[[^\n]+\]);/.exec(worker)![1]) as string[];
  expect(shell.some((file) => /MapView-.*\.js$/.test(file))).toBe(true);
  expect(shell.some((file) => /\/index-.*\.js$/.test(file))).toBe(true);
  expect(shell.some((file) => /maplibre-gl-.*\.js$/.test(file))).toBe(true);
  for (const file of shell) {
    expect(file).not.toMatch(/(?:About|RainLayer|Navigate|Steps)-.*\.js$/);
    expect(file).not.toMatch(/(?:cyrillic|latin-ext|\.woff$)/);
  }
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 375, height: 812 }]) {
  for (const colorScheme of ["light", "dark"] as const) {
    it(`keeps Loading visible and unobscured at ${viewport.width}px in ${colorScheme} mode`, async () => {
      const context = await browser!.newContext({ viewport, colorScheme, serviceWorkers: "block", isMobile: viewport.width < 768, hasTouch: viewport.width < 768 });
      const page = await context.newPage();
      let release!: () => void;
      const gate = new Promise<void>((done) => { release = done; });
      try {
        await context.route("**/data/areas/metro-core/graph.cols.json", async (r) => { await gate; await r.continue(); });
        await start(page, colorScheme === "dark" ? "20:00" : "09:00");
        await pick(page, "destination-input", "Greenbelt");
        const progress = page.getByTestId("load-progress");
        await visible(progress).toBeVisible();
        await visible(progress).toContainText(/Loading.*\d+(?:%|\s*[KM]?B)/);
        const geometry = await progress.evaluate((el) => {
          const b = el.getBoundingClientRect();
          const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, w: innerWidth, h: innerHeight, exposed: top === el || el.contains(top), overflow: document.documentElement.scrollWidth - innerWidth };
        });
        expect(geometry.x).toBeGreaterThanOrEqual(0);
        expect(geometry.y).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(geometry.w);
        expect(geometry.bottom).toBeLessThanOrEqual(geometry.h);
        expect(geometry.exposed).toBe(true);
        expect(geometry.overflow).toBe(0);
        expect((await page.screenshot()).byteLength).toBeGreaterThan(1000);
        release();
        await pick(page, "from-input", "Ayala MRT Station");
        await visible(page.getByTestId(viewport.width < 768 ? "route-peek" : "route-card").first()).toBeVisible({ timeout: 60_000 });
        await visible(progress).toHaveCount(0);
        expect((await page.screenshot()).byteLength).toBeGreaterThan(1000);
      } finally { release(); await context.close(); }
    }, 120_000);
  }
}

it("leaves source evidence unchanged after all browser captures", async () => {
  // A rewrite invalidates every host acceptance receipt, even when the behavioral tests pass.
  // Include modification times so identical rewrites cannot silently pass this regression.
  expect(await evidenceSnapshot()).toEqual(evidenceBefore);
});
