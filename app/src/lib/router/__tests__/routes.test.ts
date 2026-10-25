import { describe, expect, it } from "vitest";
import { aStar } from "../astar";
import { findRoutes, MAX_SNAP_M, openAt, searchPlaces, snapToNode } from "../index";
import type { Result, Route } from "../types";
import { DAY, edgeIdx, fan, HORIZON, makeData, NIGHT, pt, query, THURSDAY } from "./helpers";

function byLabel(r: Result, label: Route["label"]): Route {
  const route = r.routes.find((x) => x.label === label);
  if (!route) throw new Error(`no ${label} route in ${JSON.stringify(r.routes.map((x) => x.label))} (${r.notes.join(" | ")})`);
  return route;
}

const uses = (route: Route, edges: number[]) => edges.every((e) => edgeIdx(route.edgeIds).includes(e));

describe("three routes", () => {
  // Straight 400 m in sun, a 7.7% detour at half shade, and a 41% detour in full tree shade.
  const { data, via } = fan([{ y: 0 }, { y: 80, building: 50 }, { y: 200, tree: 100 }]);

  it("returns shortest, recommended, and most covered when a shaded detour exists", () => {
    const r = findRoutes(data, query());
    expect(r.state).toBe("ok");
    expect(r.routes.map((x) => x.label)).toEqual(["recommended", "shortest", "most"]);
    expect(r.recommendedIsShortest).toBe(false);
    const keys = new Set(r.routes.map((x) => x.edgeIds.join(",")));
    expect(keys.size).toBe(3);

    const s = byLabel(r, "shortest");
    const rec = byLabel(r, "recommended");
    const most = byLabel(r, "most");
    expect(uses(s, via[0])).toBe(true);
    expect(uses(rec, via[1])).toBe(true);
    expect(uses(most, via[2])).toBe(true);
    expect(rec.length_m).toBeLessThanOrEqual(s.length_m * 1.2);
    expect(rec.sun_minutes).toBeLessThanOrEqual(s.sun_minutes * 0.85);
    expect(most.length_m).toBeLessThanOrEqual(s.length_m * 1.5);
  });

  it("reports minutes, cover, and the split", () => {
    const r = findRoutes(data, query());
    const s = byLabel(r, "shortest");
    expect(s.length_m).toBe(400);
    expect(s.minutes).toBe(Math.ceil(400 / 66));
    expect(s.covered_pct).toBe(0);
    expect(s.sun_minutes).toBeCloseTo(6.1, 5);
    expect(s.split).toEqual({ roof_m: 0, building_m: 0, tree_m: 0, sun_m: 400 });
    const rec = byLabel(r, "recommended");
    expect(rec.covered_pct).toBe(50);
    expect(rec.split.building_m).toBe(Math.round(rec.split.sun_m));
    expect(rec.segments.map((x) => x.kind)).toEqual(["building"]);
    const most = byLabel(r, "most");
    expect(most.covered_pct).toBe(100);
    expect(most.sun_minutes).toBe(0);
    expect(most.segments.map((x) => x.kind)).toEqual(["tree"]);
    for (const route of r.routes) {
      const { roof_m, building_m, tree_m, sun_m } = route.split;
      expect(Math.abs(roof_m + building_m + tree_m + sun_m - route.length_m)).toBeLessThanOrEqual(2);
      expect(route.coords[0]).toEqual(pt(0, 0));
      expect(route.coords[route.coords.length - 1]).toEqual(pt(400, 0));
    }
  });

  it("drops the recommended route when the sun cut is under 15%", () => {
    // The detour has only 10% shade, so it cuts sun metres by about 9%.
    const { data: d2 } = fan([{ y: 0 }, { y: 30, building: 10 }]);
    const r = findRoutes(d2, query());
    expect(r.state).toBe("ok");
    expect(r.recommendedIsShortest).toBe(true);
    expect(r.routes.map((x) => x.label)).not.toContain("recommended");
    expect(r.notes).toContain("No meaningfully shadier route.");
  });

  it("recommends the most covered route when it meets the rule and the k = 2 route does not", () => {
    // At k = 2 the 405 m walk with 14% shade wins, but it cuts sun by only 13%.
    // The 440 m walk with 23% shade is 10% longer and cuts sun by 15.2%, so it is the recommended route.
    const fx = fan([{ y: 0 }, { y: 32, building: 14 }, { y: 92, building: 23 }]);
    const r = findRoutes(fx.data, query());
    expect(r.recommendedIsShortest).toBe(false);
    expect(r.routes.map((x) => x.label)).toEqual(["recommended", "shortest"]);
    expect(uses(byLabel(r, "recommended"), fx.via[2])).toBe(true);
    expect(r.notes).toContain("The most covered route is the recommended route.");
  });

  it("keeps the most covered route within a 50% detour", () => {
    // via 1 is fully covered but 80% longer. The cap must skip it.
    const fx = fan([{ y: 0 }, { y: 300, building: 100 }, { y: 180, building: 90 }, { y: 80, building: 50 }]);
    const r = findRoutes(fx.data, query());
    const s = byLabel(r, "shortest");
    const most = byLabel(r, "most");
    expect(uses(most, fx.via[1])).toBe(false);
    expect(uses(most, fx.via[2])).toBe(true);
    expect(most.length_m / s.length_m - 1).toBeLessThanOrEqual(0.5);
    expect(uses(byLabel(r, "recommended"), fx.via[3])).toBe(true);
  });

  it("walks every edge in both directions", () => {
    const r = findRoutes(data, query({ from: 1, to: 0 }));
    expect(r.state).toBe("ok");
    const s = byLabel(r, "shortest");
    expect(s.coords[0]).toEqual(pt(400, 0));
    expect(byLabel(r, "most").covered_pct).toBe(100);
  });
});

describe("access filters", () => {
  it("never uses a routable: false edge unless includeUnchecked is on", () => {
    const { data, via } = fan([{ y: 0, routable: false }, { y: 80 }]);
    const off = findRoutes(data, query());
    for (const route of off.routes) expect(uses(route, via[0])).toBe(false);
    for (const route of off.routes) expect(route.segments.some((x) => x.kind === "unchecked")).toBe(false);

    const on = findRoutes(data, query({ includeUnchecked: true }));
    const s = byLabel(on, "shortest");
    expect(uses(s, via[0])).toBe(true);
    expect(s.segments.map((x) => x.kind)).toEqual(["unchecked"]);
    expect(s.warnings.some((w) => w.includes("gated or private"))).toBe(true);
    expect(s.steps.some((x) => x.flags.includes("unchecked"))).toBe(true);
  });

  it("names a closed passage or a missing path as the cause", () => {
    const hours = [{ name: "Glorietta", rules: { thu: ["10:00", "21:00"] }, source_url: "https://example.org/hours", checked: "2026-10-20" }];
    const { data } = fan([{ y: 0, flags: 4, hours: 0, name: "Glorietta" }], { hours });
    const closed = findRoutes(data, query({ departMin: 21 * 60 + 5 }));
    expect(closed.state).toBe("no_route");
    expect(closed.notes).toContain("Every route between these points passes through a place that is closed at this time.");

    const apart = makeData({ nodes: [[0, 0], [100, 0], [300, 0], [400, 0]], edges: [{ u: 0, v: 1 }, { u: 2, v: 3 }] });
    const none = findRoutes(apart, query({ from: 0, to: 3 }));
    expect(none.state).toBe("no_route");
    expect(none.notes).toContain("No walking route connects these points at any hour.");
  });

  it("names the pair of limits when only another hour and unchecked paths together open a route", () => {
    const hours = [{ name: "Glorietta", rules: { thu: ["10:00", "21:00"] }, source_url: "https://example.org/hours", checked: "2026-10-20" }];
    const { data } = fan([{ y: 0, flags: 4, hours: 0, routable: false, name: "Glorietta" }], { hours });
    const r = findRoutes(data, query({ departMin: 21 * 60 + 5 }));
    expect(r.state).toBe("no_route");
    expect(r.notes.some((n) => n.startsWith("A route exists only at other hours or on paths that may be gated or private"))).toBe(true);
    expect(r.notes).not.toContain("No walking route connects these points at any hour.");
  });

  it("keeps Step-free in the combined check and names steps when they are part of the block", () => {
    const { data } = fan([{ y: 0, flags: 16, routable: false }]);
    const r = findRoutes(data, query({ stepFree: true }));
    expect(r.state).toBe("no_route");
    expect(r.notes.some((n) => n.startsWith("A route exists only at other hours or on paths that may be gated or private"))).toBe(false);
    expect(r.notes.some((n) => n.startsWith("A route exists only with steps"))).toBe(true);
  });

  it("says why when only unchecked paths connect the points", () => {
    const { data } = fan([{ y: 0, routable: false }]);
    const r = findRoutes(data, query());
    expect(r.state).toBe("no_route");
    expect(r.routes).toEqual([]);
    expect(r.notes.some((n) => n.includes("gated or private"))).toBe(true);
  });

  it("drops a mall passage after its closing time", () => {
    const hours = [{ name: "Glorietta", rules: { mon: ["10:00", "21:00"], tue: ["10:00", "21:00"], wed: ["10:00", "21:00"], thu: ["10:00", "21:00"], fri: ["10:00", "21:00"], sat: ["10:00", "21:00"], sun: [] }, source_url: "https://example.org/hours", checked: "2026-10-20" }];
    const { data, via } = fan([{ y: 0, flags: 4, hours: 0, name: "Glorietta" }, { y: 80 }], { hours });
    const open = byLabel(findRoutes(data, query({ departMin: 20 * 60 })), "shortest");
    expect(uses(open, via[0])).toBe(true);
    const step = open.steps.find((x) => x.flags.includes("hours"));
    expect(step?.closesAt).toBe("21:00");
    expect(step?.text).toContain("Glorietta closes at 9 PM");

    const closed = findRoutes(data, query({ departMin: 21 * 60 + 5 }));
    for (const route of closed.routes) expect(uses(route, via[0])).toBe(false);

    // The walk through the 400 m passage takes about 6 minutes, so it ends after 21:00.
    const late = findRoutes(data, query({ departMin: 20 * 60 + 58 }));
    for (const route of late.routes) expect(uses(route, via[0])).toBe(false);

    const soon = byLabel(findRoutes(data, query({ departMin: 20 * 60 + 40 })), "shortest");
    expect(soon.warnings.some((w) => w.startsWith("Glorietta closes at 9 PM"))).toBe(true);
  });

  it("reads opening hours by weekday", () => {
    const hours = [{ name: "Greenbelt", rules: { thu: ["10:00", "21:00"], sun: [], fri: [["10:00", "14:00"], ["15:00", "22:00"]] }, source_url: "https://example.org/hours", checked: "2026-10-20" }];
    const data = makeData({ nodes: [[0, 0], [10, 0]], edges: [{ u: 0, v: 1 }], hours });
    expect(openAt(data, 0, THURSDAY, 9 * 60 + 59)).toBe(false);
    expect(openAt(data, 0, THURSDAY, 10 * 60)).toBe(true);
    expect(openAt(data, 0, THURSDAY, 20 * 60 + 59)).toBe(true);
    expect(openAt(data, 0, THURSDAY, 21 * 60)).toBe(false);
    expect(openAt(data, 0, 0, 12 * 60)).toBe(false); // Wednesday has no rule
    const friday = makeData({ nodes: [[0, 0], [10, 0]], edges: [{ u: 0, v: 1 }], hours });
    friday.dateDow[1] = 5;
    expect(openAt(friday, 0, 1, 14 * 60 + 30)).toBe(false);
    expect(openAt(friday, 0, 1, 15 * 60)).toBe(true);
  });

  it("step-free avoids steps", () => {
    const { data, via } = fan([{ y: 0, flags: 16 }, { y: 80 }]);
    const normal = byLabel(findRoutes(data, query()), "shortest");
    expect(uses(normal, via[0])).toBe(true);
    expect(normal.warnings).toContain("Uses stairs.");

    const r = findRoutes(data, query({ stepFree: true }));
    for (const route of r.routes) {
      expect(uses(route, via[0])).toBe(false);
      expect(route.steps.some((x) => x.flags.includes("stairs"))).toBe(false);
    }
    expect(r.notes.some((n) => n.startsWith("Step-free avoids mapped steps only"))).toBe(true);

    // A raised kerb sets the steps bit on a crossing edge. Step-free avoids it, and the text says kerb.
    const kerbFx = fan([{ y: 0, flags: 256 | 16 }, { y: 80 }]);
    const kerb = byLabel(findRoutes(kerbFx.data, query()), "shortest");
    expect(uses(kerb, kerbFx.via[0])).toBe(true);
    expect(kerb.steps[0].text).toBe("Cross the street (raised curb)");
    expect(kerb.steps[0].flags).toEqual(expect.arrayContaining(["crossing", "stairs"]));
    expect(kerb.warnings).toEqual(["Has a raised curb at a crossing."]);
    for (const route of findRoutes(kerbFx.data, query({ stepFree: true })).routes) expect(uses(route, kerbFx.via[0])).toBe(false);

    const only = findRoutes(fan([{ y: 0, flags: 16 }]).data, query({ stepFree: true }));
    expect(only.state).toBe("no_route");
    expect(only.notes).toContain("Every route between these points uses steps.");
  });
});

describe("night and rain", () => {
  const { data, via } = fan([{ y: 0 }, { y: 80, flags: 1 }]);

  it("returns state night when the sun altitude is at or below 0", () => {
    for (const bucketIdx of [HORIZON, NIGHT]) {
      const r = findRoutes(data, query({ bucketIdx }));
      expect(r.state).toBe("night");
      expect(r.recommendedIsShortest).toBe(true);
      expect(r.routes.map((x) => x.label)).toEqual(["shortest", "most"]);
      expect(r.notes).toContain("The sun is down or very low. Shade does not apply.");
      expect(uses(byLabel(r, "most"), via[1])).toBe(true);
      for (const route of r.routes) expect(route.sun_minutes).toBe(0);
      expect(byLabel(r, "most").covered_pct).toBe(100);
      expect(byLabel(r, "shortest").covered_pct).toBe(0);
    }
    expect(findRoutes(data, query({ bucketIdx: DAY })).state).toBe("ok");
  });

  it("words the underpass warning by the real sun", () => {
    // Bucket 1 has the sun 2.1 degrees up: router night, but not dark. Buckets 2 and 3 are dark.
    const fx = fan([{ y: 0, flags: 2 }], {
      sun: [
        [60, 90],
        [2.1, 250],
        [0, 260],
        [-5, 262],
      ],
    });
    const at = (bucketIdx: number) => findRoutes(fx.data, query({ bucketIdx })).routes[0].warnings;
    expect(findRoutes(fx.data, query({ bucketIdx: 1 })).state).toBe("night");
    expect(at(1)).toEqual(["Uses an underpass in low light."]);
    expect(at(2)).toEqual(["Uses an underpass after dark."]);
    expect(at(3)).toEqual(["Uses an underpass after dark."]);
    expect(at(0)).toEqual([]);
  });

  it("treats a sun at 3 degrees or lower as night", () => {
    const low = fan([{ y: 0 }, { y: 80, flags: 1 }]).data;
    const sun: [number, number][] = [
      [60, 90],
      [2.9, 250],
      [3.1, 255],
      [-5, 262],
    ];
    low.manifest.sun = Object.fromEntries(low.manifest.dates.map((d) => [d, sun]));
    expect(findRoutes(low, query({ bucketIdx: 1 })).state).toBe("night");
    expect(findRoutes(low, query({ bucketIdx: 2 })).state).toBe("ok");
  });

  it("rain mode prefers sheltered edges over shade", () => {
    // via 0 is fully shaded by buildings but has no roof. via 1 is a covered walkway.
    const fx = fan([{ y: 0, building: 100 }, { y: 80, flags: 1 }, { y: 40, flags: 8, building: 100 }]);
    const shade = findRoutes(fx.data, query());
    expect(shade.recommendedIsShortest).toBe(true);
    expect(byLabel(shade, "shortest").covered_pct).toBe(100);

    const rain = findRoutes(fx.data, query({ mode: "rain" }));
    expect(rain.state).toBe("ok");
    const rec = byLabel(rain, "recommended");
    expect(uses(rec, fx.via[1])).toBe(true);
    expect(rec.covered_pct).toBe(100);
    expect(rec.segments.map((x) => x.kind)).toEqual(["roof"]);
    const s = byLabel(rain, "shortest");
    expect(s.covered_pct).toBe(0);
    expect(s.sun_minutes).toBeCloseTo(6.1, 5);
    // A shaded bridge deck without a roof is not sheltered in rain mode.
    for (const route of rain.routes) expect(uses(route, fx.via[2])).toBe(false);
  });

  it("falls back to roofs only, with a note, when shade is missing", () => {
    const fx = fan([{ y: 0, building: 100 }, { y: 80, flags: 1 }], { shade: false });
    const r = findRoutes(fx.data, query());
    expect(r.notes.some((n) => n.includes("Only roofs count as cover"))).toBe(true);
    expect(uses(byLabel(r, "recommended"), fx.via[1])).toBe(true);
  });
});

describe("snap, search, and outside", () => {
  const places = [
    { name: "Ayala MRT Station", category: "station", lon: pt(0, 0)[0], lat: pt(0, 0)[1], node_id: 0, aliases: ["Ayala MRT"] },
    { name: "Greenbelt 1", category: "mall", lon: pt(400, 0)[0], lat: pt(400, 0)[1], node_id: 1, aliases: [] },
    { name: "Glorietta 4", category: "mall", lon: pt(200, 80)[0], lat: pt(200, 80)[1], node_id: 2, aliases: ["G4"] },
  ];
  const { data } = fan([{ y: 0 }, { y: 80, routable: false }], { places });

  it("snaps to the nearest routable node", () => {
    const near = snapToNode(data, ...pt(390, 5));
    expect(near?.node).toBe(1);
    expect(near?.dist_m).toBeCloseTo(Math.hypot(10, 5), 0);
    // Node 2 touches only unchecked edges, so it is not a snap target.
    expect(snapToNode(data, ...pt(200, 80))?.node).not.toBe(2);
  });

  it("searches names and aliases by prefix and token", () => {
    expect(searchPlaces(data, "ayala")[0].name).toBe("Ayala MRT Station");
    expect(searchPlaces(data, "AYALA mrt")[0].name).toBe("Ayala MRT Station");
    expect(searchPlaces(data, "mrt")[0].name).toBe("Ayala MRT Station");
    expect(searchPlaces(data, "g4")[0].name).toBe("Glorietta 4");
    expect(searchPlaces(data, "green")[0].name).toBe("Greenbelt 1");
    expect(searchPlaces(data, "station ayala")[0].name).toBe("Ayala MRT Station");
    expect(searchPlaces(data, "zzz")).toEqual([]);
    expect(searchPlaces(data, "  ")).toEqual([]);
    expect(searchPlaces(data, "g", 1)).toHaveLength(1);
  });

  it("returns outside when a point snaps farther than 150 m", () => {
    expect(MAX_SNAP_M).toBe(150);
    const r = findRoutes(data, query({ from_snap_m: 151 }));
    expect(r.state).toBe("outside");
    expect(r.routes).toEqual([]);
    expect(findRoutes(data, query({ to_snap_m: 400 })).state).toBe("outside");
    expect(findRoutes(data, query({ from: -1 })).state).toBe("outside");
    expect(findRoutes(data, query({ from_snap_m: 149 })).state).toBe("ok");
  });

  it("rejects a date or bucket outside the manifest", () => {
    expect(() => findRoutes(data, query({ dateIdx: 9 }))).toThrow(RangeError);
    expect(() => findRoutes(data, query({ bucketIdx: -1 }))).toThrow(RangeError);
  });
});

describe("A* against a reference Dijkstra", () => {
  it("finds the optimal cost on random grids for every k", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    const n = 12;
    const nodes: [number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) nodes.push([i * 40 + rnd() * 10, j * 40 + rnd() * 10]);
    const edges: { u: number; v: number }[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i + 1 < n && rnd() < 0.85) edges.push({ u: i * n + j, v: (i + 1) * n + j });
        if (j + 1 < n && rnd() < 0.85) edges.push({ u: i * n + j, v: i * n + j + 1 });
        if (i + 1 < n && j + 1 < n && rnd() < 0.2) edges.push({ u: i * n + j, v: (i + 1) * n + j + 1 });
      }
    }
    const data = makeData({ nodes, edges });
    const E = data.edgeCount;
    const exposure = new Float32Array(E).map(() => rnd());
    const spec = { allowed: new Uint8Array(E).fill(1), exposure, departMin: 900, dateIdx: THURSDAY };
    const dijkstra = (s: number, t: number, k: number): number => {
      const dist = new Float64Array(data.nodeCount).fill(Infinity);
      const done = new Uint8Array(data.nodeCount);
      dist[s] = 0;
      for (;;) {
        let u = -1;
        for (let i = 0; i < data.nodeCount; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
        if (u < 0 || dist[u] === Infinity) return Infinity;
        if (u === t) return dist[t];
        done[u] = 1;
        for (let j = data.adjOff[u]; j < data.adjOff[u + 1]; j++) {
          const e = data.adjEdge[j];
          const c = dist[u] + data.edgeLen[e] * (1 + k * exposure[e]);
          if (c < dist[data.adjNode[j]]) dist[data.adjNode[j]] = c;
        }
      }
    };
    let checked = 0;
    for (let trial = 0; trial < 40; trial++) {
      const s = Math.floor(rnd() * data.nodeCount);
      const t = Math.floor(rnd() * data.nodeCount);
      if (s === t) continue;
      for (const k of [0, 0.25, 2, 8]) {
        const p = aStar(data, spec, s, t, k);
        const ref = dijkstra(s, t, k);
        if (!p) {
          expect(ref).toBe(Infinity);
          continue;
        }
        const cost = p.edges.reduce((a, e) => a + data.edgeLen[e] * (1 + k * exposure[e]), 0);
        expect(cost).toBeCloseTo(ref, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("geometry joins", () => {
  it("keeps both ends when edge geometries do not meet, and segments have no holes", () => {
    // Each sidewalk line sits 4 m north of its nodes, like an offset sidewalk. The middle edge is shaded.
    const data = makeData({
      nodes: [
        [0, 0],
        [100, 0],
        [200, 0],
      ],
      edges: [
        { u: 0, v: 1, geom: [[0, 4], [96, 4]] },
        { u: 1, v: 2, geom: [[104, 4], [200, 4]], building: 100 },
      ],
    });
    const r = findRoutes(data, query({ from: 0, to: 2 }));
    const s = byLabel(r, "shortest");
    expect(s.coords).toEqual([pt(0, 4), pt(96, 4), pt(104, 4), pt(200, 4)]);
    expect(s.segments.map((x) => x.kind)).toEqual(["sun", "building"]);
    expect(s.segments[1].coords[0]).toEqual(s.segments[0].coords[s.segments[0].coords.length - 1]);
    expect(data.hScale).toBeLessThan(1);
    expect(s.length_m).toBe(192);
  });
});

describe("unverified building cover (flag 1024)", () => {
  it("is not sheltered, counts as low confidence, and says so in the step", () => {
    const fx = fan([{ y: 0, flags: 1024 | 32, building: 80 }, { y: 80 }]);
    const s = byLabel(findRoutes(fx.data, query()), "shortest");
    expect(uses(s, fx.via[0])).toBe(true);
    expect(s.split.roof_m).toBe(0);
    expect(s.split.building_m).toBe(320);
    expect(s.lowconf_pct).toBe(100);
    expect(s.steps[0].text).toBe("Walk through the building (cover not checked)");
    expect(s.steps[0].flags).toContain("indoor");
    expect(s.warnings).toContain("Passes through a building. Its cover is not checked.");
    expect(s.segments.map((x) => x.kind)).toEqual(["building"]);
    const rain = byLabel(findRoutes(fx.data, query({ mode: "rain" })), "shortest");
    expect(rain.covered_pct).toBe(0);
  });

  it("keeps the sentence when a short in-building piece folds into its street", () => {
    const data = makeData({
      nodes: [
        [0, 0],
        [100, 0],
        [110, 0],
        [250, 0],
      ],
      edges: [
        { u: 0, v: 1, name: "Ayala Avenue" },
        { u: 1, v: 2, flags: 1024 },
        { u: 2, v: 3, name: "Ayala Avenue" },
      ],
    });
    const steps = findRoutes(data, query({ from: 0, to: 3 })).routes[0].steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].text).toBe("Head east on Ayala Avenue. Walk through the building (cover not checked)");
    expect(steps[0].flags).toContain("indoor");
    expect(steps[0].distance_m).toBe(250);
  });
});
