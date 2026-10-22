// Capture landing, results, sun explainer, steps, navigate, and About at three sizes into app/shots/.
// Usage: node scripts/shots.mjs [--now=2026-10-22T09:00] [--day=Today] [--mode=rain] [--minute=1080] [--tag=night] [--base=http://localhost:5173]
//   [--sizes=1440x900,390x844] [--pages=landing,results]
// Poster mode writes the landing map stills to public/poster/ (PNG; convert to WebP after):
//   node scripts/shots.mjs --poster
// Without --base it builds the app and serves dist/ with vite preview (no dev reloads mid-run).
// It fails if any page scrolls sideways.
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "shots");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const ALL_VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, mobile: false },
  { name: "1920x1080", width: 1920, height: 1080, mobile: false },
  { name: "390x844", width: 390, height: 844, mobile: true },
];
const SIZES = arg("sizes")?.split(",");
const VIEWPORTS = SIZES ? ALL_VIEWPORTS.filter((v) => SIZES.includes(v.name)) : ALL_VIEWPORTS;
// Pages: landing, results, sun, steps, navigate, about. Default is all of them.
const PAGES = new Set(arg("pages")?.split(",") ?? ["landing", "results", "sun", "steps", "navigate", "about"]);
const FROM = arg("from") ?? "Ayala MRT Station";
const TO = arg("to") ?? "Greenbelt";
const DAY = arg("day") ?? "Tomorrow";
const MINUTE = Number(arg("minute") ?? 900);
const MODE = arg("mode") ?? "shade";
const TAG = arg("tag") ?? "";

let server = null;
let base = arg("base");
if (!base) {
  await build({ root, logLevel: "error" });
  server = await preview({ root, preview: { port: 5191, strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
}
// Default "now" is 09:00 on the first manifest date, so "Tomorrow" exists whatever the wall clock says.
const dates = JSON.parse(await readFile(path.join(root, "public/data/areas/metro-core/manifest.json"), "utf8")).dates;
const query = `?now=${arg("now") ?? `${dates[0]}T09:00`}`;

// Landing map stills with no UI on top: day and night, desktop (1280 wide) and phone (640 wide at 390 CSS px).
if (arg("poster") !== undefined || process.argv.includes("--poster")) {
  const dir = path.join(root, "public/poster");
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const shots = [
    { kind: "day", at: "10:00" },
    { kind: "night", at: "19:30" },
  ];
  const sizes = [
    { w: 1280, vp: { width: 1280, height: 860 }, scale: 1 },
    { w: 640, vp: { width: 390, height: 760 }, scale: 640 / 390 },
  ];
  for (const s of shots) {
    for (const z of sizes) {
      const ctx = await browser.newContext({ viewport: z.vp, deviceScaleFactor: z.scale });
      const page = await ctx.newPage();
      await page.goto(`${base}/?now=${dates[0]}T${s.at}&map=eager`);
      await page.waitForSelector('[data-testid="map"][data-idle="1"]', { timeout: 90000 });
      await page.waitForFunction(() => !document.querySelector('[data-testid="map-poster"]'), null, { timeout: 30000 });
      await page.addStyleTag({ content: '[data-testid="landing"],[data-testid="map-tone"],[data-testid="map-tone"]+div,main [role="status"]{visibility:hidden!important}' });
      await page.waitForTimeout(800);
      const file = path.join(dir, `${s.kind}-${z.w}.png`);
      await page.locator("main").screenshot({ path: file });
      console.log(`[poster] ${file}`);
      await ctx.close();
    }
  }
  await browser.close();
  await server?.httpServer.close();
  process.exit(0);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const problems = [];

async function idle(page) {
  try {
    await page.waitForSelector('[data-testid="map"][data-idle="1"]', { timeout: 60000 });
  } catch {
    problems.push(`${page.viewportSize().width}: map never went idle`);
  }
  await page.waitForTimeout(600);
}

async function shot(page, vp, name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`${vp.name} ${name}: page is ${overflow}px wider than the viewport`);
  const file = path.join(out, `${name}${TAG ? `-${TAG}` : ""}-${vp.name}.png`);
  await page.screenshot({ path: file });
  console.log(`[shot] ${file}${overflow > 0 ? ` OVERFLOW ${overflow}px` : ""}`);
}

async function pick(page, input, text) {
  await page.getByTestId(input).fill(text);
  const option = page.getByTestId("place-option").filter({ has: page.getByText(text, { exact: true }) }).first();
  await option.waitFor({ timeout: 15000 });
  await option.click();
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${vp.name}: page error ${e.message}`));
  page.on("console", (m) => m.type() === "error" && console.log(`[console ${vp.name}] ${m.text().slice(0, 200)}`));
  await page.goto(`${base}/${query}`);
  await idle(page);
  if (PAGES.has("landing")) await shot(page, vp, "01-landing");

  const pickBtn = page.getByTestId(MODE === "rain" ? "pick-rain" : "pick-shade");
  if (!(await pickBtn.isEnabled())) {
    problems.push(`${vp.name}: route data not loaded, stopping after landing`);
    await ctx.close();
    continue;
  }
  await pickBtn.click();
  await pick(page, "destination-input", TO);
  await pick(page, "from-input", FROM);
  await page.getByTestId("date-chip").click();
  await page.locator(`[data-testid="date-option"][data-label="${DAY}"]`).click();
  await page.getByTestId("hour-chip").click();
  await page.getByTestId(`hour-option-${MINUTE}`).click();
  await page.locator('[data-testid="route-card"], [data-testid="route-state"]').first().waitFor({ timeout: 30000 });
  await idle(page);
  if (PAGES.has("results")) await shot(page, vp, "02-results");
  if (PAGES.has("sun") && (await page.getByTestId("sun-chip").isVisible())) {
    await page.getByTestId("sun-chip").click();
    await shot(page, vp, "02b-sun");
    await page.getByTestId("sun-chip").click();
  }

  if (await page.getByTestId("route-state").isVisible()) {
    problems.push(`${vp.name}: router state ${await page.getByTestId("route-state").getAttribute("data-state")}`);
    await ctx.close();
    continue;
  }
  if (!PAGES.has("steps") && !PAGES.has("navigate") && !PAGES.has("about")) {
    await ctx.close();
    continue;
  }
  await page.getByTestId("show-steps").click();
  await idle(page);
  if (PAGES.has("steps")) await shot(page, vp, "03-steps");
  await page.getByTestId("steps-back").click();
  await page.getByTestId("navigate").click();
  await idle(page);
  if (PAGES.has("navigate")) await shot(page, vp, "04-navigate");
  await page.getByTestId("nav-close").click();
  await page.getByTestId("footer-sources").click();
  await page.getByTestId("about").waitFor();
  await page.waitForTimeout(400);
  if (PAGES.has("about")) await shot(page, vp, "05-about");
  await ctx.close();
}

await browser.close();
await server?.httpServer.close();
if (problems.length) {
  console.log(`[problems]\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("[done] no overflow, no page errors");
