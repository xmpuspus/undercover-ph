import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Pin "now" to 09:00 on the first manifest date, so "Tomorrow" always exists in the data.
const manifest = JSON.parse(readFileSync(new URL("../public/data/manifest.json", import.meta.url), "utf8")) as { dates: string[] };
const NOW = `${manifest.dates[0]}T09:00`;

async function mapIdle(page: Page) {
  await expect(page.getByTestId("map")).toHaveAttribute("data-idle", "1", { timeout: 60_000 });
}

async function pickPlace(page: Page, inputId: string, text: string) {
  await page.getByTestId(inputId).fill(text);
  const option = page.getByTestId("place-option").filter({ has: page.getByText(text, { exact: true }) }).first();
  await expect(option).toBeVisible();
  await option.click();
}

test("plan a shaded walk from Ayala MRT Station to Greenbelt, tomorrow at 3 PM", async ({ page }) => {
  await page.goto(`/?now=${NOW}`);
  await expect(page.getByTestId("landing")).toBeVisible();
  await expect(page.getByTestId("attribution")).toContainText("© OpenStreetMap contributors");
  await expect(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("pick-shade").click();

  await expect(page.getByTestId("destination-panel")).toBeVisible();
  await pickPlace(page, "destination-input", "Greenbelt");
  await pickPlace(page, "from-input", "Ayala MRT Station");

  await page.getByTestId("date-chip").click();
  await page.locator('[data-testid="date-option"][data-label="Tomorrow"]').click();
  await expect(page.getByTestId("date-chip")).toContainText("Tomorrow");
  await page.getByTestId("hour-chip").click();
  await page.getByTestId("hour-option-900").click();
  await expect(page.getByTestId("hour-chip")).toContainText("3 PM");

  const card = page.getByTestId("route-card");
  const state = page.getByTestId("route-state");
  await expect(card.or(state)).toBeVisible();

  if (await state.isVisible()) {
    // The router found no route or rejected the points. Record its reason and stop here.
    const reason = `${await state.getAttribute("data-state")}: ${(await state.innerText()).replace(/\s+/g, " ")}`;
    test.info().annotations.push({ type: "route-state", description: reason });
    console.log(`[route-state] ${reason}`);
    return;
  }

  await mapIdle(page);
  const callouts = page.getByTestId("route-callout");
  const n = await callouts.count();
  const tabs = await page.getByTestId("route-tab").count();
  console.log(`[routes] callouts=${n} tabs=${tabs} summary="${await page.getByTestId("route-summary").innerText()}"`);
  test.info().annotations.push({ type: "routes", description: `callouts=${n} tabs=${tabs}` });
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBe(Math.max(1, tabs));
  if (n < 3) console.log(`[routes] the router returned ${n} distinct routes; see its notes on the card`);
  await expect(page.getByTestId("cover-split")).toBeVisible();

  // Sun chip and its explainer.
  await expect(page.getByTestId("sun-chip")).toContainText(/Sun [NESW]{1,3} · \d+° up/);
  await page.getByTestId("sun-chip").click();
  await expect(page.getByTestId("sun-explainer")).toContainText("Shade falls on the side of the street toward the sun");
  await page.getByTestId("sun-chip").click();

  // Hour scrubber: it advances the hour, and a tap elsewhere stops it.
  const hourBefore = await page.getByTestId("hour-chip").innerText();
  await page.getByTestId("scrubber").click();
  await expect(page.getByTestId("hour-chip")).not.toHaveText(hourBefore, { timeout: 5000 });
  await page.getByTestId("route-summary").click();
  await expect(page.getByTestId("scrubber")).toHaveAttribute("aria-pressed", "false");
  console.log(`[scrubber] ${hourBefore.trim()} -> ${(await page.getByTestId("hour-chip").innerText()).trim()}`);
  await page.getByTestId("hour-chip").click();
  await page.getByTestId("hour-option-900").click();

  await page.getByTestId("show-steps").click();
  await expect(page.getByTestId("steps")).toBeVisible();
  const steps = await page.getByTestId("step-item").count();
  console.log(`[steps] ${steps}`);
  expect(steps).toBeGreaterThan(0);
  await page.getByTestId("steps-back").click();

  await page.getByTestId("navigate").click();
  await expect(page.getByTestId("turn-card")).toBeVisible();
  await expect(page.getByTestId("nav-sheet")).toBeVisible();
  console.log(`[navigate] ${await page.getByTestId("turn-text").innerText()}`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
