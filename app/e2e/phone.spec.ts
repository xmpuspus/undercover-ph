import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The phone layout: the map keeps most of the screen, and no control sits under another one.
const manifest = JSON.parse(readFileSync(new URL("../public/data/manifest.json", import.meta.url), "utf8")) as { dates: string[] };
const NOW = `${manifest.dates[0]}T09:00`;
const TRIP = `#start=Ayala%20MRT%20Station&end=Greenbelt&date=${manifest.dates[1]}&time=1500&mode=shade`;

async function openTrip(page: Page) {
  await page.goto(`/?now=${NOW}&map=eager${TRIP}`);
  await expect(page.getByTestId("route-peek")).toBeVisible({ timeout: 60_000 });
}

// True when a tap at the centre of the element reaches the element itself.
async function reachable(page: Page, testid: string) {
  const box = await page.getByTestId(testid).boundingBox();
  expect(box, testid).not.toBeNull();
  return page.evaluate(
    ([x, y, id]) => !!document.elementFromPoint(x as number, y as number)?.closest(`[data-testid="${id}"]`),
    [box!.x + box!.width / 2, box!.y + box!.height / 2, testid],
  );
}

test("the map keeps most of the phone screen and every control can be tapped", async ({ page }) => {
  await openTrip(page);
  await expect(page.getByTestId("prototype-banner")).toContainText("Not a government service");
  const geo = await page.evaluate(() => {
    const chips = document.querySelector('[data-testid="when-chip"]')!.getBoundingClientRect();
    const sun = document.querySelector('[data-testid="sun-chip"]')!.getBoundingClientRect();
    const panel = document.querySelector('[data-testid="panel"]')!.getBoundingClientRect();
    return { band: (panel.top - chips.bottom) / innerHeight, oneRow: Math.abs(chips.top - sun.top) < 2, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  console.log(`[phone] map band ${Math.round(geo.band * 100)}%`);
  expect(geo.band).toBeGreaterThan(0.5);
  expect(geo.oneRow).toBe(true);
  expect(geo.overflow).toBe(0);
  for (const id of ["when-chip", "heat-chip", "sun-chip", "peek-summary", "peek-steps", "peek-navigate", "map-play"]) {
    expect(await reachable(page, id), id).toBe(true);
  }
});

test("the route sheet opens to the full card and closes again", async ({ page }) => {
  await openTrip(page);
  await page.getByTestId("peek-summary").tap();
  await expect(page.getByTestId("route-card")).toBeVisible();
  await expect(page.getByTestId("goal-dry")).toBeVisible();
  expect(await reachable(page, "show-steps")).toBe(true);
  await page.getByTestId("sheet-collapse").tap();
  await expect(page.getByTestId("route-peek")).toBeVisible();
});

test.describe("small phone", () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test("the steps list can always be closed", async ({ page }) => {
    await openTrip(page);
    await page.getByTestId("peek-steps").tap();
    await expect(page.getByTestId("steps")).toBeVisible();
    expect(await reachable(page, "steps-back")).toBe(true);
    await page.getByTestId("steps-back").tap();
    await expect(page.getByTestId("route-peek")).toBeVisible();
  });
});
