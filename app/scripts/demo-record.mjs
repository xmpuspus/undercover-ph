// Record the README demo GIFs and the share images from the running app.
// Usage: pnpm demo:record   (pnpm build, then this script)
//   node scripts/demo-record.mjs --only=hero,rain    record some clips or images (hero, sun-direction, steps-phone, rain, og, social)
//   node scripts/demo-record.mjs --encode-only       re-encode the saved frames in tmp/demo-frames/_video without recording
//   --base=http://localhost:5173 drives a running server instead of serving dist/
//   --swiftshader uses software WebGL when no GPU is available (choppier map motion)
// Playwright drives Chromium and saves Chrome's screencast as lossless PNG frames with their paint times.
// Playwright's recordVideo uses the same screencast but re-encodes it as VP8 at a fixed 1 Mbps. On this 3D map
// that shimmer made every GIF frame redraw: the hero GIF came out at 7.2 to 7.5 MB against a 5 MB budget.
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
const dates = JSON.parse(readFileSync(path.join(root, "public/data/manifest.json"), "utf8")).dates;
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

const CLIPS = [
  { name: "hero", vp: DESKTOP, width: 900, maxMB: 5, flow: hero },
  { name: "sun-direction", vp: DESKTOP, width: 900, maxMB: 5, flow: sunDirection },
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
  // Phones have one "when" chip whose panel holds the dates and the hours.
  if (await page.getByTestId("when-chip").isVisible().catch(() => false)) {
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

async function hero(page, m) {
  await page.goto(`${m.base}/?now=${NOW}&map=eager`);
  await ready(page);
  await page.waitForTimeout(400);
  m.mark("start");
  await page.waitForTimeout(1800);
  await planTrip(page, true);
  await shadowsOn(page);
  m.note("results", await readCard(page));
  await page.waitForTimeout(3600);
  m.mark("end");
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
    deviceScaleFactor: 1,
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
function frameList(meta, fps) {
  const ticks = Math.floor((meta.end - meta.start) * fps);
  const entries = [];
  let j = Math.max(0, meta.frames.findLastIndex((f) => f.t <= meta.start));
  for (let k = 0; k <= ticks; k++) {
    const t = meta.start + k / fps;
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
  const out = path.join(outDir, `${clip.name}.gif`);
  const pal = path.join(work, `${clip.name}-palette.png`);
  const raw = path.join(work, `${clip.name}-raw.gif`);
  const w = clip.width;
  const h = outHeight(meta.vp, w);
  for (const step of LADDER) {
    const { fps, colors } = step;
    const list = frameList(meta, fps);
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
