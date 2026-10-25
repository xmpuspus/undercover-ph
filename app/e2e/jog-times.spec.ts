import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Acceptance for SPEC J-U8 (app/src/lib/jog/SPEC.md). Most races and many club runs start before sunrise or after
// sunset, but the hour picker lists only the shade slots, 6:00 AM to 6:30 PM. In Run a loop it also offers 4:00 to
// 5:30 AM and 7:00 to 9:00 PM, so a runner can plan a dark run ahead. Walking keeps its slots as they are.

const manifest = JSON.parse(readFileSync(new URL("../public/data/areas/metro-core/manifest.json", import.meta.url), "utf8")) as { dates: string[] };
const DARK = "Shade does not apply before sunrise or after sunset.";
const EARLY = [240, 270, 300, 330];
const LATE = [1140, 1170, 1200, 1230, 1260];

// The time chips show once an area is loaded: after a run start, or after a walk destination.
async function open(page: Page, hhmm: string, run: boolean) {
  await page.goto(`/?now=${manifest.dates[0]}T${hhmm}`);
  await expect(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("pick-shade").click();
  const field = run ? "jog-start-input" : "destination-input";
  if (run) {
    await page.getByTestId("mode-run").click();
    await page.getByTestId("jog-km-3").click();
  }
  await page.getByTestId(field).fill(run ? "Ayala Triangle Gardens" : "Greenbelt");
  await page.getByTestId("place-option").filter({ has: page.getByText(run ? "Ayala Triangle Gardens" : "Greenbelt", { exact: true }) }).first().click();
  await expect(page.getByTestId("hour-chip")).toBeVisible({ timeout: 60_000 });
}

async function tomorrow(page: Page) {
  await page.getByTestId("date-chip").click();
  await page.locator('[data-testid="date-option"][data-label="Tomorrow"]').click();
  await expect(page.getByTestId("date-chip")).toContainText("Tomorrow");
}

test("Run a loop offers pre-dawn and evening start times for tomorrow, and a 5 AM run is dark", async ({ page }) => {
  await open(page, "20:00", true);
  await tomorrow(page);
  await page.getByTestId("hour-chip").click();
  for (const min of [...EARLY, ...LATE]) await expect(page.getByTestId(`hour-option-${min}`)).toBeVisible();
  await page.getByTestId("hour-option-300").click();
  await expect(page.getByTestId("hour-chip")).toContainText("5 AM");
  const card = page.getByTestId("jog-card").first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText(DARK);
});

test("tonight's later run times stay on offer after the last shade slot", async ({ page }) => {
  await open(page, "19:10", true);
  await page.getByTestId("hour-chip").click();
  for (const min of [1200, 1230, 1260]) await expect(page.getByTestId(`hour-option-${min}`)).toBeVisible();
  await expect(page.getByTestId("hour-option-1140")).toHaveCount(0);
});

test("walking keeps only the shade slots", async ({ page }) => {
  await open(page, "20:00", false);
  await tomorrow(page);
  await page.getByTestId("hour-chip").click();
  await expect(page.getByTestId("hour-option-360")).toBeVisible();
  for (const min of [...EARLY, ...LATE]) await expect(page.getByTestId(`hour-option-${min}`)).toHaveCount(0);
});
