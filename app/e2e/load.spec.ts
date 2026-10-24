import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test, type Page, type Request, type Route } from "@playwright/test";

// Acceptance for PLAN.md items 9, 10, 12 and 13 (2026-10-23). On a phone over mobile data the first route took
// about 31 s: the app fetched places_index.json (5.5 MB decoded) before search showed anything, then the area's
// graph.json (9.6 MB for metro-core) with no sign of progress.
// - Item 9: search starts from data/search/top.json, a small index of well-known places in every area. The other
//   places load from more files under data/search/ without blocking it. The app never fetches places_index.json.
// - Item 10: the area graph loads only after a place is picked, as data/areas/<id>/graph.cols.json (column arrays,
//   6-decimal coordinates), at most 80% of graph.json's gzip size.
// - Item 12: while the area loads, a line with data-testid="load-progress" says so.
// - Item 13: a web manifest makes the app installable, and a service worker keeps the last trip working offline.

const manifest = JSON.parse(readFileSync(new URL("../public/data/areas/metro-core/manifest.json", import.meta.url), "utf8")) as { dates: string[] };
const NOW = `${manifest.dates[0]}T09:00`;
const GRAPH_JSON = readFileSync(new URL("../public/data/areas/metro-core/graph.json", import.meta.url));

async function pickPlace(page: Page, inputId: string, text: string) {
  await page.getByTestId(inputId).fill(text);
  const option = page.getByTestId("place-option").filter({ has: page.getByText(text, { exact: true }) }).first();
  await expect(option).toBeVisible();
  await option.click();
}

async function start(page: Page) {
  await page.goto(`/?now=${NOW}`);
  await expect(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("pick-shade").click();
}

test("the first suggestions come from top.json alone, and places_index.json is never fetched", async ({ page }) => {
  let fullIndex = 0;
  await page.route("**/data/places_index.json", (r) => {
    fullIndex++;
    return r.abort("failed");
  });
  // Every other search file waits until the first suggestion shows, so search cannot depend on it.
  const held: Route[] = [];
  let top: Request | null = null;
  await page.route("**/data/search/**", (r) => {
    if (new URL(r.request().url()).pathname.endsWith("/search/top.json")) {
      top = r.request();
      return r.continue();
    }
    held.push(r);
  });
  await start(page);
  await page.getByTestId("destination-input").fill("Greenbelt");
  await expect(page.getByTestId("place-option").filter({ has: page.getByText("Greenbelt", { exact: true }) }).first()).toBeVisible({ timeout: 15_000 });
  expect(top, "search must fetch data/search/top.json").not.toBeNull();
  const topBytes = (await (await top!.response())!.body()).length;
  expect(topBytes, "top.json must stay small").toBeLessThanOrEqual(300_000);

  // The rest of the places arrive later and join the search: a Cebu bus terminal is not a well-known place.
  await page.unroute("**/data/search/**");
  for (const r of held) await r.continue();
  await page.getByTestId("destination-input").fill("Cebu IT Park Transport Terminal");
  await expect(
    page.getByTestId("place-option").filter({ has: page.getByText("Cebu IT Park Transport Terminal", { exact: true }) }).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect(fullIndex, "the app must not fetch places_index.json").toBe(0);
  await expect(page.getByTestId("app-error")).toHaveCount(0);
});

test("the area graph loads only after a place is picked, in the smaller column file", async ({ page }) => {
  const graphs: Request[] = [];
  page.on("request", (r) => {
    if (/\/data\/areas\/[^/]+\/graph[^/]*$/.test(new URL(r.url()).pathname)) graphs.push(r);
  });
  await start(page);
  await page.getByTestId("destination-input").fill("Greenbelt");
  await expect(page.getByTestId("place-option").first()).toBeVisible({ timeout: 30_000 });
  expect(graphs, "no graph file before a place is picked").toHaveLength(0);

  await page.getByTestId("place-option").filter({ has: page.getByText("Greenbelt", { exact: true }) }).first().click();
  await pickPlace(page, "from-input", "Ayala MRT Station");
  await expect(page.getByTestId("route-card").first()).toBeVisible({ timeout: 60_000 });
  expect(graphs.map((r) => new URL(r.url()).pathname)).toEqual(["/data/areas/metro-core/graph.cols.json"]);
  const body = await (await graphs[0].response())!.body();
  expect(gzipSync(body).length).toBeLessThanOrEqual(0.8 * gzipSync(GRAPH_JSON).length);
});

test("a progress line shows while the area loads, and goes when the route is ready", async ({ page }) => {
  await page.route("**/data/areas/metro-core/graph.cols.json", async (r) => {
    await new Promise((done) => setTimeout(done, 4_000));
    await r.continue();
  });
  await start(page);
  await pickPlace(page, "destination-input", "Greenbelt");
  const progress = page.getByTestId("load-progress");
  await expect(progress).toBeVisible({ timeout: 3_000 });
  await expect(progress).toContainText("Loading");
  await pickPlace(page, "from-input", "Ayala MRT Station");
  await expect(page.getByTestId("route-card").first()).toBeVisible({ timeout: 60_000 });
  await expect(progress).toHaveCount(0);
});

test("the app is installable and the last trip still opens offline", async ({ page, context }) => {
  await page.goto(`/?now=${NOW}`);
  await expect(page.locator('link[rel="manifest"]'), "index.html must link a web manifest").toHaveCount(1);
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const web = (await (await page.request.get(new URL(href!, page.url()).href)).json()) as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: { sizes?: string }[];
  };
  expect(web.name).toBeTruthy();
  expect(web.start_url).toBeTruthy();
  expect(web.display).toBe("standalone");
  for (const size of ["192x192", "512x512"]) expect(web.icons?.some((i) => i.sizes?.split(" ").includes(size)), size).toBe(true);

  // The service worker takes control of this page, so the trip's files go through it.
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, undefined, { timeout: 30_000 });
  await expect(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("pick-shade").click();
  await pickPlace(page, "destination-input", "Greenbelt");
  await pickPlace(page, "from-input", "Ayala MRT Station");
  await expect(page.getByTestId("route-card").first()).toBeVisible({ timeout: 60_000 });
  const link = page.url();

  await context.setOffline(true);
  await page.goto(link);
  await expect(page.getByTestId("route-card").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("app-error")).toHaveCount(0);
});
