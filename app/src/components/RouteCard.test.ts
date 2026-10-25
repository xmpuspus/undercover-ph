/// <reference types="node" />
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toDisplay } from "../lib/display";
import { findRoutes, loadData, searchPlaces } from "../lib/router/index";
import { DAY, fan, makeData, NIGHT, query } from "../lib/router/__tests__/helpers";
import type { FetchLike, Mode, Result } from "../lib/router/types";
import { fmtDuration, headline, noRouteText, RouteCard } from "./RouteCard";

// The headline for every route on screen, keyed by its tab title.
function heads(r: Result, mode: Mode = "shade") {
  const display = toDisplay(r, mode);
  return Object.fromEntries(display.map((d) => [d.title, headline(d, display, r, mode)]));
}

// The card as static HTML, with the first route selected, as text without tags.
function cardText(r: Result, mode: Mode = "shade"): string {
  const display = toDisplay(r, mode);
  const end = { label: "End", sub: "", area: "metro-core", node: 1, lon: 0, lat: 0, snap_m: null };
  const none = () => {};
  const html = renderToStaticMarkup(
    createElement(RouteCard, {
      display,
      selected: 0,
      onSelect: none,
      result: r,
      mode,
      from: { ...end, label: "Start", node: 0 },
      to: end,
      onEdit: none,
      when: "today at 3 PM",
      includeUnchecked: false,
      onIncludeUnchecked: none,
      onSteps: none,
      onNavigate: none,
      onAbout: none,
      dataDate: "Oct 21",
      compact: false,
      toggles: createElement("span"),
      onHighlight: none,
    }),
  );
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("fmtDuration", () => {
  it("gives seconds under a minute and minutes from one minute up", () => {
    expect(fmtDuration(0)).toBe("0 min");
    expect(fmtDuration(0.2)).toBe("12 sec");
    expect(fmtDuration(0.9)).toBe("54 sec");
    expect(fmtDuration(1)).toBe("1 min");
    expect(fmtDuration(1.3)).toBe("1.3 min");
  });
});

describe("route card headline", () => {
  it("compares each route with the shortest when a recommended route exists", () => {
    // Straight 400 m in sun, a 7.7% detour at half shade, and a 41% detour in full tree shade.
    const r = findRoutes(fan([{ y: 0 }, { y: 80, building: 50 }, { y: 200, tree: 100 }]).data, query());
    expect(heads(r)).toEqual({
      Recommended: { big: "2.8 min less sun", small: "than the shortest walk", size: "hero" },
      Shortest: { big: "6.1 min more sun", small: "than the most shaded walk", size: "large" },
      "Most shaded": { big: "6.1 min less sun", small: "than the shortest walk", size: "hero" },
    });
  });

  it("says what a shadier but much longer walk costs when the shortest is recommended", () => {
    // The tree-shaded walk is 41% longer, past the 20% limit, so the shortest is recommended (QA D-01).
    const r = findRoutes(fan([{ y: 0 }, { y: 200, tree: 100 }]).data, query());
    expect(r.recommendedIsShortest).toBe(true);
    const h = heads(r);
    expect(h["Recommended and Shortest"]).toEqual({ big: "2 min less walking", small: "than the most shaded walk, for 6.1 min more sun", size: "large" });
    expect(h["Most shaded"]).toEqual({ big: "6.1 min less sun", small: "than the shortest walk", size: "hero" });
  });

  it("calls a small gap small, in seconds and without the hero style", () => {
    // The 10% shade detour cuts sun by 0.5 min, under the 15% the rule needs, at the same walking minutes.
    const r = findRoutes(fan([{ y: 0 }, { y: 30, building: 10 }]).data, query());
    expect(r.recommendedIsShortest).toBe(true);
    expect(heads(r)).toEqual({
      "Recommended and Shortest": { big: "Only 30 sec more sun", small: "than the most shaded walk", size: "plain" },
      "Most shaded": { big: "30 sec less sun", small: "than the shortest walk", size: "plain" },
    });
  });

  it("says the shortest is also the shadiest only when no other route is on screen", () => {
    const r = findRoutes(fan([{ y: 0, building: 100 }, { y: 80 }]).data, query());
    expect(r.routes.map((x) => x.label)).toEqual(["shortest"]);
    expect(heads(r)).toEqual({ "Recommended and Shortest": { big: "The shortest walk is the most shaded", small: null, size: "plain" } });
  });

  it("uses roof words in rain mode", () => {
    const r = findRoutes(fan([{ y: 0, building: 100 }, { y: 80, flags: 1 }]).data, query({ mode: "rain" }));
    const h = heads(r, "rain");
    expect(h.Recommended).toEqual({ big: "6.1 min less time without a roof", small: "than the shortest walk", size: "hero" });
    expect(h.Shortest).toEqual({ big: "6.1 min more time without a roof", small: "than the recommended walk", size: "large" });
  });

  it("shows no headline at night", () => {
    const r = findRoutes(fan([{ y: 0 }, { y: 80, flags: 1 }]).data, query({ bucketIdx: NIGHT }));
    expect(Object.values(heads(r))).toEqual([null, null]);
  });
});

describe("route card text", () => {
  it("states the recommended rule once and drops notes the headline already says", () => {
    const r = findRoutes(fan([{ y: 0, building: 100 }, { y: 80 }]).data, query());
    expect(r.notes).toEqual(expect.arrayContaining(["No meaningfully shadier route.", "The most covered route is the shortest route."]));
    const text = cardText(r);
    // A note that no other line repeats stays on the card.
    expect(text).toContain("Crossing data is missing");
    expect(text).toContain("The shortest walk is the most shaded");
    expect(text).toContain("The recommended walk is at most 20% longer than the shortest and has at least 15% less time in sun. If no walk meets both rules, the app recommends the shortest.");
    expect(text).not.toContain("No meaningfully");
    expect(text).not.toContain("The most covered route is the shortest route.");
    expect(text).toContain("0 min in sun");
  });

  it("states the rule in roof words in rain mode", () => {
    const r = findRoutes(fan([{ y: 0 }, { y: 80, flags: 1 }]).data, query({ mode: "rain" }));
    expect(cardText(r, "rain")).toContain("has at least 15% less time without a roof.");
  });

  it("words night by the real sun", () => {
    const data = fan([{ y: 0, flags: 2 }]).data;
    data.manifest.sun = Object.fromEntries(
      data.manifest.dates.map((d) => [
        d,
        [
          [60, 90],
          [2.1, 250],
          [0, 260],
          [-5, 262],
        ] as [number, number][],
      ]),
    );
    const low = cardText(findRoutes(data, query({ bucketIdx: 1 })));
    expect(low).toContain("The sun is too low for shade. The shortest route is the most sheltered.");
    expect(low).toContain("Uses an underpass in low light.");
    expect(low).not.toContain("after dark");
    expect(low).not.toContain("The recommended walk is");
    const dark = cardText(findRoutes(data, query({ bucketIdx: 3 })));
    expect(dark).toContain("Shade does not apply after dark. The shortest route is the most sheltered.");
    expect(dark).toContain("Uses an underpass after dark. Madilim pag gabi.");
    expect(dark).not.toContain("The most sheltered route is the shortest route.");
  });

  it("gives seconds for a walk with under a minute in sun", () => {
    // 10 m in sun is 0.2 min after rounding up, which is 12 seconds.
    const r = findRoutes(makeData({ nodes: [[0, 0], [10, 0]], edges: [{ u: 0, v: 1 }] }), query({ bucketIdx: DAY }));
    expect(cardText(r)).toContain("12 sec in sun");
  });
});

describe("no-route text", () => {
  const notesOf = (r: Result) => r.notes;

  it("names both ends and the gated end, with the fix for unchecked paths", () => {
    const r = findRoutes(fan([{ y: 0, routable: false }]).data, query());
    expect(noRouteText(notesOf(r), "Glorietta", "Dasmariñas Village", ["Dasmariñas Village"])).toEqual({
      title: "No walking route from Glorietta to Dasmariñas Village.",
      fix: "Dasmariñas Village is behind a gate or inside a gated village. Include paths that may be gated or private, or pick a nearby street.",
    });
    expect(noRouteText(notesOf(r), "A", "B", []).fix).toBe("A route exists on paths that may be gated or private. Include those paths to see it.");
  });

  it("says try another time only when a closed place is the cause", () => {
    const hours = [{ name: "Glorietta", rules: { thu: ["10:00", "21:00"] }, source_url: "https://example.org/hours", checked: "2026-10-20" }];
    const closed = findRoutes(fan([{ y: 0, flags: 4, hours: 0, name: "Glorietta" }], { hours }).data, query({ departMin: 21 * 60 + 5 }));
    expect(noRouteText(notesOf(closed), "A", "B", []).fix).toBe("Every route between them passes through a place that is closed at this time. Try another time.");

    const apart = makeData({ nodes: [[0, 0], [100, 0], [300, 0], [400, 0]], edges: [{ u: 0, v: 1 }, { u: 2, v: 3 }] });
    const none = findRoutes(apart, query({ from: 0, to: 3 }));
    expect(noRouteText(notesOf(none), "A", "B", []).fix).toBe("No walking route connects them at any hour. Pick a nearby start or end.");
    expect(noRouteText(notesOf(none), "A", "B", ["B"]).fix).toBe("B is behind a gate or inside a gated village. Pick a nearby street.");
  });

  it("tells a step-free walker to turn it off when every route has steps", () => {
    const r = findRoutes(fan([{ y: 0, flags: 16 }]).data, query({ stepFree: true }));
    expect(noRouteText(notesOf(r), "A", "B", []).fix).toBe("Every route between them uses steps. Turn off Step-free to see them.");
  });
});

// QA D-01 on the pipeline's real files for metro-core, which holds Makati CBD. Skips until READY.graph and READY.shade exist.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public/data/areas/metro-core");
const mtime = (f: string) => (existsSync(join(DIR, f)) ? statSync(join(DIR, f)).mtimeMs : -1);
const READY = mtime("READY.graph") > 0 && mtime("READY.shade") >= mtime("READY.graph");

const diskFetch: FetchLike = async (url) => {
  if (!existsSync(url)) return { ok: false, status: 404, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = readFileSync(url);
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString("utf8")) as unknown, arrayBuffer: async () => new Uint8Array(buf).buffer };
};

describe.skipIf(!READY)("route card headline on real metro-core data", () => {
  it("never calls the shortest the shadiest while a shown route has less sun", async () => {
    const data = await loadData(DIR, diskFetch, { dateIdx: 1 }); // the second date, as below; loadData clamps it
    const dateIdx = Math.min(1, data.manifest.dates.length - 1); // the build rolls dates daily, so never pin one
    const bucketIdx = data.manifest.buckets_min.indexOf(13 * 60);
    expect(dateIdx).toBeGreaterThanOrEqual(0);
    expect(bucketIdx).toBeGreaterThanOrEqual(0);
    const from = searchPlaces(data, "Glorietta")[0];
    const to = searchPlaces(data, "Ayala Triangle Gardens")[0];
    const r = findRoutes(data, { from: from.node_id, to: to.node_id, dateIdx, bucketIdx, mode: "shade", stepFree: false, includeUnchecked: false, departMin: 13 * 60 });
    expect(r.state).toBe("ok");
    const display = toDisplay(r, "shade");
    const short = display.find((d) => d.labels.includes("shortest"));
    if (!short) throw new Error("no shortest route");
    const head = headline(short, display, r, "shade");
    const lessSun = display.filter((d) => d !== short && short.route.sun_minutes - d.route.sun_minutes >= 0.1 - 1e-9);
    console.log("D01_GLORIETTA_TRIANGLE", JSON.stringify({ head, routes: display.map((d) => [d.title, d.route.length_m, d.route.minutes, d.pct, d.route.sun_minutes]) }));
    expect(head).not.toBeNull();
    if (lessSun.length > 0) expect(head?.big).not.toMatch(/most shaded/);
    // The card's rule line must hold: a shown route that meets it is the recommended route.
    if (r.recommendedIsShortest) {
      for (const d of lessSun) {
        const meets = d.route.length_m <= short.route.length_m * 1.2 && d.route.sun_minutes <= short.route.sun_minutes * 0.85;
        expect(meets).toBe(false);
      }
    }
  });

  it("keeps the rule line true over 300 random walks", async () => {
    const data = await loadData(DIR, diskFetch, { dateIdx: 1 }); // the second date, as below; loadData clamps it
    const dateIdx = Math.min(1, data.manifest.dates.length - 1); // the build rolls dates daily, so never pin one
    const nodes: number[] = [];
    for (let i = 0; i < data.nodeCount; i++) if (data.routableNode[i]) nodes.push(i);
    let seed = 20261022;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    let checked = 0;
    let broken = 0;
    for (let tries = 0; checked < 300 && tries < 20000; tries++) {
      const a = nodes[Math.floor(rnd() * nodes.length)];
      const b = nodes[Math.floor(rnd() * nodes.length)];
      const dist = Math.hypot(data.nodeX[a] - data.nodeX[b], data.nodeY[a] - data.nodeY[b]);
      if (dist < 300 || dist > 2500) continue;
      const minute = [480, 600, 720, 780, 900, 960][tries % 6];
      const r = findRoutes(data, { from: a, to: b, dateIdx, bucketIdx: data.manifest.buckets_min.indexOf(minute), mode: "shade", stepFree: false, includeUnchecked: false, departMin: minute });
      if (r.state !== "ok") continue;
      checked++;
      if (!r.recommendedIsShortest) continue;
      const s = r.routes.find((x) => x.label === "shortest");
      const m = r.routes.find((x) => x.label === "most");
      // Shown numbers are rounded, so allow 1 m and 0.1 min of slack at the limits.
      if (s && m && m.length_m <= s.length_m * 1.2 - 1 && m.sun_minutes <= s.sun_minutes * 0.85 - 0.1) broken++;
    }
    expect(checked).toBe(300);
    expect(broken).toBe(0);
  }, 120000);
});
