// Record the README demo GIFs and the share images from the running app.
// Usage: pnpm demo:record   (pnpm build, then this script)
//   node scripts/demo-record.mjs --only=walkthrough,rain    record some clips or images (walkthrough, walkthrough-tall, sun-direction, steps-phone, rain, run-loop, sun-direction-phone, rain-phone, og, social)
//   node scripts/demo-record.mjs --only=run-loop --base=https://undercover.ph --now=2026-10-25T09:00
//                                                    record Run a loop on the live site; --now takes the live first data date
//   node scripts/demo-record.mjs --encode-only       re-encode the saved frames in tmp/demo-frames/_video without recording
//   --base=http://localhost:5173 drives a running server instead of serving dist/
//   --swiftshader uses software WebGL when no GPU is available (choppier map motion)
// Playwright drives Chromium and saves Chrome's screencast as lossless PNG frames with their paint times.
// Playwright's recordVideo uses the same screencast but re-encodes it as VP8 at a fixed 1 Mbps. On this 3D map
// that shimmer made every GIF frame redraw: an early hero GIF came out at 7.2 to 7.5 MB against a 5 MB budget.
// ffmpeg cuts the frames to the marked beats, holds the last frame, and converts them with a two-pass palette
// (palettegen, then paletteuse with sierra2_4a). gifsicle -O3 finishes each GIF.
// "now" is pinned to 09:00 on the first manifest date, so "Tomorrow" exists in the data.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";
import { preview } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "..");
const outDir = path.join(repo, "docs", "demo");
const work = path.join(repo, "tmp", "demo-frames", "_video");
const framesDir = path.join(repo, "tmp", "demo-frames");
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const flag = (k) => process.argv.includes(`--${k}`);
const only = arg("only")?.split(",");
const want = (name) => !only || only.includes(name);

const HOLD_S = 1.5;
const FROM = "Ayala MRT Station";
const TO = "Greenbelt";
const dates = JSON.parse(readFileSync(path.join(root, "public/data/areas/metro-core/manifest.json"), "utf8")).dates;
// --now=YYYY-MM-DDTHH:MM when --base is the live site, whose first data date can differ from the local one.
const NOW = arg("now") ?? `${dates[0]}T09:00`;

// Try each setting until the GIF fits its budget. The sun-direction clip relights the whole map at every
// half-hour step, about 17 full frames of roughly 250 KB each, so it needs the 128-color steps.
const LADDER = [
  { fps: 10, colors: 256 },
  { fps: 8, colors: 256 },
  { fps: 6, colors: 256 },
  { fps: 6, colors: 128 },
  { fps: 4, colors: 128 },
  { fps: 3, colors: 128 },
];

const DESKTOP = { width: 1280, height: 800, mobile: false };
// 9:16 for the phone clips, which fill the whole frame with the app (see openCine).
const CINE = { width: 1080, height: 1920, mobile: false };
// 1600 x 900 CSS pixels at deviceScaleFactor 1.2. Chrome's screencast still sends 1600 x 900 frames, so the
// 1920 x 1080 MP4 is a 1.2x upscale; the larger CSS size keeps the captions and map labels big.
const WIDE = { width: 1600, height: 900, mobile: false, scale: 1.2 };

const CLIPS = [
  { name: "walkthrough", vp: WIDE, width: 720, maxMB: 9.5, speed: 1.5, flow: walkthrough, mp4: { width: 1920 } },
  { name: "walkthrough-tall", vp: CINE, mp4: { width: 1080, speed: 1.2 }, gif: false, flow: walkthroughTall, story: "walkthrough" },
  { name: "sun-direction", vp: DESKTOP, width: 900, maxMB: 6.5, flow: sunDirection },
  { name: "steps-phone", vp: CINE, width: 400, maxMB: 6, dither: "none", lossy: 80, flow: stepsPhone, story: "steps-phone" },
  { name: "rain", vp: DESKTOP, width: 900, maxMB: 4, flow: rain },
  { name: "run-loop", vp: CINE, width: 450, maxMB: 9.5, speed: 1.4, dither: "none", lossy: 80, flow: runLoop, mp4: { width: 1080, speed: 1.2 }, story: "run-loop" },
  // Phone takes of the two desktop clips, for Instagram Stories only.
  { name: "sun-direction-phone", vp: CINE, gif: false, flow: sunPhone, story: "sun-direction" },
  { name: "rain-phone", vp: CINE, gif: false, flow: rainPhone, story: "rain" },
];

const SHARES = [
  { name: "og", vp: { width: 1200, height: 630, mobile: false }, out: path.join(root, "public", "og.png"), maxKB: 600 },
  { name: "social", vp: { width: 1280, height: 640, mobile: false }, out: path.join(outDir, "social-preview.png"), maxKB: 1000 },
];

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

// Map idle, route data loaded, and the 3D buildings in, so frame one is a full map.
async function ready(page) {
  await page.waitForSelector('[data-testid="map"][data-idle="1"]', { timeout: 90000 });
  await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some((e) => e.textContent?.includes("Loading 3D")), null, {
    timeout: 90000,
  });
}

async function idle(page, settle = 400) {
  await page.waitForTimeout(150);
  await page.waitForSelector('[data-testid="map"][data-idle="1"]', { timeout: 60000 });
  await page.waitForTimeout(settle);
}

async function pick(page, input, text, typed) {
  const box = page.getByTestId(input);
  if (typed) {
    await box.click();
    await box.pressSequentially(text, { delay: 55 });
  } else {
    await box.fill(text);
  }
  const option = page.getByTestId("place-option").filter({ has: page.getByText(text, { exact: true }) }).first();
  await option.waitFor({ timeout: 15000 });
  if (typed) await page.waitForTimeout(450);
  await option.click();
}

async function chooseTime(page, day, minute, slow) {
  // Phones have one "when" chip whose panel holds the dates and the hours. Wait for one of the two layouts,
  // so a check made before the chips render does not pick the wrong one.
  await page.getByTestId("when-chip").or(page.getByTestId("date-chip")).first().waitFor({ timeout: 30000 });
  if (await page.getByTestId("when-chip").isVisible()) {
    await page.getByTestId("when-chip").click();
    if (slow) await page.waitForTimeout(650);
    await page.locator(`[data-testid="date-option"][data-label="${day}"]`).click();
    if (slow) await page.waitForTimeout(450);
    await page.getByTestId(`hour-option-${minute}`).click();
    return;
  }
  await page.getByTestId("date-chip").click();
  if (slow) await page.waitForTimeout(650);
  await page.locator(`[data-testid="date-option"][data-label="${day}"]`).click();
  if (slow) await page.waitForTimeout(450);
  await page.getByTestId("hour-chip").click();
  if (slow) await page.waitForTimeout(750);
  await page.getByTestId(`hour-option-${minute}`).click();
}

// Plan Ayala MRT Station to Greenbelt, tomorrow at 3 PM. Slow mode types and pauses so a viewer can follow.
async function planTrip(page, slow) {
  await page.getByTestId("pick-shade").click();
  if (slow) await page.waitForTimeout(900);
  await pick(page, "destination-input", TO, slow);
  if (slow) await page.waitForTimeout(700);
  await pick(page, "from-input", FROM, slow);
  if (slow) await page.waitForTimeout(900);
  await chooseTime(page, "Tomorrow", 900, slow);
  await page.locator('[data-testid="route-card"], [data-testid="route-peek"], [data-testid="route-state"]').first().waitFor({ timeout: 30000 });
  if (await page.getByTestId("route-state").isVisible()) {
    const s = page.getByTestId("route-state");
    throw new Error(`router state ${await s.getAttribute("data-state")}: ${(await s.innerText()).replace(/\s+/g, " ")}`);
  }
  await idle(page, 600);
}

async function shadowsOn(page) {
  const t = page.getByTestId("shadows-toggle");
  await t.waitFor({ timeout: 15000 });
  if ((await t.getAttribute("aria-checked")) !== "true") await t.click();
}

// What the card says, for the alt text and the log.
async function readCard(page) {
  const text = async (id) => ((await page.getByTestId(id).first().isVisible().catch(() => false)) ? (await page.getByTestId(id).first().innerText()).replace(/\s+/g, " ").trim() : null);
  return {
    hour: (await text("hour-chip")) ?? (await text("when-chip")),
    peek: await text("route-peek"),
    sun: await text("sun-chip"),
    summary: await text("route-summary"),
    sunMinutes: await text("sun-minutes"),
    split: await text("cover-split"),
    tabs: await page.getByTestId("route-tab").allInnerTexts(),
    callouts: (await page.getByTestId("route-callout").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()),
  };
}

async function sunDirection(page, m) {
  await page.goto(`${m.base}/?now=${NOW}&map=eager`);
  await ready(page);
  await planTrip(page, false);
  await shadowsOn(page);
  // One play and stop fetches the day's shadow images, so the recorded run does not wait on them.
  await page.getByTestId("scrubber").click();
  await page.waitForTimeout(250);
  await page.getByTestId("scrubber").click();
  await page.getByTestId("hour-chip").click();
  await page.getByTestId("hour-option-900").click();
  await page.waitForTimeout(2500);
  await idle(page, 500);
  m.note("start", await readCard(page));
  m.mark("start");
  await page.waitForTimeout(1200);
  await page.getByTestId("hour-chip").click();
  await page.waitForTimeout(800);
  await page.getByTestId("hour-option-480").click();
  await page.waitForTimeout(1300);
  m.note("8am", await readCard(page));
  await page.getByTestId("scrubber").click();
  const seen = [];
  const deadline = Date.now() + 30000;
  for (;;) {
    const hour = (await page.getByTestId("hour-chip").innerText()).trim();
    if (seen.at(-1) !== hour) {
      seen.push(hour);
      m.note(`play-${hour}`, { sun: (await page.getByTestId("sun-chip").innerText()).trim() });
    }
    if (hour === "4 PM") break;
    if (Date.now() > deadline || (await page.getByTestId("scrubber").getAttribute("aria-pressed")) === "false") {
      throw new Error(`the scrubber stopped before 4 PM; saw ${seen.join(", ")}`);
    }
    await page.waitForTimeout(50);
  }
  await page.getByTestId("scrubber").click();
  await page.waitForTimeout(500);
  m.note("4pm", await readCard(page));
  m.mark("end");
}

// The walkthrough draws a caption bar and a pointer dot over the real app, so a viewer sees what to tap and why.
// The layer sits in the page only while this script records. The app ships without it.
const OVERLAY_CSS = `
#wt-cap{position:fixed;left:50%;bottom:64px;transform:translate(-50%,8px);z-index:2147483647;pointer-events:none;
  display:flex;align-items:center;gap:18px;max-width:1100px;white-space:nowrap;padding:16px 28px;border-radius:18px;
  background:rgba(15,23,42,.92);color:#fff;font:500 34px/1.25 Jost,"Jost Fallback",system-ui,sans-serif;
  box-shadow:0 10px 30px rgba(15,23,42,.3);opacity:0;transition:opacity .35s,transform .35s}
#wt-cap.on{opacity:1;transform:translate(-50%,0)}
#wt-cap b{flex:none;display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:#2563EB;font-size:27px}
#wt-dot{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:30px;margin:-15px 0 0 -15px;
  border-radius:50%;background:rgba(15,23,42,.35);border:3px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.4);
  opacity:0;transition:left .45s cubic-bezier(.3,.7,.3,1),top .45s cubic-bezier(.3,.7,.3,1),opacity .3s}
#wt-dot.on{opacity:1}
#wt-dot.tap{animation:wt-tap .35s}
@keyframes wt-tap{50%{transform:scale(.7);background:rgba(37,99,235,.6)}}
.maplibregl-canvas:focus,.maplibregl-canvas:focus-visible{outline:none!important}`;

async function addOverlay(page) {
  await page.addStyleTag({ content: OVERLAY_CSS });
  await page.evaluate(() => {
    for (const id of ["wt-cap", "wt-dot"]) {
      const el = document.createElement("div");
      el.id = id;
      document.body.appendChild(el);
    }
  });
}

async function caption(page, step, text) {
  await page.evaluate(([n, t]) => {
    const el = document.getElementById("wt-cap");
    el.classList.remove("on");
    setTimeout(() => {
      el.replaceChildren();
      if (n) {
        const b = document.createElement("b");
        b.textContent = String(n);
        el.append(b);
      }
      el.append(t);
      el.classList.add("on");
    }, 250);
  }, [step, text]);
  await page.waitForTimeout(600);
}

async function pointAt(page, locator) {
  await locator.waitFor({ timeout: 30000 });
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([px, py]) => {
    const d = document.getElementById("wt-dot");
    d.style.left = `${px}px`;
    d.style.top = `${py}px`;
    d.classList.add("on");
  }, [x, y]);
  await page.waitForTimeout(550);
  return { x, y };
}

async function tap(page, locator, after = 500) {
  const { x, y } = await pointAt(page, locator);
  await page.evaluate(() => {
    const d = document.getElementById("wt-dot");
    d.classList.remove("tap");
    void d.offsetWidth;
    d.classList.add("tap");
  });
  await page.mouse.click(x, y);
  await page.waitForTimeout(after);
  await hideDot(page);
}

// Zoom out and back once before the take, so the low-zoom tiles are cached and the closing zoom-out never shows
// an empty map while tiles load.
async function cacheZoomOut(page, canvas, settle) {
  await canvas.evaluate((c) => {
    c.style.outline = "none";
    c.focus();
  });
  for (const key of ["Minus", "Equal"]) {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(450);
    }
    await settle();
    await page.waitForTimeout(800);
  }
  await canvas.evaluate((c) => c.blur());
}

async function hideDot(page) {
  await page.evaluate(() => document.getElementById("wt-dot").classList.remove("on"));
}

async function typePick(page, input, text) {
  await tap(page, page.getByTestId(input), 250);
  await page.getByTestId(input).pressSequentially(text, { delay: 70 });
  await page.waitForTimeout(500);
  await tap(page, page.getByTestId("place-option").filter({ has: page.getByText(text, { exact: true }) }).first(), 700);
}

async function walkthrough(page, m) {
  await page.goto(`${m.base}/?now=${NOW}&map=eager`);
  await ready(page);
  await addOverlay(page);
  await cacheZoomOut(page, page.locator(".maplibregl-canvas"), () => idle(page, 300));
  m.mark("start");
  await caption(page, null, "undercover.ph plans walking routes in the shade");
  await page.waitForTimeout(4200);

  await caption(page, 1, "Tap Shaded for a walk in the shade");
  await page.waitForTimeout(2200);
  await tap(page, page.getByTestId("pick-shade"), 900);

  await caption(page, 2, "Type where you are going");
  await typePick(page, "destination-input", TO);
  await caption(page, 3, "Type where you start, or use your location");
  await typePick(page, "from-input", FROM);

  await caption(page, 4, "Pick the time you leave");
  await tap(page, page.getByTestId("date-chip"), 500);
  await tap(page, page.locator('[data-testid="date-option"][data-label="Tomorrow"]'), 400);
  await tap(page, page.getByTestId("hour-chip"), 500);
  await tap(page, page.getByTestId("hour-option-900"), 300);
  await hideDot(page);
  await page.getByTestId("route-card").waitFor({ timeout: 30000 });
  await idle(page, 300);
  // Shadows start on at desktop width. Tap the switch only if they are off.
  if ((await page.getByTestId("shadows-toggle").getAttribute("aria-checked")) !== "true") await tap(page, page.getByTestId("shadows-toggle"), 300);
  await idle(page, 300);
  m.note("results", await readCard(page));

  await caption(page, 5, "The card compares the routes by time in the sun");
  await page.waitForTimeout(1800);
  await tap(page, page.getByTestId("route-tab").filter({ hasText: "Shortest" }), 1500);
  await tap(page, page.getByTestId("route-tab").filter({ hasText: "Recommended" }), 700);

  await caption(page, 6, "The bar shows what covers each part of the route");
  const parts = page.getByTestId("ribbon-part");
  const n = await parts.count();
  for (const i of [Math.floor(n / 4), Math.floor((3 * n) / 4)]) {
    const { x, y } = await pointAt(page, parts.nth(i));
    await page.mouse.move(x, y);
    await page.waitForTimeout(1300);
  }
  await page.mouse.move(800, 450);

  await caption(page, 7, "Tap play to see the shadows move through the day");
  await tap(page, page.getByTestId("hour-chip"), 400);
  await tap(page, page.getByTestId("hour-option-540"), 600);
  await idle(page, 200);
  await tap(page, page.getByTestId("scrubber"), 200);
  const stop = Date.now() + 15000;
  while ((await page.getByTestId("hour-chip").innerText()).trim() !== "1 PM" && Date.now() < stop) await page.waitForTimeout(100);
  await tap(page, page.getByTestId("scrubber"), 600);
  m.note("after-play", await readCard(page));
  await tap(page, page.getByTestId("hour-chip"), 400);
  await tap(page, page.getByTestId("hour-option-900"), 400);
  await hideDot(page);
  await idle(page, 300);

  await caption(page, 8, "Each step gives the side of the street to walk on");
  await tap(page, page.getByTestId("show-steps"), 1500);
  const list = page.getByTestId("steps");
  const lb = await pointAt(page, list);
  await page.mouse.move(lb.x, lb.y);
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(500);
  m.note("steps", { count: await page.getByTestId("step-item").count() });
  await tap(page, page.getByTestId("steps-back"), 600);

  await caption(page, 9, "Navigate shows one turn at a time");
  await tap(page, page.getByTestId("navigate"), 1500);
  await tap(page, page.getByTestId("next-step"), 1300);
  await hideDot(page);
  m.note("navigate", { turn: (await page.getByTestId("turn-text").innerText()).replace(/\s+/g, " ").trim() });
  await tap(page, page.getByTestId("nav-close"), 900);
  await hideDot(page);

  await caption(page, 10, "If it rains, tap Sheltered");
  await tap(page, page.getByTestId("goal-dry"), 300);
  await idle(page, 300);
  m.note("rain", await readCard(page));
  await page.waitForTimeout(2400);

  await caption(page, 11, "undercover.ph covers 67 areas in the Philippines");
  await hideDot(page);
  // The map's own keyboard zoom: a wheel over a route label or marker never reaches the map.
  const canvas = page.locator(".maplibregl-canvas");
  const before = await page.screenshot({ clip: { x: 300, y: 120, width: 1200, height: 560 } });
  await canvas.focus();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Minus");
    await page.waitForTimeout(650);
  }
  await idle(page, 900);
  const after = await page.screenshot({ clip: { x: 300, y: 120, width: 1200, height: 560 } });
  if (before.equals(after)) throw new Error("the zoom-out did not move the map");

  await caption(page, null, "undercover.ph is free and needs no sign-up");
  await page.waitForTimeout(3000);
  m.mark("end");
}

// Phone clips fill a 9:16 frame with the app, with no border and no background. The app runs at 390 x 694 CSS
// pixels, about a phone browser with its toolbars, zoomed 2.77 times inside a 1080 x 1920 page so it renders
// sharp. A camera layer zooms in on each tap and on the lines that matter, then eases back out. The recorder
// moves the map camera itself for the 3D shots, because the phone layout fits each route flat and at once.
// Captions stay 290 px from the top and 380 px from the bottom, inside the area that Instagram Stories leaves clear.
const CINE_W = 390;
const CZ = CINE.width / CINE_W;
const CINE_H = Math.ceil(CINE.height / CZ);

function cineHost(base) {
  return `<!doctype html><html><head><style>
html,body{margin:0;width:${CINE.width}px;height:${CINE.height}px;overflow:hidden;background:#fff}
#stage{position:fixed;left:0;top:0;width:${CINE.width}px;height:${CINE.height}px;overflow:clip}
#cam{position:absolute;left:0;top:0;width:${CINE.width}px;height:${CINE.height}px;transform-origin:0 0;transition:transform .85s cubic-bezier(.45,0,.2,1)}
#ph{position:absolute;left:0;top:0;width:${CINE_W}px;height:${CINE_H}px;border:0;zoom:${CZ}}
#dot{position:absolute;left:0;top:0;z-index:9;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
  background:rgba(15,23,42,.3);border:4px solid #fff;box-shadow:0 2px 10px rgba(15,23,42,.45);opacity:0;transition:opacity .25s}
#dot.on{opacity:1}
#dot.tap{animation:tap .35s}
@keyframes tap{50%{transform:scale(.7);background:rgba(37,99,235,.6)}}
#cap{position:absolute;left:50%;z-index:10;width:max-content;max-width:940px;padding:20px 34px;border-radius:28px;box-sizing:border-box;
  background:rgba(15,23,42,.88);color:#fff;font:600 50px/1.18 "Avenir Next",system-ui,sans-serif;text-align:center;
  box-shadow:0 12px 36px rgba(15,23,42,.35);transform:translate(-50%,12px);opacity:0;transition:opacity .3s,transform .3s}
#cap.on{opacity:1;transform:translate(-50%,0)}
#cap.top{top:290px}
#cap.bottom{bottom:380px}
</style></head><body><div id="stage"><div id="cam"><iframe id="ph" src="${base}/?now=${NOW}&map=eager" allow="geolocation"></iframe>
<div id="dot"></div></div><div id="cap"></div></div></body></html>`;
}

// scrollIntoView inside the frame scrolls the frame and the page that holds it, and overflow on the root still lets the
// viewport scroll, so a zoom slid the captions out of view. The fixed #stage clips instead, and cannot scroll.

// The live site sends X-Frame-Options: DENY and frame-ancestors 'none', so a frame of it stays empty. The recorder
// drops those two rules from the app's own page, for this browser only. The page that holds the frame comes from
// the app's origin too: under about:blank, IndexedDB in the frame never opens, so Mark as run cannot save.
async function openCine(page, base) {
  const origin = new URL(base).origin;
  const ctx = page.context();
  // Keep a handle on the map, as the phone tests do, so the recorder can move its camera.
  await ctx.addInitScript(() => {
    let lib;
    Object.defineProperty(window, "maplibregl", {
      configurable: true,
      get: () => lib,
      set: (value) => {
        lib = value;
        const Native = value.Map;
        value.Map = class extends Native {
          constructor(o) {
            super(o);
            window.qaMap = this;
          }
        };
      },
    });
  });
  await ctx.route((u) => u.origin === origin && u.pathname === "/", async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    delete headers["x-frame-options"];
    if (headers["content-security-policy"]) headers["content-security-policy"] = headers["content-security-policy"].replace(/frame-ancestors[^;]*;?\s*/, "");
    await route.fulfill({ response: res, headers });
  });
  await page.route(`${origin}/__demo-host`, (route) => route.fulfill({ contentType: "text/html", body: cineHost(base) }));
  await page.goto(`${origin}/__demo-host`);
  const f = page.frameLocator("#ph");
  await f.locator('[data-testid="map"][data-idle="1"]').waitFor({ timeout: 90000 });
  return cine(page, f, page.frames().find((fr) => fr !== page.mainFrame()));
}

function cine(page, f, app) {
  const W = CINE.width;
  const H = CINE.height;
  const idle = async (settle = 300) => {
    await page.waitForTimeout(150);
    await f.locator('[data-testid="map"][data-idle="1"]').waitFor({ timeout: 60000 });
    await page.waitForTimeout(settle);
  };
  // The element's box in camera pixels, after it scrolls into view inside its panel.
  const box = async (loc) => {
    await loc.waitFor({ timeout: 30000 });
    const b = await loc.evaluate((el) => {
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    return { x: (b.x + b.w / 2) * CZ, y: (b.y + b.h / 2) * CZ, top: b.y * CZ, w: b.w * CZ };
  };
  // The scale never pushes the target's sides out of the frame. Text in the full-screen app is already large, so a
  // target that would get less than 1.08x stays at 1x: cards and lists never zoom, small controls do.
  const fit = (b, s) => {
    const k = Math.min(s, (0.94 * W) / b.w);
    return k < 1.08 ? 1 : k;
  };
  // Scale s about the frame, with point (x, y) moved to the middle column at ay of the height. The frame always
  // stays inside the app, so no zoom shows an edge.
  const set = async (s, x, y, ay, ms) => {
    const tx = Math.min(0, Math.max(W - W * s, W / 2 - x * s));
    const ty = Math.min(0, Math.max(H - H * s, H * ay - y * s));
    await page.evaluate(([a, b, c, d]) => {
      const el = document.getElementById("cam");
      el.style.transitionDuration = `${d}ms`;
      el.style.transform = `translate(${a}px,${b}px) scale(${c})`;
    }, [tx, ty, s, ms]);
    await page.waitForTimeout(ms + 60);
  };
  const tap = async (loc, after = 450) => {
    const b = await box(loc);
    await page.evaluate(([x, y]) => {
      const d = document.getElementById("dot");
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      d.classList.remove("tap");
      d.classList.add("on");
      void d.offsetWidth;
      d.classList.add("tap");
    }, [b.x, b.y]);
    await page.waitForTimeout(380);
    await loc.evaluate((el) => el.click());
    await page.waitForTimeout(after);
    await page.evaluate(() => document.getElementById("dot").classList.remove("on"));
  };
  return {
    f,
    idle,
    tap,
    // left pins the frame to the app's left edge, for rows whose text starts there.
    zoom: async (loc, s, ay = 0.5, ms = 650, left = false) => {
      const b = await box(loc);
      await set(fit(b, s), left ? 0 : b.x, b.y, ay, ms);
    },
    // For a card or a list: its top edge goes to ay, so its first lines fill the frame.
    zoomTop: async (loc, s, ay = 0.3, ms = 650) => {
      const b = await box(loc);
      await set(fit(b, s), b.x, b.top, ay, ms);
    },
    wide: (ms = 650) => set(1, 0, 0, 0, ms),
    caption: async (text, pos = "top") => {
      await page.evaluate(([t, p]) => {
        const el = document.getElementById("cap");
        el.classList.remove("on");
        if (t) {
          setTimeout(() => {
            el.textContent = t;
            el.className = p;
            void el.offsetWidth;
            el.classList.add("on");
          }, 260);
        }
      }, [text, pos]);
      await page.waitForTimeout(600);
    },
    type: async (input, text) => {
      await tap(f.getByTestId(input), 250);
      await f.getByTestId(input).pressSequentially(text, { delay: 65 });
      await page.waitForTimeout(450);
      await tap(f.getByTestId("place-option").filter({ has: f.getByText(text, { exact: true }) }).first(), 600);
    },
    // An eased map camera move, relative to where the map is: bearing and zoom add, pitch is absolute.
    map: (o) =>
      app.evaluate(
        (o) =>
          new Promise((done) => {
            const m = window.qaMap;
            if (!m) return done("no map");
            const to = { duration: o.ms, easing: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2) };
            if (o.bearing != null) to.bearing = m.getBearing() + o.bearing;
            if (o.pitch != null) to.pitch = o.pitch;
            if (o.zoom != null) to.zoom = m.getZoom() + o.zoom;
            if (o.jump) {
              m.jumpTo(to);
              return done("ok");
            }
            m.once("moveend", () => done("ok"));
            m.easeTo(to);
          }),
        o,
      ),
    // Smooth scroll of the step list, which scrolls inside its own <ol>.
    scrollSteps: (ms, max = 700) =>
      f.locator('[data-testid="steps"] ol').evaluate(
        (ol, [d, cap]) =>
          new Promise((done) => {
            const end = Math.min(ol.scrollHeight - ol.clientHeight, cap);
            const t0 = performance.now();
            const step = (now) => {
              const k = Math.min(1, (now - t0) / d);
              ol.scrollTop = end * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
              if (k < 1) requestAnimationFrame(step);
              else done();
            };
            requestAnimationFrame(step);
          }),
        [ms, max],
      ),
  };
}

const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

// Plan Ayala MRT Station to Greenbelt, tomorrow at 3 PM unless another minute is given, at full speed before the
// take starts.
// Playwright's own clicks miss inside the zoomed frame, so each click runs in the page.
const press = (loc) => loc.evaluate((el) => el.click());

async function cinePlan(c, minute = 900) {
  const f = c.f;
  await press(f.getByTestId("pick-shade"));
  for (const [input, text] of [["destination-input", TO], ["from-input", FROM]]) {
    await f.getByTestId(input).fill(text);
    await press(f.getByTestId("place-option").filter({ has: f.getByText(text, { exact: true }) }).first());
  }
  await press(f.getByTestId("when-chip"));
  await press(f.locator('[data-testid="date-option"][data-label="Tomorrow"]'));
  await press(f.getByTestId(`hour-option-${minute}`));
  await f.locator('[data-testid="route-peek"], [data-testid="route-state"]').first().waitFor({ timeout: 30000 });
  if (await f.getByTestId("route-state").isVisible()) throw new Error(`router state: ${await flat(f.getByTestId("route-state"))}`);
  await c.idle(600);
}

async function stepsPhone(page, m) {
  const c = await openCine(page, m.base);
  const f = c.f;
  await cinePlan(c);
  m.note("results", { peek: await flat(f.getByTestId("route-peek")) });
  m.mark("start");
  await c.caption("The card shows how much of the walk is in the shade");
  await c.zoom(f.getByTestId("route-peek"), 1.5, 0.62);
  await page.waitForTimeout(1500);
  await c.tap(f.getByTestId("peek-summary"), 700);
  await c.zoomTop(f.getByTestId("route-card"), 1.4, 0.32);
  await page.waitForTimeout(1800);
  await c.wide();
  await c.tap(f.getByTestId("sheet-collapse"), 500);

  await c.caption("Each step gives the side of the street to walk on");
  await c.zoom(f.getByTestId("peek-steps"), 1.6, 0.62);
  await c.tap(f.getByTestId("peek-steps"), 500);
  await c.wide();
  m.note("steps", {
    count: await f.getByTestId("step-item").count(),
    items: (await f.getByTestId("step-item").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).slice(0, 4),
  });
  await page.waitForTimeout(1300);
  await c.scrollSteps(3600);
  await page.waitForTimeout(900);
  await c.wide();
  await c.tap(f.getByTestId("steps-back"), 500);

  await c.caption("Navigate shows one turn at a time");
  await c.zoom(f.getByTestId("peek-navigate"), 1.6, 0.62);
  await c.tap(f.getByTestId("peek-navigate"), 500);
  await c.wide();
  m.note("navigate", { turn: await flat(f.getByTestId("turn-text")) });
  await page.waitForTimeout(1300);
  await c.zoom(f.getByTestId("next-step"), 1.6, 0.6);
  await c.tap(f.getByTestId("next-step"), 1000);
  await c.wide();
  await page.waitForTimeout(600);
  m.mark("end");
}

async function walkthroughTall(page, m) {
  const c = await openCine(page, m.base);
  const f = c.f;
  // Zoom out and back once, so the closing zoom-out never shows an empty map while tiles load.
  await c.map({ zoom: -4.5, jump: true });
  await c.idle(800);
  await c.map({ zoom: 4.5, jump: true });
  await c.idle(500);
  m.mark("start");
  await c.caption("undercover.ph plans walking routes in the shade");
  await page.waitForTimeout(1500);

  await c.caption("Tap Shaded for a walk in the shade");
  await c.zoom(f.getByTestId("pick-shade"), 1.7, 0.55);
  await c.tap(f.getByTestId("pick-shade"), 700);
  await c.caption("Type where you are going");
  await c.zoom(f.getByTestId("destination-input"), 1.5, 0.45, 650, true);
  await c.type("destination-input", TO);
  await c.caption("Type where you start");
  await c.zoom(f.getByTestId("from-input"), 1.5, 0.45, 650, true);
  await c.type("from-input", FROM);

  await c.caption("Pick the time you leave", "bottom");
  await c.zoom(f.getByTestId("when-chip"), 1.9, 0.28);
  await c.tap(f.getByTestId("when-chip"), 450);
  await c.tap(f.locator('[data-testid="date-option"][data-label="Tomorrow"]'), 400);
  await c.tap(f.getByTestId("hour-option-900"), 300);
  await c.wide();
  await f.getByTestId("route-peek").waitFor({ timeout: 30000 });
  await c.idle(400);
  m.note("results", { peek: await flat(f.getByTestId("route-peek")) });

  await c.caption("The map shows the shade of buildings and trees");
  await c.map({ pitch: 58, bearing: 40, zoom: -0.25, ms: 4800 });

  await c.caption("The card compares the routes by time in the sun");
  await c.tap(f.getByTestId("peek-summary"), 800);
  await c.zoomTop(f.getByTestId("route-card"), 1.4, 0.3);
  await c.tap(f.getByTestId("route-tab").filter({ hasText: "Shortest" }), 1400);
  await c.tap(f.getByTestId("route-tab").filter({ hasText: "Recommended" }), 700);

  await c.caption("The bar shows what covers each part of the route");
  const parts = f.getByTestId("ribbon-part");
  const n = await parts.count();
  await c.zoom(parts.nth(Math.floor(n / 2)), 1.3, 0.5);
  // The bar picks a stretch on pointer move, so each part gets a move, not a click.
  for (const i of [Math.floor(n / 4), Math.floor((3 * n) / 4)]) {
    await parts.nth(i).evaluate((el) => {
      const b = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
    });
    await page.waitForTimeout(1400);
  }
  m.note("ribbon", { caption: (await f.getByTestId("ribbon-caption").innerText().catch(() => "none")).trim() });
  await c.wide();
  await c.tap(f.getByTestId("sheet-collapse"), 600);

  await c.caption("Tap play to see the shadows move through the day");
  // Play runs from the trip time to the last daylight slot and stops by itself. Then set the trip back to 3 PM.
  await c.tap(f.getByTestId("map-play"), 4300);
  m.note("after-play", { when: await flat(f.getByTestId("when-chip")) });
  await c.tap(f.getByTestId("when-chip"), 450);
  await c.tap(f.getByTestId("hour-option-900"), 400);
  await c.idle(200);

  await c.caption("Each step gives the side of the street to walk on");
  await c.tap(f.getByTestId("peek-steps"), 700);
  await c.zoomTop(f.getByTestId("step-item").first(), 1.6, 0.36);
  await page.waitForTimeout(900);
  await c.scrollSteps(2400);
  await page.waitForTimeout(600);
  await c.wide();
  await c.tap(f.getByTestId("steps-back"), 500);

  await c.caption("Navigate shows one turn at a time");
  await c.tap(f.getByTestId("peek-navigate"), 800);
  await c.zoom(f.getByTestId("turn-card"), 1.5, 0.42);
  await c.tap(f.getByTestId("next-step"), 1200);
  await c.wide();
  await c.tap(f.getByTestId("nav-close"), 700);

  await c.caption("If it rains, tap Sheltered");
  await c.tap(f.getByTestId("peek-summary"), 800);
  await c.zoom(f.getByTestId("goal-dry"), 1.6, 0.5);
  await c.tap(f.getByTestId("goal-dry"), 1500);
  await c.wide();
  // The sheet can close itself when the route changes.
  if (await f.getByTestId("sheet-collapse").isVisible()) await c.tap(f.getByTestId("sheet-collapse"), 1200);
  else await page.waitForTimeout(1200);
  m.note("rain", { peek: await flat(f.getByTestId("route-peek")) });

  await c.caption("undercover.ph covers 67 areas in the Philippines");
  await c.map({ zoom: -4.5, pitch: 0, bearing: -40, ms: 3400 });
  await c.idle(500);
  await c.caption("undercover.ph is free and needs no sign-up");
  await page.waitForTimeout(2600);
  m.mark("end");
}

// Run a loop for a runner: a 3 km loop from Ayala Triangle Gardens at 9 AM, then the same start tomorrow at 5 AM,
// before sunrise, where the card counts lit metres in place of shade. Mark as run saves the loop on the phone, and
// Other loops searches again with that run in the history.
const RUN_FROM = "Ayala Triangle Gardens";
const DARK_LINE = "Shade does not apply before sunrise or after sunset.";

async function runLoop(page, m) {
  const c = await openCine(page, m.base);
  const f = c.f;
  const cards = f.getByTestId("jog-card");
  await page.waitForTimeout(500);
  m.mark("start");
  await c.caption("Plan a running loop in undercover.ph");
  await page.waitForTimeout(1400);

  await c.caption("Tap Shaded, then Run a loop");
  await c.zoom(f.getByTestId("pick-shade"), 1.7, 0.55);
  await c.tap(f.getByTestId("pick-shade"), 600);
  await c.zoom(f.getByTestId("mode-run"), 1.7, 0.55);
  await c.tap(f.getByTestId("mode-run"), 500);

  await c.caption("Pick a distance and a start point");
  await c.zoom(f.getByTestId("jog-km-3"), 1.6, 0.6, 650, true);
  await c.tap(f.getByTestId("jog-km-3"), 350);
  await c.type("jog-start-input", RUN_FROM);
  await cards.first().waitFor({ timeout: 90000 });
  await c.wide();
  await c.idle(300);
  m.note("day", { card: await flat(cards.first()) });

  await c.caption("The cards show shade and road crossings for each loop");
  await c.map({ pitch: 55, bearing: 38, zoom: -0.4, ms: 3400 });
  await page.waitForTimeout(1500);

  await c.caption("Each step is in English and Filipino");
  await c.tap(cards.first().locator("summary"), 400);
  await cards.first().locator("details ol li").nth(1).evaluate((el) => el.scrollIntoView({ block: "nearest" }));
  await page.waitForTimeout(2200);
  await c.tap(cards.first().locator("summary"), 300);
  await c.wide();

  await c.caption("To run before sunrise, pick 5 AM", "bottom");
  await c.zoom(f.getByTestId("when-chip"), 1.9, 0.28);
  await c.tap(f.getByTestId("when-chip"), 450);
  await c.tap(f.locator('[data-testid="date-option"][data-label="Tomorrow"]'), 450);
  await c.tap(f.getByTestId("hour-option-300"), 300);
  await c.wide();
  await cards.first().filter({ hasText: DARK_LINE }).waitFor({ timeout: 90000 });
  await c.idle(300);

  await c.caption("Before sunrise, the card shows lit streets in place of shade");
  await cards.first().evaluate((el) => el.scrollIntoView({ block: "nearest" }));
  await page.waitForTimeout(2200);
  m.note("dark", { card: await flat(cards.first()) });

  await c.caption("Tap Mark as run. The app saves it on your phone only");
  const ranKey = await cards.first().getAttribute("data-loop-key");
  await c.zoom(cards.first().getByTestId("jog-mark-run"), 1.5, 0.55);
  await c.tap(cards.first().getByTestId("jog-mark-run"), 600);
  await cards.first().getByText("Saved as run").waitFor({ timeout: 15000 });
  await c.zoom(f.getByTestId("jog-history-count"), 1.7, 0.55);
  await page.waitForTimeout(1300);
  m.note("saved", { history: await flat(f.getByTestId("jog-history-count")) });

  await c.caption("Tap Other loops for streets you have not run");
  await c.zoom(f.getByTestId("jog-again"), 1.6, 0.55);
  await c.tap(f.getByTestId("jog-again"), 300);
  await c.wide();
  await f.locator(`[data-testid="jog-card"]:not([data-loop-key="${ranKey}"])`).first().waitFor({ timeout: 90000 });
  await c.idle(700);
  await cards.first().getByText(/% new streets/).evaluate((el) => el.scrollIntoView({ block: "nearest" }));
  await page.waitForTimeout(1800);
  m.note("again", { card: await flat(cards.first()), newPct: await cards.first().getAttribute("data-new-pct") });

  await c.wide();
  await c.caption("undercover.ph is free and needs no sign-up");
  await c.map({ pitch: 45, bearing: 30, zoom: -0.8, ms: 2400 });
  await page.waitForTimeout(700);
  m.mark("end");
}

// The day's shadows on a phone: the 3 PM walk set back to 8 AM, the map tilted, then Play runs the day.
async function sunPhone(page, m) {
  const c = await openCine(page, m.base);
  const f = c.f;
  await cinePlan(c, 480);
  m.note("8am", { peek: await flat(f.getByTestId("route-peek")) });
  m.mark("start");
  await c.caption("This walk starts at 8 AM");
  await c.map({ pitch: 60, bearing: 35, zoom: 0.3, ms: 2600 });
  await c.caption("Tap play to see the shadows move through the day");
  await c.zoom(f.getByTestId("map-play"), 1.6, 0.5);
  await c.tap(f.getByTestId("map-play"), 200);
  await c.wide();
  const seen = [];
  const stop = Date.now() + 40000;
  for (;;) {
    const when = await flat(f.getByTestId("when-chip"));
    if (seen.at(-1) !== when) seen.push(when);
    if ((await f.getByTestId("map-play").getAttribute("aria-pressed")) === "false" && seen.length > 1) break;
    if (Date.now() > stop) throw new Error(`play did not stop; saw ${seen.join(", ")}`);
    await page.waitForTimeout(100);
  }
  m.note("play", { seen, peek: await flat(f.getByTestId("route-peek")) });
  await page.waitForTimeout(800);
  await c.caption("The shade on the route changes with the time you leave");
  await page.waitForTimeout(2400);
  await c.caption("undercover.ph is free and needs no sign-up");
  await page.waitForTimeout(2400);
  m.mark("end");
}

// Sun, then rain, on a phone: the same 3 PM walk in Shaded, then in Sheltered.
async function rainPhone(page, m) {
  const c = await openCine(page, m.base);
  const f = c.f;
  await cinePlan(c);
  m.note("shade", { peek: await flat(f.getByTestId("route-peek")) });
  m.mark("start");
  await c.caption("Shaded mode picks routes with more shade");
  await c.map({ pitch: 55, bearing: 30, zoom: 0.1, ms: 3000 });
  await page.waitForTimeout(600);
  await c.caption("If it rains, tap Sheltered");
  await c.tap(f.getByTestId("peek-summary"), 700);
  await c.zoom(f.getByTestId("goal-dry"), 1.6, 0.5);
  await c.tap(f.getByTestId("goal-dry"), 1200);
  await c.wide();
  // The sheet can close itself when the route changes.
  if (await f.getByTestId("sheet-collapse").isVisible()) await c.tap(f.getByTestId("sheet-collapse"), 600);
  await c.idle(300);
  await c.caption("Sheltered mode picks routes with more roof cover");
  await c.map({ pitch: 55, bearing: -30, ms: 3000 });
  m.note("rain", { peek: await flat(f.getByTestId("route-peek")) });
  await page.waitForTimeout(1600);
  await c.caption("undercover.ph is free and needs no sign-up");
  await page.waitForTimeout(2400);
  m.mark("end");
}

async function rain(page, m) {
  await page.goto(`${m.base}/?now=${NOW}&map=eager`);
  await ready(page);
  await planTrip(page, false);
  await shadowsOn(page);
  m.note("shade", await readCard(page));
  m.mark("start");
  await page.waitForTimeout(2400);
  await page.getByTestId("goal-dry").click();
  await page.waitForTimeout(200);
  await idle(page, 300);
  m.note("rain", await readCard(page));
  await page.waitForTimeout(3200);
  m.mark("end");
}

const outHeight = (vp, width) => Math.floor((vp.height * width) / vp.width / 2) * 2;

// bypassCSP: the live site allows no inline styles, and the desktop clips add their caption layer to the app page.
function contextFor(browser, vp) {
  return browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: vp.scale ?? 1,
    bypassCSP: true,
  });
}

// Chrome sends a screencast frame only when the page paints, so a still map adds no frames.
async function record(browser, base, clip) {
  const dir = path.join(work, clip.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await contextFor(browser, clip.vp);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on("Page.screencastFrame", (f) => {
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    // A page.screenshot() during the take sends frames of another size. They would break the GIF palette pass.
    if (f.metadata.deviceWidth !== clip.vp.width || f.metadata.deviceHeight !== clip.vp.height) return;
    const file = `${String(frames.length).padStart(5, "0")}.png`;
    frames.push({ file, t: f.metadata.timestamp });
    writes.push(writeFile(path.join(dir, file), Buffer.from(f.data, "base64")));
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  const marks = {};
  const notes = {};
  await clip.flow(page, {
    base,
    mark: (k) => (marks[k] = Date.now() / 1000),
    note: (k, v) => {
      notes[k] = v;
      console.log(`[${clip.name}] ${k} ${JSON.stringify(v)}`);
    },
  });
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  await ctx.close();
  const meta = { name: clip.name, vp: clip.vp, start: marks.start, end: marks.end, frames, notes, errors };
  writeFileSync(path.join(work, `${clip.name}.json`), JSON.stringify(meta, null, 1));
  if (errors.length) console.log(`[${clip.name}] page errors: ${errors.join(" | ")}`);
  return meta;
}

// Sample the painted frames at the GIF frame rate, from the start mark to the end mark, then hold the last one.
// Each sample shows the newest frame painted by then. Runs of the same frame merge into one longer entry.
// speed above 1 plays the take faster: each output frame steps further through the recording.
function frameList(meta, fps, speed = 1) {
  const ticks = Math.floor(((meta.end - meta.start) * fps) / speed);
  const entries = [];
  let j = Math.max(0, meta.frames.findLastIndex((f) => f.t <= meta.start));
  for (let k = 0; k <= ticks; k++) {
    const t = meta.start + (k * speed) / fps;
    while (j + 1 < meta.frames.length && meta.frames[j + 1].t <= t) j++;
    const file = meta.frames[j].file;
    if (entries.at(-1)?.file === file) entries.at(-1).ticks++;
    else entries.push({ file, ticks: 1 });
  }
  entries.at(-1).ticks += Math.round(HOLD_S * fps);
  const lines = ["ffconcat version 1.0"];
  for (const e of entries) lines.push(`file '${path.join(work, meta.name, e.file)}'`, `duration ${(e.ticks / fps).toFixed(4)}`);
  // The fps filter stops at the last frame's start, so add one short closing entry and cut the output at the exact count.
  lines.push(`file '${path.join(work, meta.name, entries.at(-1).file)}'`, `duration ${(1 / fps).toFixed(4)}`);
  const file = path.join(work, `${meta.name}-frames.txt`);
  writeFileSync(file, `${lines.join("\n")}\n`);
  return { file, frames: entries.reduce((n, e) => n + e.ticks, 0) };
}

function encode(clip) {
  const meta = JSON.parse(readFileSync(path.join(work, `${clip.name}.json`), "utf8"));
  const painted = meta.frames.filter((f) => f.t >= meta.start && f.t <= meta.end).length;
  console.log(`[${clip.name}] ${painted} painted frames over ${(meta.end - meta.start).toFixed(1)} s`);
  if (clip.mp4) encodeMp4(clip, meta);
  if (clip.story) encodeStory(clip, meta);
  if (clip.gif === false) return;
  const out = path.join(outDir, `${clip.name}.gif`);
  const pal = path.join(work, `${clip.name}-palette.png`);
  const raw = path.join(work, `${clip.name}-raw.gif`);
  const w = clip.width;
  const h = outHeight(meta.vp, w);
  for (const step of LADDER) {
    const { fps, colors } = step;
    const list = frameList(meta, fps, clip.speed ?? 1);
    const input = ["-f", "concat", "-safe", "0", "-i", list.file];
    const chain = `fps=${fps},scale=${w}:${h}:flags=lanczos`;
    run("ffmpeg", ["-y", "-loglevel", "error", ...input, "-vf", `${chain},palettegen=stats_mode=diff:max_colors=${colors}`, pal]);
    run("ffmpeg", ["-y", "-loglevel", "error", ...input, "-i", pal, "-lavfi", `[0:v]${chain}[x];[x][1:v]paletteuse=dither=${clip.dither ?? "sierra2_4a"}:diff_mode=rectangle`, "-frames:v", String(list.frames), "-loop", "0", raw]);
    run("gifsicle", ["-O3", ...(clip.lossy ? [`--lossy=${clip.lossy}`] : []), raw, "-o", out]);
    const mb = statSync(out).size / 1e6;
    console.log(`[${clip.name}] ${fps} fps, ${colors} colors: ${mb.toFixed(2)} MB (budget ${clip.maxMB} MB)`);
    if (mb <= clip.maxMB) break;
    if (step === LADDER.at(-1)) throw new Error(`${clip.name}.gif is ${mb.toFixed(2)} MB, over ${clip.maxMB} MB at the smallest setting`);
  }
  for (const f of [raw, pal]) rmSync(f, { force: true });
  checkFrames(clip.name, out);
}

// H.264 at 30 fps for LinkedIn and the README. CRF 31 keeps a 1080p take under the 10 MB GitHub upload cap and stays
// sharp on this map. yuv420p and faststart so every player and feed can start it.
function encodeMp4(clip, meta) {
  const out = path.join(outDir, `${clip.name}.mp4`);
  const w = clip.mp4.width;
  const h = outHeight(meta.vp, w);
  const list = frameList(meta, 30, clip.mp4.speed ?? 1);
  run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list.file, "-vf", `fps=30,scale=${w}:${h}:flags=lanczos,format=yuv420p`,
    "-frames:v", String(list.frames), "-c:v", "libx264", "-preset", "slow", "-crf", "31", "-tune", "animation", "-movflags", "+faststart", "-an", out]);
  console.log(`[${clip.name}] mp4 ${w}x${h}: ${(statSync(out).size / 1e6).toFixed(2)} MB`);
  // A high-quality master for LinkedIn, which compresses every upload again. Too big for git, so it stays in tmp/.
  const master = path.join(repo, "tmp", "linkedin", `${clip.name}.mp4`);
  mkdirSync(path.dirname(master), { recursive: true });
  run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list.file, "-vf", `fps=30,scale=${w}:${h}:flags=lanczos,format=yuv420p`,
    "-frames:v", String(list.frames), "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-movflags", "+faststart", "-an", master]);
  console.log(`[${clip.name}] LinkedIn master: ${path.relative(repo, master)} ${(statSync(master).size / 1e6).toFixed(1)} MB`);
}

// Instagram Stories: 1080 x 1920 H.264 at 30 fps, at most 60 s per story, with a silent AAC track because some
// uploads refuse a file with no audio. CRF 18 because Instagram compresses every upload again. A take longer than
// 59 s plays just fast enough to fit. Too big for git, so the files stay in tmp/instagram/.
function encodeStory(clip, meta) {
  const out = path.join(repo, "tmp", "instagram", `${clip.story}.mp4`);
  mkdirSync(path.dirname(out), { recursive: true });
  const take = meta.end - meta.start;
  const speed = Math.max(clip.mp4?.speed ?? 1.2, take / (59 - HOLD_S));
  const list = frameList(meta, 30, speed);
  run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list.file, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", "fps=30,scale=1080:1920:flags=lanczos,format=yuv420p", "-frames:v", String(list.frames), "-t", (list.frames / 30).toFixed(3),
    "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.2", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart", out]);
  const dur = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).trim());
  console.log(`[${clip.name}] story ${path.relative(repo, out)} ${dur.toFixed(1)} s at ${speed.toFixed(2)}x, ${(statSync(out).size / 1e6).toFixed(1)} MB`);
  if (dur > 60) throw new Error(`${clip.story} story is ${dur.toFixed(1)} s, over 60 s`);
}

// Eight frames spread over the GIF, from the first to the held last frame, for a person to read back.
// The fps filter samples what is on screen at each time; a seek would skip a frame that began earlier.
function checkFrames(name, gif) {
  const dir = path.join(framesDir, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const dur = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", gif]).trim());
  const n = 8;
  const span = Math.max(0.1, dur - 0.3);
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", gif, "-vf", `tpad=stop_mode=clone:stop_duration=1,fps=${(n - 1) / span}`, "-frames:v", String(n), path.join(dir, "%02d.png")]);
  for (let i = 1; i <= n; i++) {
    const png = path.join(dir, `${String(i).padStart(2, "0")}.png`);
    if (existsSync(png)) renameSync(png, path.join(dir, `${String(i).padStart(2, "0")}-${(((i - 1) * span) / (n - 1)).toFixed(1)}s.png`));
  }
  console.log(`[${name}] ${dur.toFixed(1)} s, frames in ${path.relative(repo, dir)}/`);
}

// A real screenshot of the results view with shadows, reduced to a 256-color PNG to fit the budget.
async function share(browser, base, s) {
  const ctx = await contextFor(browser, s.vp);
  const page = await ctx.newPage();
  await page.goto(`${base}/?now=${NOW}&map=eager`);
  await ready(page);
  await planTrip(page, false);
  await shadowsOn(page);
  await idle(page, 800);
  console.log(`[${s.name}] ${JSON.stringify(await readCard(page))}`);
  const raw = path.join(work, `${s.name}-raw.png`);
  await page.screenshot({ path: raw });
  await ctx.close();
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-vf", "split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a", s.out]);
  const kb = statSync(s.out).size / 1e3;
  console.log(`[${s.name}] ${path.relative(repo, s.out)} ${s.vp.width}x${s.vp.height} ${kb.toFixed(0)} KB (budget ${s.maxKB} KB)`);
  if (kb > s.maxKB) throw new Error(`${s.name} is ${kb.toFixed(0)} KB, over ${s.maxKB} KB`);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(work, { recursive: true });
const clips = CLIPS.filter((c) => want(c.name));

if (flag("encode-only")) {
  for (const c of clips) encode(c);
} else {
  let server = null;
  let base = arg("base");
  if (!base) {
    if (!existsSync(path.join(root, "dist", "index.html"))) throw new Error("dist/ is missing. Run pnpm build first, or use pnpm demo:record.");
    server = await preview({ root, preview: { port: 5193, strictPort: false }, logLevel: "error" });
    base = server.resolvedUrls.local[0].replace(/\/$/, "");
  }
  const gpu = process.platform === "darwin" && !flag("swiftshader");
  const browser = await chromium.launch(
    gpu
      ? { channel: "chromium", args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] }
      : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  );
  try {
    for (const c of clips) {
      await record(browser, base, c);
      encode(c);
    }
    for (const s of SHARES.filter((x) => want(x.name))) await share(browser, base, s);
  } finally {
    await browser.close();
    await server?.httpServer.close();
  }
}
console.log("[done]");
