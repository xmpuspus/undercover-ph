/// <reference types="node" />
import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect as visible, type Browser, type Page } from "@playwright/test";
import { beforeAll, afterAll, expect, it as vitestIt } from "vitest";
import type { Map as GLMap } from "maplibre-gl";
import { emitJogScreenshot, waitForJogFrame } from "./browserEvidence";
import { jogBrowserFiles } from "./browserBuild";
import { requestEvidence } from "./requestEvidence";
import type { RunRecord } from "./types";

// app-unit owns these regressions because the existing browser specs are protected.
// The production app and captures stay in memory. Verification must not rewrite source evidence.
const appRoot = fileURLToPath(new URL("../../../", import.meta.url));
const publicRoot = resolve(appRoot, "public"), evidence = fileURLToPath(new URL("./qa/", import.meta.url));
// The Vercel build runs the unit tests without a Playwright browser, so these skip there. CI installs Chromium in
// its deploy-build job, so they still run before main.
const READY = existsSync(chromium.executablePath()) && ["manifest.json", "jog.json"].every((f) => existsSync(resolve(publicRoot, "data/areas/metro-core", f)));
const it = vitestIt.skipIf(!READY);
const files = new Map<string, Buffer>();
let server: Server | undefined, browser: Browser | undefined, origin: string, date: string;
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
beforeAll(async () => {
  if (!READY) return;
  server = createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url!, "http://localhost").pathname).slice(1) || "index.html";
      const path = resolve(publicRoot, name);
      if (!path.startsWith(publicRoot + sep)) { res.writeHead(403).end(); return; }
      let body = files.get(name);
      if (!body) { try { body = await readFile(path); } catch { res.writeHead(404).end(); return; } }
      res.writeHead(200, { "Content-Type": types[extname(name)] ?? "application/octet-stream", "Content-Length": body.length, "Cache-Control": "no-store" });
      res.end(body);
    } catch { res.writeHead(400).end(); }
  });
  await new Promise<void>((done, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", done); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The jog browser regression server did not bind.");
  origin = `http://127.0.0.1:${address.port}`;
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    for (const [name, body] of await jogBrowserFiles(appRoot, resolve(evidence, "cache"))) files.set(name, body);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
  date = JSON.parse(await readFile(resolve(publicRoot, "data/areas/metro-core/manifest.json"), "utf8")).dates[0];
  browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
}, 120_000);
afterAll(async () => {
  await browser?.close(); server?.closeAllConnections();
  if (server?.listening) await new Promise<void>((done) => server!.close(() => done()));
});
async function pageAt(width = 390, dark = false, location?: { latitude: number; longitude: number }) {
  // Use the supported reduced-motion preference so camera flights finish at their intended
  // bounds without competing for animation frames on the shared host.
  const context = await browser!.newContext({ viewport: { width, height: width > 768 ? 1080 : 844 }, isMobile: width < 768, hasTouch: width < 768, reducedMotion: "reduce", serviceWorkers: "block", ...(location ? { geolocation: location, permissions: ["geolocation"] } : {}) });
  // Capture the real Map instance without changing its camera or rendering methods.
  await context.addInitScript(() => {
    let lib: typeof import("maplibre-gl");
    Object.defineProperty(window, "maplibregl", { configurable: true, get: () => lib, set: (value) => {
      lib = value;
      const NativeMap = lib.Map;
      lib.Map = class extends NativeMap {
        constructor(options: import("maplibre-gl").MapOptions) { super(options); (window as unknown as { jogTestMap: GLMap }).jogTestMap = this; }
      };
    } });
  });
  const page = await context.newPage();
  await page.route((url) => url.origin !== origin || url.pathname.endsWith(".pmtiles"), (r) => r.abort());
  await page.goto(`${origin}/?now=${date}T${dark ? "19:00" : "07:00"}`);
  await visible(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("pick-shade").click();
  return { context, page };
}
async function runFrom(page: Page) {
  await page.getByTestId("mode-run").click();
  await page.getByTestId("jog-start-input").fill("Ayala Triangle Gardens");
  await page.getByTestId("place-option").filter({ has: page.getByText("Ayala Triangle Gardens", { exact: true }) }).first().click();
  await visible(page.getByTestId("jog-card")).toHaveCount(3, { timeout: 60_000 });
}

it("keeps destination text when switching between walking modes", async () => {
  const { context, page } = await pageAt();
  try {
    await page.getByTestId("destination-input").fill("Green");
    await page.getByTestId("mode-rain").click();
    await visible(page.getByTestId("destination-input")).toHaveValue("Green");
    await page.getByTestId("mode-shade").click();
    await visible(page.getByTestId("destination-input")).toHaveValue("Green");
  } finally { await context.close(); }
}, 90_000);

it("finishes a walking trip when the first phone-location request times out", async () => {
  const { context, page } = await pageAt(390, false, { latitude: 14.54923, longitude: 121.02791 });
  try {
    await page.getByTestId("destination-input").fill("Greenbelt");
    await page.getByTestId("place-option").filter({ has: page.getByText("Greenbelt", { exact: true }) }).first().click();
    await page.evaluate(() => {
      const geo = navigator.geolocation, original = geo.getCurrentPosition.bind(geo);
      const trace = { requests: 0, fixes: 0 };
      (window as unknown as { jogTestLocation: typeof trace }).jogTestLocation = trace;
      Object.defineProperty(geo, "getCurrentPosition", { configurable: true, value: (ok: PositionCallback, fail: PositionErrorCallback, options: PositionOptions) => {
        if (++trace.requests === 1) {
          fail({ code: 3, message: "Position timed out", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        } else original((point) => { trace.fixes++; ok(point); }, fail, options);
      } });
    });
    await page.getByTestId("use-location").click();
    await visible.poll(() => page.evaluate(() => (window as unknown as { jogTestLocation: { requests: number; fixes: number } }).jogTestLocation), { timeout: 30_000 })
      .toEqual({ requests: 2, fixes: 1 });
    // A phone opens the compact sheet first. Follow the same expansion path as phone.spec.ts
    // before requiring the full card, which is intentionally absent from the compact view.
    await visible(page.getByTestId("route-peek")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("peek-summary").click();
    await visible(page.getByTestId("route-card").first()).toBeVisible({ timeout: 60_000 });
    await visible(page.getByTestId("trip-notice")).toHaveCount(0);
  } finally { await context.close(); }
}, 180_000);

it("keeps the current loops when the runner taps their start pin on the map", async () => {
  const { context, page } = await pageAt();
  try {
    await runFrom(page);
    const key = await page.getByTestId("jog-card").first().getAttribute("data-loop-key");
    await page.waitForTimeout(1200);
    await page.locator(".hb-pin-start").click();
    await visible(page.getByTestId("jog-start-input")).toHaveValue("Ayala Triangle Gardens");
    await page.waitForTimeout(500);
    await visible(page.getByTestId("jog-card").first()).toHaveAttribute("data-loop-key", key!);
  } finally { await context.close(); }
}, 90_000);

it("recovers through Other loops after the first worker emits an error", async () => {
  const { context, page } = await pageAt();
  try {
    await page.evaluate(() => {
      const RealWorker = window.Worker;
      let failed = false;
      window.Worker = new Proxy(RealWorker, { construct(target, args) {
        if (!failed && String(args[0]).includes("jogWorker")) {
          failed = true;
          const worker = { postMessage() {}, terminate() {}, onerror: null as ((e: ErrorEvent) => void) | null };
          setTimeout(() => worker.onerror?.(new ErrorEvent("error", { message: "Startup failed" })), 0);
          return worker;
        }
        return Reflect.construct(target, args);
      } });
    });
    await page.getByTestId("mode-run").click();
    await page.getByTestId("jog-start-input").fill("Ayala Triangle Gardens");
    await page.getByTestId("place-option").filter({ has: page.getByText("Ayala Triangle Gardens", { exact: true }) }).first().click();
    await visible(page.getByTestId("jog-panel")).toContainText("could not start", { timeout: 30_000 });
    await page.getByTestId("jog-again").click();
    await visible(page.getByTestId("jog-card")).toHaveCount(3, { timeout: 60_000 });
  } finally { await context.close(); }
}, 90_000);

it("uses a nearby main-network path for a location on Greenbelt's isolated basement piece", async () => {
  const { context, page } = await pageAt(390, false, { latitude: 14.5529988, longitude: 121.0214001 });
  try {
    await page.getByTestId("mode-run").click();
    await page.getByTestId("jog-use-location").click();
    await visible(page.getByTestId("jog-card")).toHaveCount(3, { timeout: 60_000 });
    expect(new URL(page.url()).hash).not.toMatch(/\d+\.\d{4,}/);
  } finally { await context.close(); }
}, 90_000);

it("keeps saved history out of request URLs, bodies and headers while finding other loops", async () => {
  const { context, page } = await pageAt();
  const requests: Promise<string>[] = [];
  context.on("request", (request) => { requests.push(requestEvidence(request)); });
  try {
    await page.evaluate((date) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("ucph-jog", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("runs", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction("runs", "readwrite");
        tx.objectStore("runs").put({ id: "private-history-sentinel", area: "metro-core", date, length_m: 1000,
          streets: [[988877766655, 1, 12102000, 1455000]] });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    }), date);
    await runFrom(page);
    await visible(page.getByTestId("jog-history-count")).toContainText("1");
    await page.getByTestId("jog-mark-run").first().click();
    await visible(page.getByTestId("jog-history-count")).toContainText("2");
    const saved = await page.evaluate(() => new Promise<RunRecord[]>((resolve, reject) => {
      const opening = indexedDB.open("ucph-jog", 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result, tx = db.transaction("runs", "readonly"), reading = tx.objectStore("runs").getAll();
        reading.onerror = () => { db.close(); reject(reading.error); };
        reading.onsuccess = () => { db.close(); resolve(reading.result); };
      };
    }));
    expect(saved).toHaveLength(2);
    expect(saved.flatMap((run) => run.streets)).not.toHaveLength(0);
    const old = await page.getByTestId("jog-card").first().getAttribute("data-loop-key");
    await page.getByTestId("jog-again").click();
    await visible(page.getByTestId("jog-card")).toHaveCount(3, { timeout: 60_000 });
    await visible(page.getByTestId("jog-card").first()).not.toHaveAttribute("data-loop-key", old!);
    const captured = (await Promise.all(requests)).join("\n");
    // Prove the listener observed the worker's request, as well as page requests.
    expect(captured).toContain("/jog.json");
    for (const run of saved) expect(captured).not.toContain(run.id);
    for (const way of new Set(saved.flatMap((run) => run.streets.map((point) => point[0])))) expect(captured).not.toContain(String(way));
  } finally { await context.close(); }
}, 180_000);

for (const width of [375, 1920]) for (const dark of [false, true]) it(`draws the loop and km marks above panels at ${width}px ${dark ? "night" : "day"}`, async () => {
  const { context, page } = await pageAt(width, dark);
  try {
    await runFrom(page);
    await waitForJogFrame(page);
    // Mode changes must remain tappable after the long list grows the desktop panel.
    if (width >= 768) for (const mode of ["mode-shade", "mode-rain", "mode-run"]) {
      await page.getByTestId(mode).click({ trial: true, timeout: 5000 });
    }
    const geometry = await page.evaluate(() => {
      const map = (window as unknown as { jogTestMap: GLMap }).jogTestMap;
      const rect = map.getContainer().getBoundingClientRect(), panel = document.querySelector('[data-testid="panel"]')!.getBoundingClientRect();
      const source = map.getSource("jog-km") as import("maplibre-gl").GeoJSONSource;
      const data = source.serialize().data as GeoJSON.FeatureCollection<GeoJSON.Point>;
      const points = data.features.map((f) => {
        const p = map.project(f.geometry.coordinates as [number, number]), x = p.x + rect.x, y = p.y + rect.y;
        const el = document.elementFromPoint(x, y);
        return { x, y, exposed: !!el && !el.closest('[data-testid="panel"]') && !el.closest('[data-testid="top-banner"]') };
      });
      const loading = [...document.querySelectorAll('p[role="status"]')].find((el) => el.textContent === "Loading 3D buildings...")?.getBoundingClientRect();
      const loadingOverlapsControls = !!loading && [...document.querySelectorAll('[data-testid="when-chip"], [data-testid="sun-chip"], [data-testid="heat-chip"]')].some((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && loading.left < box.right && loading.right > box.left && loading.top < box.bottom && loading.bottom > box.top;
      });
      return { points, panel: { x: panel.x, y: panel.y }, rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }, padding: map.getPadding(), features: map.queryRenderedFeatures({ layers: ["jog-line", "jog-km-dot", "jog-direction"] }).length, overflow: document.documentElement.scrollWidth - innerWidth, loadingOverlapsControls };
    });
    await emitJogScreenshot(page, `loop-${width}-${dark ? "night" : "day"}`);
    console.log("JOG_RENDER", width, dark, JSON.stringify(geometry));
    expect(geometry.features).toBeGreaterThan(0);
    expect(geometry.points.length).toBeGreaterThanOrEqual(4);
    await visible(page.locator(".jog-km-label")).toHaveCount(geometry.points.length);
    await visible(page.locator(".jog-km-label").first()).toHaveText("1");
    expect(geometry.overflow).toBe(0);
    expect(geometry.loadingOverlapsControls).toBe(false);
    for (const p of geometry.points) {
      expect(p.exposed).toBe(true);
      expect(p.x).toBeGreaterThan(geometry.rect.x + 10); expect(p.x).toBeLessThan(geometry.rect.right - 10);
      expect(p.y).toBeGreaterThan(geometry.rect.y + 10); expect(p.y).toBeLessThan(geometry.rect.bottom - 10);
      if (width < 768) expect(p.y).toBeLessThan(geometry.panel.y - 10);
      else expect(p.x).toBeGreaterThan(geometry.panel.x + 368 + 10);
    }
  } finally { await context.close(); }
}, 180_000);

it("opens a large corrupt history without holding up the run controls", async () => {
  const { context, page } = await pageAt();
  try {
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("ucph-jog", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("runs", { keyPath: "id" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction("runs", "readwrite");
        const streets = Array.from({ length: 100_000 }, () => [7, 1, 12100000, 1450000]);
        streets[streets.length - 1] = [-1, 1, 0, 0];
        for (let i = 0; i < 30; i++) tx.objectStore("runs").put({ id: `corrupt-${i}`, area: "test", date: "2026-10-24", length_m: 5000, streets });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    }));
    await runFrom(page);
    await visible(page.getByTestId("jog-history-count")).toContainText("30");
    await visible(page.getByTestId("jog-panel")).toContainText("Some saved runs could not be read");
    await page.getByTestId("jog-clear").click();
    await visible(page.getByTestId("jog-history-count")).toContainText("0");
  } finally { await context.close(); }
}, 120_000);
