import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// PLAN.md item 21 (2026-10-23): behaviour that no test covered. Sheltered end to end, a no-route card, a start
// from the phone's location, and the PAGASA advisory bar with a stubbed advisory.

const manifest = JSON.parse(readFileSync(new URL("../public/data/areas/metro-core/manifest.json", import.meta.url), "utf8")) as { dates: string[] };
const DAY = manifest.dates[0];
const NOW = `${DAY}T09:00`;
const tripOf = (href: string) => new URLSearchParams(new URL(href).hash.replace(/^#/, ""));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function pickPlace(page: Page, inputId: string, text: string) {
  await page.getByTestId(inputId).fill(text);
  const option = page.getByTestId("place-option").filter({ has: page.getByText(text, { exact: true }) }).first();
  await expect(option).toBeVisible();
  await option.click();
}

async function start(page: Page, mode: "shade" | "rain" = "shade") {
  await page.goto(`/?now=${NOW}`);
  await expect(page.getByTestId(`pick-${mode}`)).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId(`pick-${mode}`).click();
}

test("Sheltered plans a roof-cover walk end to end and keeps the mode in the link", async ({ page }) => {
  await start(page, "rain");
  await pickPlace(page, "destination-input", "Greenbelt");
  await pickPlace(page, "from-input", "Ayala MRT Station");
  const card = page.getByTestId("route-card").first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  expect(tripOf(page.url()).get("mode")).toBe("rain");
  await expect(card).toContainText(/sheltered|roof/i);
  // A reload keeps Sheltered.
  await page.reload();
  await expect(page.getByTestId("route-card").first()).toBeVisible({ timeout: 60_000 });
  expect(tripOf(page.url()).get("mode")).toBe("rain");
});

test("a trip into a closed compound gets a no-route card that says what to do", async ({ page }) => {
  // The CIDG headquarters sit inside Camp Crame. Its ways are closed to the public, so no walk reaches it.
  await start(page);
  await pickPlace(page, "destination-input", "Criminal Investigation and Detection Group, Headquarters");
  await pickPlace(page, "from-input", "Greenbelt");
  const state = page.getByTestId("route-state");
  await expect(state).toBeVisible({ timeout: 60_000 });
  await expect(state).toHaveAttribute("data-state", "no_route");
  await expect(page.getByTestId("state-fix")).not.toBeEmpty();
  await expect(page.getByTestId("route-card")).toHaveCount(0);
  await expect(page.getByTestId("app-error")).toHaveCount(0);
});

test.describe("with location permission near Ayala MRT", () => {
  test.use({ geolocation: { latitude: 14.54923, longitude: 121.02791 }, permissions: ["geolocation"] });
  test("Use my location starts the walk where the phone is", async ({ page }) => {
    await start(page);
    await pickPlace(page, "destination-input", "Greenbelt");
    await page.getByTestId("use-location").click();
    await expect(page.getByTestId("route-card").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("trip-notice")).toHaveCount(0);
  });
});

test.describe("with location permission denied", () => {
  test.use({ permissions: [] });
  test("a denied location says so and leaves the start to pick", async ({ page, context }) => {
    await context.clearPermissions();
    await start(page);
    await pickPlace(page, "destination-input", "Greenbelt");
    await page.getByTestId("use-location").click();
    await expect(page.getByTestId("trip-notice")).toContainText(/location/i, { timeout: 20_000 });
    await expect(page.getByTestId("route-card")).toHaveCount(0);
  });
});

// Issued 30 minutes before the trip, so its 2-hour window covers the departure.
async function stubAdvisory(page: Page, where: string, cities: string[]) {
  const [y, m, d] = DAY.split("-").map(Number);
  const issued = `8:30 AM, ${d} ${MONTHS[m - 1]} ${y}`;
  const body = JSON.stringify({
    status: "ok",
    source_url: "https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd",
    fetched_at: `${DAY}T08:35:00+08:00`,
    issued_at: issued,
    text: `Thunderstorm Advisory No. 1 #NCR_PRSD Issued at: ${issued} Moderate to heavy rainshowers with lightning and strong winds are expected over ${where} within the next 2 hours.`,
    cities,
  });
  await page.route("**/api/advisory*", (r) => r.fulfill({ status: 200, contentType: "application/json", body }));
  await page.route("**/data/**advisory.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body }));
}

test("an advisory that names only a province outside Metro Manila shows no bar", async ({ page }) => {
  await stubAdvisory(page, "Batangas (Lobo and Mabini)", []);
  await start(page);
  await pickPlace(page, "destination-input", "Greenbelt");
  await pickPlace(page, "from-input", "Ayala MRT Station");
  await expect(page.getByTestId("route-card").or(page.getByTestId("route-peek")).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("advisory")).toHaveCount(0);
});

test("a PAGASA thunderstorm advisory naming Makati shows on the trip", async ({ page }) => {
  await stubAdvisory(page, "Metro Manila (Makati and Taguig)", ["Makati", "Taguig"]);
  await start(page);
  await pickPlace(page, "destination-input", "Greenbelt");
  await pickPlace(page, "from-input", "Ayala MRT Station");
  await expect(page.getByTestId("route-card").or(page.getByTestId("route-peek")).first()).toBeVisible({ timeout: 60_000 });
  const bar = page.getByTestId("advisory");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("Makati");
  await expect(bar).toContainText(/thunderstorm/i);
});
