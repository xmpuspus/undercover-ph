// Record the README demo GIFs and the share images from the running app.
// Usage: pnpm demo:record   (pnpm build, then this script)
//   node scripts/demo-record.mjs --only=walkthrough,rain    record some clips or images (walkthrough, sun-direction, steps-phone, rain, og, social)
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
const NOW = `${dates[0]}T09:00`;

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
const PHONE = { width: 390, height: 844, mobile: true };
// 4:5 for a phone feed. The phone layout runs in a zoomed frame on this page, so it renders sharp at 1080 px.
const TALL = { width: 1080, height: 1350, mobile: false };
// 1600 x 900 CSS pixels at deviceScaleFactor 1.2. Chrome's screencast still sends 1600 x 900 frames, so the
// 1920 x 1080 MP4 is a 1.2x upscale; the larger CSS size keeps the captions and map labels big.
const WIDE = { width: 1600, height: 900, mobile: false, scale: 1.2 };

const CLIPS = [
  { name: "walkthrough", vp: WIDE, width: 720, maxMB: 9.5, speed: 1.5, flow: walkthrough, mp4: { width: 1920 } },
  { name: "walkthrough-tall", vp: TALL, mp4: { width: 1080 }, gif: false, flow: walkthroughTall },
  { name: "sun-direction", vp: DESKTOP, width: 900, maxMB: 6.5, flow: sunDirection },
  { name: "steps-phone", vp: PHONE, width: 360, maxMB: 3, flow: stepsPhone },
  { name: "rain", vp: DESKTOP, width: 900, maxMB: 4, flow: rain },
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

async function stepsPhone(page, m) {
  await page.goto(`${m.base}/?now=${NOW}&map=eager`);
  await ready(page);
  await planTrip(page, false);
  m.note("results", await readCard(page));
  m.mark("start");
  await page.waitForTimeout(2200);
  // The phone sheet opens to the full card first, so the clip shows the route, then the steps.
  await page.getByTestId("peek-summary").click();
  await page.getByTestId("route-card").waitFor();
  await page.waitForTimeout(2000);
  await page.getByTestId("sheet-collapse").click();
  await page.getByTestId("route-peek").waitFor();
  await page.waitForTimeout(900);
  await page.getByTestId("peek-steps").click();
  await page.getByTestId("steps").waitFor();
  await idle(page, 300);
  m.note("steps", {
    count: await page.getByTestId("step-item").count(),
    sides: await page.getByTestId("side-badge").allInnerTexts(),
    items: (await page.getByTestId("step-item").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()),
  });
  await page.waitForTimeout(1400);
  // The list scrolls inside its own <ol>, not the window.
  await page.evaluate(
    (ms) =>
      new Promise((done) => {
        const ol = document.querySelector('[data-testid="steps"] ol');
        if (!ol) return done();
        const end = ol.scrollHeight - ol.clientHeight;
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          ol.scrollTop = end * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    4200,
  );
  await page.waitForTimeout(1300);
  await page.getByTestId("steps-back").click();
  await page.waitForTimeout(900);
  await page.getByTestId("peek-navigate").click();
  await page.getByTestId("turn-card").waitFor();
  await idle(page, 300);
  m.note("navigate", { turn: (await page.getByTestId("turn-text").innerText()).replace(/\s+/g, " ").trim() });
  await page.waitForTimeout(2000);
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
  await caption(page, null, "Walking routes in Metro Manila that keep you in the shade");
  await page.waitForTimeout(4200);

  await caption(page, 1, "Pick Shaded on a sunny day, or Sheltered in the rain");
  await page.waitForTimeout(2200);
  await tap(page, page.getByTestId("pick-shade"), 900);

  await caption(page, 2, "Search for where you are going");
  await typePick(page, "destination-input", TO);
  await caption(page, 3, "Pick where you start, or use your location");
  await typePick(page, "from-input", FROM);

  await caption(page, 4, "Pick when you leave. Shade changes every half hour");
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

  await caption(page, 5, "Compare routes by shade and by minutes in the sun");
  await page.waitForTimeout(1800);
  await tap(page, page.getByTestId("route-tab").filter({ hasText: "Shortest" }), 1500);
  await tap(page, page.getByTestId("route-tab").filter({ hasText: "Recommended" }), 700);

  await caption(page, 6, "See where the cover comes from along the walk");
  const parts = page.getByTestId("ribbon-part");
  const n = await parts.count();
  for (const i of [Math.floor(n / 4), Math.floor((3 * n) / 4)]) {
    const { x, y } = await pointAt(page, parts.nth(i));
    await page.mouse.move(x, y);
    await page.waitForTimeout(1300);
  }
  await page.mouse.move(800, 450);

  await caption(page, 7, "Press play to watch the shadows move");
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

  await caption(page, 8, "Steps say which side of the street to walk on");
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

  await caption(page, 9, "Navigate one step at a time");
  await tap(page, page.getByTestId("navigate"), 1500);
  await tap(page, page.getByTestId("next-step"), 1300);
  await hideDot(page);
  m.note("navigate", { turn: (await page.getByTestId("turn-text").innerText()).replace(/\s+/g, " ").trim() });
  await tap(page, page.getByTestId("nav-close"), 900);
  await hideDot(page);

  await caption(page, 10, "Rain? Switch to Sheltered for roofs and underpasses");
  await tap(page, page.getByTestId("goal-dry"), 300);
  await idle(page, 300);
  m.note("rain", await readCard(page));
  await page.waitForTimeout(2400);

  await caption(page, 11, "It works in 14 areas across Metro Manila");
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

  await caption(page, null, "Free, with no sign-up. Try it at undercover.ph");
  await page.waitForTimeout(3000);
  m.mark("end");
}

// The tall cut: the phone layout of the app, 390 x 844 CSS pixels, zoomed 1.38 times inside a 1080 x 1350 page,
// with the caption above it. Playwright's own clicks miss inside a zoomed frame, so each tap clicks the element
// from inside the frame and the dot is placed from the element's box times the zoom.
const TALL_ZOOM = 1.38;
const TALL_TOP = 168;

function tallHost(base) {
  // CSS zoom scales the frame's left and top as well, so both are divided by the zoom.
  const left = (1080 - 390 * TALL_ZOOM) / 2;
  return `<!doctype html><html><head><style>
html,body{margin:0;height:1350px;overflow:hidden;background:#0F172A}
#cap{position:absolute;left:60px;right:60px;top:0;height:${TALL_TOP}px;display:flex;align-items:center;gap:22px;color:#fff;
  font:500 40px/1.2 "Avenir Next",system-ui,sans-serif;opacity:0;transition:opacity .35s}
#cap.on{opacity:1}
#cap b{flex:none;display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:#2563EB;font-size:32px}
#ph{position:absolute;left:${left / TALL_ZOOM}px;top:${TALL_TOP / TALL_ZOOM}px;width:390px;height:844px;border:0;zoom:${TALL_ZOOM};border-radius:22px;
  box-shadow:0 18px 50px rgba(0,0,0,.45);background:#fff}
#wt-dot{position:fixed;left:0;top:0;z-index:9;pointer-events:none;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;
  background:rgba(15,23,42,.35);border:4px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.4);opacity:0;
  transition:left .45s cubic-bezier(.3,.7,.3,1),top .45s cubic-bezier(.3,.7,.3,1),opacity .3s}
#wt-dot.on{opacity:1}
#wt-dot.tap{animation:wt-tap .35s}
@keyframes wt-tap{50%{transform:scale(.7);background:rgba(37,99,235,.6)}}
</style></head><body><div id="cap"></div><div id="wt-dot"></div>
<iframe id="ph" src="${base}/?now=${NOW}&map=eager" allow="geolocation"></iframe></body></html>`;
}

async function tallCaption(page, step, text) {
  await page.evaluate(([n, t]) => {
    const el = document.getElementById("cap");
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

// The element's centre in page pixels: its box inside the frame, times the zoom, plus the frame's offset.
async function tallPoint(page, locator) {
  await locator.waitFor({ timeout: 30000 });
  const r = await locator.evaluate((el) => {
    el.scrollIntoView({ block: "nearest" });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  const f = await page.evaluate(() => {
    const b = document.getElementById("ph").getBoundingClientRect();
    return { x: b.left, y: b.top };
  });
  return { x: f.x + r.x * TALL_ZOOM, y: f.y + r.y * TALL_ZOOM };
}

async function tallTap(page, locator, after = 500) {
  const { x, y } = await tallPoint(page, locator);
  await page.evaluate(([px, py]) => {
    const d = document.getElementById("wt-dot");
    d.style.left = `${px}px`;
    d.style.top = `${py}px`;
    d.classList.add("on");
  }, [x, y]);
  await page.waitForTimeout(550);
  await page.evaluate(() => {
    const d = document.getElementById("wt-dot");
    d.classList.remove("tap");
    void d.offsetWidth;
    d.classList.add("tap");
  });
  await locator.evaluate((el) => el.click());
  await page.waitForTimeout(after);
  await tallHide(page);
}

async function tallHide(page) {
  await page.evaluate(() => document.getElementById("wt-dot").classList.remove("on"));
}

async function tallType(page, f, input, text) {
  await tallTap(page, f.getByTestId(input), 250);
  await f.getByTestId(input).pressSequentially(text, { delay: 70 });
  await page.waitForTimeout(500);
  await tallTap(page, f.getByTestId("place-option").filter({ has: f.getByText(text, { exact: true }) }).first(), 700);
}

async function walkthroughTall(page, m) {
  await page.setContent(tallHost(m.base));
  const f = page.frameLocator("#ph");
  await f.locator('[data-testid="map"][data-idle="1"]').waitFor({ timeout: 90000 });
  await cacheZoomOut(page, f.locator(".maplibregl-canvas"), () => f.locator('[data-testid="map"][data-idle="1"]').waitFor({ timeout: 60000 }));
  await page.waitForTimeout(800);
  m.mark("start");
  await tallCaption(page, null, "Walking routes in Metro Manila that keep you in the shade");
  await page.waitForTimeout(1700);

  await tallCaption(page, 1, "Pick Shaded on a sunny day, or Sheltered in the rain");
  await page.waitForTimeout(1000);
  await tallTap(page, f.getByTestId("pick-shade"), 900);

  await tallCaption(page, 2, "Search for where you are going");
  await tallType(page, f, "destination-input", TO);
  await tallCaption(page, 3, "Pick where you start, or use your location");
  await tallType(page, f, "from-input", FROM);

  await tallCaption(page, 4, "Pick when you leave. Shade changes every half hour");
  await tallTap(page, f.getByTestId("when-chip"), 600);
  await tallTap(page, f.locator('[data-testid="date-option"][data-label="Tomorrow"]'), 500);
  await tallTap(page, f.getByTestId("hour-option-900"), 400);
  await tallHide(page);
  await f.getByTestId("route-peek").waitFor({ timeout: 30000 });
  await f.locator('[data-testid="map"][data-idle="1"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1600);
  m.note("results", { peek: (await f.getByTestId("route-peek").innerText()).replace(/\s+/g, " ") });

  await tallCaption(page, 5, "Compare routes by shade and by minutes in the sun");
  await tallTap(page, f.getByTestId("peek-summary"), 1500);
  await tallTap(page, f.getByTestId("route-tab").filter({ hasText: "Shortest" }), 1600);
  await tallTap(page, f.getByTestId("route-tab").filter({ hasText: "Recommended" }), 900);

  await tallCaption(page, 6, "See where the cover comes from along the walk");
  const parts = f.getByTestId("ribbon-part");
  const n = await parts.count();
  // The bar picks a stretch on pointer move, so point at each part and send a move, not a click.
  for (const i of [Math.floor(n / 4), Math.floor((3 * n) / 4)]) {
    const part = parts.nth(i);
    const { x, y } = await tallPoint(page, part);
    await page.evaluate(([px, py]) => {
      const d = document.getElementById("wt-dot");
      d.style.left = `${px}px`;
      d.style.top = `${py}px`;
      d.classList.add("on");
    }, [x, y]);
    await page.waitForTimeout(450);
    await part.evaluate((el) => {
      const b = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 }));
    });
    await page.waitForTimeout(1400);
  }
  m.note("ribbon", { caption: (await f.getByTestId("ribbon-caption").innerText().catch(() => "none")).trim() });
  await tallTap(page, f.getByTestId("sheet-collapse"), 700);
  await tallHide(page);

  await tallCaption(page, 7, "Press play to watch the shadows move");
  // Play runs from the trip time to the last daylight slot and stops by itself. Then set the trip back to 3 PM.
  await tallTap(page, f.getByTestId("map-play"), 4300);
  m.note("after-play", { when: (await f.getByTestId("when-chip").innerText()).replace(/\s+/g, " ") });
  await tallTap(page, f.getByTestId("when-chip"), 500);
  await tallTap(page, f.getByTestId("hour-option-900"), 500);
  await tallHide(page);
  await f.locator('[data-testid="map"][data-idle="1"]').waitFor({ timeout: 60000 });

  await tallCaption(page, 8, "Steps say which side of the street to walk on");
  await tallTap(page, f.getByTestId("peek-steps"), 1200);
  await tallHide(page);
  await f.locator('[data-testid="steps"] ol').evaluate(
    (ol, ms) =>
      new Promise((done) => {
        const end = Math.min(ol.scrollHeight - ol.clientHeight, 700);
        const t0 = performance.now();
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          ol.scrollTop = end * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      }),
    2400,
  );
  await page.waitForTimeout(700);
  await tallTap(page, f.getByTestId("steps-back"), 700);

  await tallCaption(page, 9, "Navigate one step at a time");
  await tallTap(page, f.getByTestId("peek-navigate"), 1500);
  await tallTap(page, f.getByTestId("next-step"), 1400);
  await tallTap(page, f.getByTestId("nav-close"), 900);
  await tallHide(page);

  await tallCaption(page, 10, "Rain? Switch to Sheltered for roofs and underpasses");
  await tallTap(page, f.getByTestId("peek-summary"), 1000);
  await tallTap(page, f.getByTestId("goal-dry"), 1600);
  // The sheet can close itself when the route changes.
  if (await f.getByTestId("sheet-collapse").isVisible()) await tallTap(page, f.getByTestId("sheet-collapse"), 1800);
  else await page.waitForTimeout(1800);
  await tallHide(page);
  m.note("rain", { peek: (await f.getByTestId("route-peek").innerText()).replace(/\s+/g, " ") });

  await tallCaption(page, 11, "It works in 14 areas across Metro Manila");
  await f.locator(".maplibregl-canvas").evaluate((c) => {
    c.style.outline = "none";
    c.focus();
  });
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Minus");
    await page.waitForTimeout(650);
  }
  await f.locator('[data-testid="map"][data-idle="1"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);

  await tallCaption(page, null, "Free, with no sign-up. Try it at undercover.ph");
  await page.waitForTimeout(3000);
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

function contextFor(browser, vp) {
  return browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: vp.scale ?? 1,
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
    run("ffmpeg", ["-y", "-loglevel", "error", ...input, "-i", pal, "-lavfi", `[0:v]${chain}[x];[x][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, "-frames:v", String(list.frames), "-loop", "0", raw]);
    run("gifsicle", ["-O3", raw, "-o", out]);
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
  const list = frameList(meta, 30);
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
