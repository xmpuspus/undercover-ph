import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Acceptance for the phone layout of Run a loop, SPEC J-U6 (app/src/lib/jog/SPEC.md). On 2026-10-24 the run panel
// kept its full form under the cards and covered 550 of the map's 763 px, so a 5 km loop fitted at zoom 12.7 into
// 149 px. Once loops show, the form folds into one summary line with an Edit button and the loop gets the map.

const manifest = JSON.parse(readFileSync(new URL("../public/data/areas/metro-core/manifest.json", import.meta.url), "utf8")) as { dates: string[] };
const AT = `/?now=${manifest.dates[0]}T07:00`;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function loops(page: Page, place: string, km: string) {
  await page.addInitScript(() => {
    let lib: unknown;
    Object.defineProperty(window, "maplibregl", {
      configurable: true,
      get: () => lib,
      set: (value: { Map: new (o: unknown) => unknown }) => {
        lib = value;
        const Native = value.Map;
        value.Map = class extends (Native as new (o: unknown) => object) {
          constructor(o: unknown) { super(o); (window as unknown as { qaMap: unknown }).qaMap = this; }
        } as never;
      },
    });
  });
  await page.goto(AT);
  await expect(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("pick-shade").click();
  await page.getByTestId("mode-run").click();
  // Picking a start searches at once and folds the form, so the distance comes first, as a runner sets it.
  await page.getByTestId(`jog-km-${km}`).click();
  await page.getByTestId("jog-start-input").fill(place);
  await page.getByTestId("place-option").filter({ has: page.getByText(place, { exact: true }) }).first().click();
  await expect(page.getByTestId("jog-card").first()).toBeVisible({ timeout: 60_000 });
}

// The loop line's box on screen, after the camera settles.
async function loopBox(page: Page) {
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    type M = { queryRenderedFeatures(o: unknown): { geometry: { type: string; coordinates: number[][] | number[][][] } }[]; project(c: number[]): { x: number; y: number }; isMoving(): boolean; getZoom(): number };
    const m = (window as unknown as { qaMap: M }).qaMap;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of m.queryRenderedFeatures({ layers: ["jog-line"] })) {
      const cs = f.geometry.type === "LineString" ? (f.geometry.coordinates as number[][]) : (f.geometry.coordinates as number[][][]).flat();
      for (const c of cs) {
        const p = m.project(c);
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    }
    return { x0, y0, x1, y1, zoom: m.getZoom() };
  });
}

for (const [place, km] of [["Mall of Asia Eye", "5"], ["Ayala Triangle Gardens", "3"]] as const) {
  test(`a ${km} km loop from ${place} folds the form and fills the map above the panel`, async ({ page }) => {
    await loops(page, place, km);
    const panel = (await page.getByTestId("jog-panel").boundingBox())!;
    expect(panel.height).toBeLessThanOrEqual(0.45 * 844);
    await expect(page.getByTestId("jog-start-input")).toBeHidden();
    await expect(page.getByTestId("jog-summary")).toContainText(place);
    await expect(page.getByTestId("jog-summary")).toContainText(`${km} km`);
    await expect(page.getByTestId("jog-edit")).toBeVisible();
    const box = await loopBox(page);
    // Every point of the loop sits on the map above the panel, and the loop spans at least half of that space in
    // one direction.
    expect(box.y0).toBeGreaterThanOrEqual(0);
    expect(box.y1).toBeLessThanOrEqual(panel.y);
    expect(box.x0).toBeGreaterThanOrEqual(0);
    expect(box.x1).toBeLessThanOrEqual(390);
    expect(Math.max((box.x1 - box.x0) / 390, (box.y1 - box.y0) / panel.y)).toBeGreaterThanOrEqual(0.5);
  });
}

test("Edit opens the form again and keeps the loops; a new distance searches again", async ({ page }) => {
  await loops(page, "Ayala Triangle Gardens", "3");
  const first = await page.getByTestId("jog-card").first().getAttribute("data-loop-key");
  await page.getByTestId("jog-edit").click();
  await expect(page.getByTestId("jog-start-input")).toBeVisible();
  await expect(page.getByTestId("jog-card").first()).toHaveAttribute("data-loop-key", first!);
  await page.getByTestId("jog-km-5").click();
  await expect.poll(async () => page.getByTestId("jog-card").first().getAttribute("data-loop-key"), { timeout: 60_000 }).not.toBe(first);
  await expect(page.getByTestId("jog-start-input")).toBeHidden();
});

test("each card can be marked as run from the folded panel", async ({ page }) => {
  await loops(page, "Ayala Triangle Gardens", "3");
  const cards = page.getByTestId("jog-card");
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await cards.nth(i).scrollIntoViewIfNeeded();
    await expect(cards.nth(i).getByTestId("jog-mark-run")).toBeVisible();
  }
});
