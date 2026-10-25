import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const OUT = process.env.LIVE_OUT ?? "test-results/live";
mkdirSync(OUT, { recursive: true });

// One trip per area, plus a trip across the MOA and airport seam.
const TRIPS: [string, string, string][] = [
  ["metro-core", "Ayala MRT Station", "Greenbelt"],
  ["pasay-moa", "SM Mall of Asia", "SMX Convention Center"],
  ["cubao-eastwood", "Gateway Mall 1", "Smart Araneta Coliseum"],
  ["qc-north", "TriNoma", "SM City North Edsa"],
  ["manila", "Intramuros", "Manila City Hall"],
  ["alabang", "Alabang Town Center", "Festival Alabang"],
  ["north-coast", "Yamaha Monumento LRT Station", "Malabon City Hall"],
  ["marikina", "Riverbanks Center", "Marikina City Hall"],
  ["paranaque-airport", "Parañaque Integrated Terminal Exchange", "Ayala Malls Manila Bay"],
  ["las-pinas", "Robinsons Place Las Piñas", "Las Piñas City Hall"],
  ["paranaque-bf-aguirre", "SM City BF Parañaque", "Aguirre Central Park"],
  ["taguig-pateros", "Ayala Malls Arca South", "New Taguig City Hall"],
  ["qc-commonwealth-fairview", "SM City Fairview", "Fairview Center Mall"],
  ["qc-banawe", "Fisher Mall Quezon Avenue", "St. Luke's Medical Center"],
  ["seam", "SM Mall of Asia", "Ayala Malls Manila Bay"],
];

// One trip per area outside Metro Manila: the first route-check pair whose two names appear once in the whole
// place list, so the search box cannot pick a same-named place in another area. The list comes from this
// checkout, so run the test against a deploy of the same commit.
const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const areas: { id: string; region?: { id: string } }[] = read("../public/data/areas.json").areas;
const index: { name: string }[] = read("../public/data/places_index.json");
const pairs: Record<string, [string, string][]> = read("../../pipeline/districts/routes.json");
const seen = new Map<string, number>();
const spelling = new Map<string, string>();
for (const p of index) {
  seen.set(p.name.toLowerCase(), (seen.get(p.name.toLowerCase()) ?? 0) + 1);
  spelling.set(p.name.toLowerCase(), p.name);
}
const once = (n: string) => seen.get(n.toLowerCase()) === 1;
// The search option matches the exact text, so the trip uses the place list's spelling.
const named = (n: string) => spelling.get(n.toLowerCase()) ?? n;
for (const a of areas.filter((x) => x.region && x.region.id !== "ncr")) {
  const pair = (pairs[a.id] ?? []).find(([x, y]) => once(x) && once(y));
  if (pair) TRIPS.push([a.id, named(pair[0]), named(pair[1])]);
  else TRIPS.push([a.id, "(no pair with unique names)", ""]);
}

async function pickPlace(page: Page, inputId: string, text: string) {
  await page.getByTestId(inputId).fill(text);
  const option = page.getByTestId("place-option").filter({ has: page.getByText(text, { exact: true }) }).first();
  await expect(option).toBeVisible();
  await option.click();
}

for (const [area, from, to] of TRIPS) {
  test(`${area}: ${from} to ${to}`, async ({ page }) => {
    expect(to, `${area} has no route-check pair with names unique across areas`).not.toBe("");
    const errors: string[] = [];
    // A bare "Error" text gives no cause, so keep each Error's message and stack top.
    page.on("console", async (m) => {
      if (m.type() !== "error") return;
      const args = await Promise.all(m.args().map((x) => x.evaluate((v) => (v instanceof Error ? `${v.name}: ${v.message} ${String(v.stack).split("\n")[1] ?? ""}` : String(v))).catch(() => m.text())));
      errors.push(`${args.join(" ")} @ ${m.location().url}`);
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    // The map logs a dropped tile only as a warning, so check the app's own data files by status instead.
    const data: string[] = [];
    page.on("response", (r) => {
      if (/\/data\/(buildings|trees)\.pmtiles|\/shade\/.*\.bin\.gz|\/graph\.json/.test(r.url())) data.push(`${r.status()} ${r.url().split("/data/")[1]}`);
    });
    await page.goto("/");
    await expect(page.getByTestId("pick-shade")).toBeEnabled({ timeout: 90_000 });
    await page.getByTestId("pick-shade").click();
    await pickPlace(page, "destination-input", to);
    await pickPlace(page, "from-input", from);
    const card = page.getByTestId("route-card");
    const peek = page.getByTestId("route-peek");
    const state = page.getByTestId("route-state");
    const cross = page.getByTestId("cross-area");
    await expect(card.or(peek).or(state).or(cross).first()).toBeVisible({ timeout: 90_000 });
    let result = "";
    if (await state.isVisible()) result = `state ${await state.getAttribute("data-state")}: ${(await state.innerText()).replace(/\s+/g, " ")}`;
    else if (await cross.isVisible()) result = `cross-area: ${(await cross.innerText()).replace(/\s+/g, " ")}`;
    else {
      // Phones show the short route peek, wider screens the full card.
      const shown = (await peek.isVisible()) ? peek : card;
      result = `route: ${(await shown.innerText({ timeout: 10_000 }).catch(() => "no text")).replace(/\s+/g, " ").slice(0, 160)}`;
      await expect(page.getByTestId("map")).toHaveAttribute("data-idle", "1", { timeout: 90_000 }).catch(() => {});
    }
    await page.screenshot({ path: `${OUT}/${area}.png` });
    const line = JSON.stringify({ area, from, to, result, url: page.url().split("#")[1] ?? "", errors, data: data.length });
    appendFileSync(`${OUT}/results.jsonl`, line + "\n");
    console.log(line);
    expect(result.startsWith("route:"), result).toBe(true);
    expect(errors, errors.join("\n")).toEqual([]);
    expect(data.length, "no app data requests seen").toBeGreaterThan(0);
    expect(data.filter((d) => !/^2\d\d /.test(d)), data.join("\n")).toEqual([]);
  });
}
