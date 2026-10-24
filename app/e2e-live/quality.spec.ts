import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Live route-quality suite, PLAN.md item 19 (2026-10-23). One trip per area at 08:00, 12:00 and 16:00 on the
// second live date. It checks the walker properties from tmp/improve-plan-20261023/behaviour.md that a route
// that still draws can break, which live.spec.ts does not see:
// - P1: no shown route has more minutes in sun than the shortest walk.
// - P4rule: the recommended walk, when it is not the shortest, is at most 20% longer and has at least 15% less sun.
// - P7: minutes equal ceil(metres / 66), a pace of 1.1 m/s.
// - P7text: the card shows the same minutes as its data.
// It reads the route card's data attributes (data-distance-m, data-minutes, data-sun-minutes, data-label).
// Run: pnpm exec playwright test -c e2e-live/live.config.ts quality (one worker, about 40 minutes).

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const areas: { id: string }[] = read("../public/data/areas.json").areas;
const index: { name: string }[] = read("../public/data/places_index.json");
const pairs: Record<string, [string, string][]> = read("../../pipeline/districts/routes.json");
const count = new Map<string, number>();
const spelling = new Map<string, string>();
for (const p of index) {
  count.set(p.name.toLowerCase(), (count.get(p.name.toLowerCase()) ?? 0) + 1);
  spelling.set(p.name.toLowerCase(), p.name);
}
const once = (n: string) => count.get(n.toLowerCase()) === 1;
const named = (n: string) => spelling.get(n.toLowerCase()) ?? n;
const TIMES = ["0800", "1200", "1600"];

interface Shown {
  label: string;
  metres: number;
  minutes: number;
  sun: number;
  text: string;
}

async function shownRoutes(page: Page): Promise<Shown[]> {
  const card = page.getByTestId("route-card").first();
  const tabs = page.getByTestId("route-tab");
  const n = Math.max(1, await tabs.count());
  const out: Shown[] = [];
  for (let i = 0; i < n; i++) {
    if (n > 1) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
    }
    await expect(card).toHaveAttribute("data-minutes", /^\d+$/);
    out.push({
      label: (await card.getAttribute("data-label")) ?? "",
      metres: Number(await card.getAttribute("data-distance-m")),
      minutes: Number(await card.getAttribute("data-minutes")),
      sun: Number(await card.getAttribute("data-sun-minutes")),
      text: await card.innerText(),
    });
  }
  return out;
}

for (const a of areas) {
  const pair = (pairs[a.id] ?? []).find(([x, y]) => once(x) && once(y));
  test(`${a.id}: route quality at 08:00, 12:00 and 16:00`, async ({ page, request }) => {
    expect(pair, `${a.id} has no route-check pair with names unique across areas`).toBeTruthy();
    const [from, to] = [named(pair![0]), named(pair![1])];
    const m = (await (await request.get(`/data/areas/${a.id}/manifest.json`)).json()) as { dates: string[] };
    const date = m.dates[1];
    const problems: string[] = [];
    for (const time of TIMES) {
      const hash = new URLSearchParams({ area: a.id, start: from, end: to, date, time, mode: "shade" }).toString();
      await page.goto(`/#${hash}`);
      const card = page.getByTestId("route-card").or(page.getByTestId("route-peek")).or(page.getByTestId("route-state")).first();
      await expect(card).toBeVisible({ timeout: 90_000 });
      if (await page.getByTestId("route-peek").isVisible()) await page.getByTestId("peek-summary").tap();
      if (!(await page.getByTestId("route-card").count())) {
        problems.push(`${time}: no route card (${(await card.innerText()).slice(0, 80)})`);
        continue;
      }
      const shown = await shownRoutes(page);
      const shortest = shown.find((r) => /shortest/i.test(r.label));
      if (!shortest) {
        problems.push(`${time}: no route labelled shortest among ${shown.map((r) => r.label).join(", ")}`);
        continue;
      }
      for (const r of shown) {
        if (r.sun > shortest.sun + 0.05) problems.push(`${time} P1: ${r.label} has ${r.sun} min in sun, shortest ${shortest.sun}`);
        if (r.minutes !== Math.ceil(r.metres / 66)) problems.push(`${time} P7: ${r.label} ${r.metres} m shows ${r.minutes} min`);
        if (!r.text.includes(`${r.minutes} min`)) problems.push(`${time} P7text: ${r.label} card text lacks "${r.minutes} min"`);
      }
      const rec = shown.find((r) => /recommended/i.test(r.label) && !/shortest/i.test(r.label));
      if (rec) {
        if (rec.metres > shortest.metres * 1.2 + 1) problems.push(`${time} P4rule: recommended ${rec.metres} m against shortest ${shortest.metres} m`);
        if (rec.sun > shortest.sun * 0.85 + 0.05) problems.push(`${time} P4rule: recommended ${rec.sun} min in sun against shortest ${shortest.sun}`);
      }
    }
    expect(problems, `${a.id} ${from} to ${to} on ${date}`).toEqual([]);
  });
}
