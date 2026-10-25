import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Acceptance for the jog loop finder in the browser, SPEC J-U1 to J-U4, J-H1 to J-H5, J-N1, J-C1, J-C3 and J-E11
// (app/src/lib/jog/SPEC.md). Ayala Triangle Gardens is in metro-core. "now" is pinned to the first
// manifest date, never to a fixed day.

const manifest = JSON.parse(readFileSync(new URL("../public/data/areas/metro-core/manifest.json", import.meta.url), "utf8")) as { dates: string[] };
const AT = (hhmm: string) => `/?now=${manifest.dates[0]}T${hhmm}`;
const SAFETY = "Safety here means traffic: crossings and road size. We have no crime data.";
const DARK = "Shade does not apply before sunrise or after sunset.";

async function pickPlace(page: Page, inputId: string, text: string) {
  await page.getByTestId(inputId).fill(text);
  const option = page.getByTestId("place-option").filter({ has: page.getByText(text, { exact: true }) }).first();
  await expect(option).toBeVisible();
  await option.click();
}

async function openRun(page: Page, hhmm: string) {
  await page.goto(AT(hhmm));
  await expect(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("pick-shade").click();
  await page.getByTestId("mode-run").click();
  await expect(page.getByTestId("jog-panel")).toBeVisible();
}

async function storedWays(page: Page): Promise<number[]> {
  return page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const open = indexedDB.open("ucph-jog");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("runs")) return resolve([]);
          const all = db.transaction("runs").objectStore("runs").getAll();
          all.onsuccess = () => resolve((all.result as { streets: number[][] }[]).flatMap((r) => r.streets.map((s) => s[0])));
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

const num = async (loc: ReturnType<Page["getByTestId"]>, attr: string) => Number(await loc.getAttribute(attr));

test("three 5 km loops from Ayala Triangle Gardens, one marked as run, then loops on new streets", async ({ page }) => {
  // URL and body of every request, until the export below. A download URL may hold the export itself.
  const sent: string[] = [];
  let recording = true;
  page.context().on("request", (r) => {
    if (recording && !/^(blob|data):/.test(r.url())) sent.push(`${r.url()}\n${r.postData() ?? ""}`);
  });
  await openRun(page, "07:00");
  await expect(page.getByTestId("jog-prefer-new")).toBeChecked();
  await pickPlace(page, "jog-start-input", "Ayala Triangle Gardens");
  await page.getByTestId("jog-km-5").click();

  const cards = page.getByTestId("jog-card");
  await expect(cards).toHaveCount(3, { timeout: 60_000 });
  for (let i = 0; i < 3; i++) {
    const len = await num(cards.nth(i), "data-length-m");
    expect(len).toBeGreaterThanOrEqual(4500);
    expect(len).toBeLessThanOrEqual(5500);
  }
  await expect(cards.first()).toContainText(SAFETY);
  await expect(cards.first()).toContainText(/km/);
  await expect(cards.first()).not.toContainText(DARK);

  // The map draws the chosen loop with direction arrows and a mark at each full km.
  const map = page.getByTestId("map");
  await expect.poll(async () => Number(await map.getAttribute("data-jog-km-marks"))).toBeGreaterThanOrEqual(4);
  await expect.poll(async () => Number(await map.getAttribute("data-jog-arrows"))).toBeGreaterThanOrEqual(3);

  // The search runs in a web worker, built from its own file.
  expect(sent.some((r) => /jogWorker/i.test(r.split("\n")[0]))).toBe(true);

  const markedKey = await cards.first().getAttribute("data-loop-key");
  const markedLen = await num(cards.first(), "data-length-m");
  await cards.first().getByTestId("jog-mark-run").click();
  await expect(page.getByTestId("jog-history-count")).toContainText("1");
  const ways = await storedWays(page);
  expect(ways.length).toBeGreaterThan(20);

  await page.getByTestId("jog-again").click();
  await expect.poll(async () => cards.first().getAttribute("data-loop-key"), { timeout: 60_000 }).not.toBe(markedKey);
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const card = cards.nth(i);
    expect(await card.getAttribute("data-loop-key")).not.toBe(markedKey);
    expect(await num(card, "data-shared-m")).toBeLessThanOrEqual(0.5 * markedLen);
    expect(await num(card, "data-new-pct")).toBeGreaterThanOrEqual(50);
  }

  // Export downloads the runs, and Clear history empties the store.
  recording = false;
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("jog-export").click()]);
  const exported = JSON.parse(readFileSync((await download.path())!, "utf8")) as { runs: unknown[] };
  expect(exported.runs).toHaveLength(1);
  await page.getByTestId("jog-clear").click();
  await expect(page.getByTestId("jog-history-count")).toContainText("0");
  expect(await storedWays(page)).toHaveLength(0);

  // No request carried the history: no URL, body or header holds a stored way id.
  const ids = [...new Set(ways)].filter((w) => String(w).length >= 7);
  expect(ids.length).toBeGreaterThan(3);
  for (const id of ids) for (const r of sent) expect(r.includes(String(id)), `way ${id} left the phone`).toBe(false);
});

test("a run after sunset says shade does not apply and shows mapped lights", async ({ page }) => {
  await openRun(page, "19:00");
  await pickPlace(page, "jog-start-input", "Ayala Triangle Gardens");
  const cards = page.getByTestId("jog-card");
  await expect(cards.first()).toBeVisible({ timeout: 60_000 });
  await expect(cards.first()).toContainText(DARK);
  await expect(cards.first()).toContainText(/mapped as lit/);
  await expect(cards.first()).toContainText(SAFETY);
});

test.describe("with location permission near Ayala Triangle Gardens", () => {
  test.use({ geolocation: { latitude: 14.5556, longitude: 121.0239 }, permissions: ["geolocation"] });
  test("a start from the phone's location never travels in the link as coordinates", async ({ page }) => {
    await openRun(page, "07:00");
    await page.getByTestId("jog-use-location").click();
    await expect(page.getByTestId("jog-card").first()).toBeVisible({ timeout: 60_000 });
    const hash = new URL(page.url()).hash;
    expect(hash).not.toMatch(/\d+\.\d{4,}/);
  });
});

test.describe("on a phone-size screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("three loop cards show and each can be marked as run", async ({ page }) => {
    await openRun(page, "07:00");
    await pickPlace(page, "jog-start-input", "Ayala Triangle Gardens");
    const cards = page.getByTestId("jog-card");
    await expect(cards).toHaveCount(3, { timeout: 60_000 });
    for (let i = 0; i < 3; i++) {
      await cards.nth(i).scrollIntoViewIfNeeded();
      await expect(cards.nth(i).getByTestId("jog-mark-run")).toBeVisible();
    }
  });
});
