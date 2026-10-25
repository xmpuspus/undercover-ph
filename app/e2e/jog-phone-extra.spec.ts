/// <reference types="geojson" />
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { GeoJSONSource, Map as GLMap } from "maplibre-gl";
import type { Data } from "../src/lib/routerClient";
import { parseJog, sightGrade } from "../src/lib/jog/attrs";
import { emitJogScreenshot, waitForJogFrame } from "../src/lib/jog/browserEvidence";

// SPEC J-U6/J-U7 edge cases. Screenshots go to the controller's native output, without writing artifacts.
const manifest = JSON.parse(readFileSync(new URL("../public/data/areas/metro-core/manifest.json", import.meta.url), "utf8")) as { dates: string[] };
const LONG_START = "Opening Windows of Imagination for Children who Find Certain Doors Permanently Shut";
const AYALA = "Ayala Triangle Gardens";

test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, contextOptions: { reducedMotion: "reduce", serviceWorkers: "block" } });

function rawSights(names: string[]) {
  return {
    version: 1, graph_sha256: "0".repeat(64), counts: { edges: 2, sights: names.length, lit_share: 0 },
    sights: names.map((name, i) => ({ name, kind: "historic", lon: 121.02, lat: 14.55, src: `osm:n${i}` })),
    edges: { road: [0, 0], lit: [0, 0], surface: [0, 0], park: [0, 0], water: [0, 0], sight: [0, names.length - 1] },
  };
}

test("separator-only sight names preserve the file and later sight indexes", () => {
  const raw = rawSights([";", "   ", " ; ; Named sight ; Other name "]);
  const jog = parseJog(raw, 2);
  expect(jog).not.toBeNull();
  expect(jog!.sights.map((s) => s.name)).toEqual(["", "", "Named sight"]);
  expect(Array.from(jog!.edges.sight)).toEqual([-1, 2]);
  expect(raw.edges.sight).toEqual([0, 2]);
});

test("unnamed sight rows do not inflate the mapping grade", () => {
  // A square kilometre: two named sights yield one expected sight per kilometre of a loop.
  const data = { manifest: { graph_bbox: [0, 0, 1, 1] }, mPerLon: 1000, mPerLat: 1000 } as unknown as Data;
  const blanks = Array.from({ length: 10 }, (_, i) => i % 2 ? "   " : ";");
  for (const [named, grade] of [[0, "thin"], [2, "some"], [6, "rich"]] as const) {
    const jog = parseJog(rawSights([...blanks, ...Array.from({ length: named }, (_, i) => `Sight ${i}`)]), 2)!;
    expect(jog).not.toBeNull();
    expect(sightGrade(jog, data)).toBe(grade);
  }
});

type QueryGate = { hold: boolean; pending: (() => void)[]; release: () => void };
declare global {
  interface Window { jogTestMap: GLMap; jogQueryGate: QueryGate }
}

async function openRun(page: Page, hour = "07:00") {
  await page.addInitScript(() => {
    let lib: typeof import("maplibre-gl");
    Object.defineProperty(window, "maplibregl", {
      configurable: true, get: () => lib, set: (value: typeof import("maplibre-gl")) => {
        lib = value;
        const NativeMap = value.Map;
        value.Map = class extends NativeMap {
          constructor(options: import("maplibre-gl").MapOptions) {
            super(options); window.jogTestMap = this;
          }
        };
      },
    });
    // Hold outgoing queries, then send them to the real worker. Results and geometry are never mocked.
    const gate: QueryGate = { hold: false, pending: [], release() {
      gate.hold = false;
      for (const send of gate.pending.splice(0)) send();
    } };
    window.jogQueryGate = gate;
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, { construct(target, args) {
      const worker = Reflect.construct(target, args) as Worker;
      if (String(args[0]).includes("jogWorker")) {
        worker.postMessage = new Proxy(worker.postMessage, { apply(send, receiver, messages) {
          const post = () => Reflect.apply(send, receiver, messages);
          if (gate.hold && messages[0]?.type === "query") gate.pending.push(post);
          else post();
        } });
      }
      return worker;
    } });
  });
  await page.goto(`/?now=${manifest.dates[0]}T${hour}`);
  await expect(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("pick-shade").click();
  await page.getByTestId("mode-run").click();
}

async function pickStart(page: Page, name: string, keyboard = false) {
  await page.getByTestId("jog-start-input").fill(name);
  const option = page.getByTestId("place-option").filter({ has: page.getByText(name, { exact: true }) }).first();
  await expect(option).toBeVisible();
  if (keyboard) {
    await page.getByTestId("jog-start-input").press("ArrowDown");
    await page.getByTestId("jog-start-input").press("Enter");
  } else await option.click();
  await expect(page.getByTestId("jog-card")).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByTestId("jog-summary")).toBeVisible();
  await waitForJogFrame(page);
}

async function expectFolded(page: Page) {
  await expect(page.getByTestId("jog-start-input")).toBeHidden();
  await expect(page.getByTestId("jog-summary")).toBeVisible();
  const height = page.viewportSize()!.height;
  for (const id of ["panel", "jog-panel"]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height, `${id} height`).toBeLessThanOrEqual(height * 0.45);
  }
}

for (const hour of ["07:00", "19:00"]) test(`320 px keeps a long start, precise numbers and card actions usable at ${hour}`, async ({ page }) => {
  await openRun(page, hour);
  await page.getByTestId("jog-km-custom").click();
  await page.getByLabel("Distance in km").fill("3.123456789");
  await page.getByLabel("Pace in minutes per km").fill("7.123456789");
  await pickStart(page, LONG_START, true);
  await expectFolded(page);
  const summary = page.getByTestId("jog-summary"), edit = page.getByTestId("jog-edit");
  await expect(edit).toBeFocused();
  await expect(summary).toContainText(LONG_START);
  await expect(summary).toContainText("3.12 km");
  await expect(summary).toContainText("7.12 min/km");
  const geometry = await summary.evaluate((el) => {
    const p = el.querySelector("p")!, name = p.children[0] as HTMLElement, values = p.children[1] as HTMLElement;
    const edit = el.querySelector("button")!;
    return { overflow: el.scrollWidth - el.clientWidth, textOverflow: p.scrollWidth - p.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      nameWidth: name.clientWidth, nameTruncated: name.scrollWidth > name.clientWidth,
      ellipsis: getComputedStyle(name).textOverflow, valuesRight: values.getBoundingClientRect().right,
      editLeft: edit.getBoundingClientRect().left, editHeight: edit.getBoundingClientRect().height,
      editWidth: edit.getBoundingClientRect().width, rowHeight: el.getBoundingClientRect().height };
  });
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.textOverflow).toBeLessThanOrEqual(0);
  expect(geometry.pageOverflow).toBe(0);
  expect(geometry.nameWidth).toBeGreaterThan(0);
  expect(geometry.nameTruncated).toBe(true);
  expect(geometry.ellipsis).toBe("ellipsis");
  expect(geometry.valuesRight).toBeLessThanOrEqual(geometry.editLeft);
  expect(geometry.editHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.editWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.rowHeight).toBeLessThanOrEqual(geometry.editHeight + 1);
  const results = page.locator(".jog-panel-results");
  expect(await results.evaluate((el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "auto")).toBe(true);
  console.log("JOG_PHONE_LAYOUT", hour, JSON.stringify(geometry));
  await emitJogScreenshot(page, `loop-320-long-name-${hour.replace(":", "")}`);

  const key = await page.getByTestId("jog-card").first().getAttribute("data-loop-key");
  await edit.click();
  await expect(page.getByTestId("jog-start-input")).toHaveValue(LONG_START);
  await expect(page.getByLabel("Distance in km")).toHaveValue("3.123456789");
  await expect(page.getByLabel("Pace in minutes per km")).toHaveValue("7.123456789");
  await expect(page.getByTestId("jog-card").first()).toHaveAttribute("data-loop-key", key!);
  await page.getByTestId("jog-km-3").click();
  await expectFolded(page);
  await expect(summary).toContainText("3 km");
  const cards = page.getByTestId("jog-card");
  for (let i = 0; i < 3; i++) {
    await cards.nth(i).getByTestId("jog-mark-run").click({ trial: true });
    await cards.nth(i).locator("summary").click({ trial: true });
  }
  await cards.first().getByTestId("jog-mark-run").click();
  await expect(page.getByTestId("jog-history-count")).toContainText("1 saved run");
  await cards.first().locator("summary").click();
  await expect(cards.first().locator("details")).toHaveAttribute("open", "");
  await cards.first().locator("details ol li").first().scrollIntoViewIfNeeded();
  await expect(cards.first().locator("details ol li").first()).toBeInViewport();
  await expect(summary).toBeInViewport();
  await emitJogScreenshot(page, `loop-320-steps-${hour.replace(":", "")}`);
});

async function loopCoordinates(page: Page) {
  return page.evaluate(() => {
    const source = window.jogTestMap.getSource("jog-loop") as GeoJSONSource;
    return JSON.stringify(source.serialize().data);
  });
}

test("folded retries keep the summary, cards, panel height and map through Other loops and time changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRun(page);
  await page.getByTestId("jog-km-3").click();
  await pickStart(page, AYALA);
  const actions = [
    async () => { await page.getByTestId("jog-again").click(); },
    async () => { await page.getByTestId("when-chip").click(); await page.getByTestId("hour-option-480").click(); },
    async () => {
      await page.getByTestId("when-chip").click();
      await page.getByTestId("date-option").nth(1).click();
      await page.keyboard.press("Escape");
    },
  ];
  for (const action of actions) {
    const cards = page.getByTestId("jog-card");
    const keys = await cards.evaluateAll((els) => els.map((el) => el.getAttribute("data-loop-key")));
    const coordinates = await loopCoordinates(page);
    await page.evaluate(() => { window.jogQueryGate.hold = true; });
    try {
      await action();
      await expect.poll(() => page.evaluate(() => window.jogQueryGate.pending.length), { timeout: 15_000 }).toBeGreaterThan(0);
      await expect(page.getByTestId("jog-panel").getByRole("status").filter({ hasText: "Finding loops..." })).toBeVisible();
      await expectFolded(page);
      await expect(cards).toHaveCount(keys.length);
      for (let i = 0; i < keys.length; i++) await expect(cards.nth(i)).toHaveAttribute("data-loop-key", keys[i]!);
      expect(await loopCoordinates(page)).toBe(coordinates);
    } finally {
      await page.evaluate(() => window.jogQueryGate.release());
    }
    await expect(page.getByTestId("jog-again")).toBeEnabled({ timeout: 60_000 });
    await expectFolded(page);
    await waitForJogFrame(page);
  }
  const key = await page.getByTestId("jog-card").first().getAttribute("data-loop-key");
  const coordinates = await loopCoordinates(page);
  await page.locator(".hb-pin-start").click();
  await expectFolded(page);
  await expect(page.getByTestId("jog-card").first()).toHaveAttribute("data-loop-key", key!);
  expect(await loopCoordinates(page)).toBe(coordinates);
});
