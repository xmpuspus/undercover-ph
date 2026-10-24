/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildData, findRoutes } from "../index";
import type { Data, HoursRow, Place, Query, RawGraph, Result } from "../types";
import { REPO, routerBaseline, routerHistoryAvailable } from "./router-baseline";

const DIR = join(REPO, "app/public/data/areas/metro-core");
const available = ["graph.json", "places.json", "hours.json"].every((f) => existsSync(join(DIR, f)));
let cached: Data | undefined;
export function metroData(): Data {
  if (cached) return cached;
  const read = <T,>(file: string): T => JSON.parse(readFileSync(join(DIR, file), "utf8")) as T;
  const graph = read<RawGraph>("graph.json");
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of graph.nodes) {
    bbox[0] = Math.min(bbox[0], lon); bbox[1] = Math.min(bbox[1], lat);
    bbox[2] = Math.max(bbox[2], lon); bbox[3] = Math.max(bbox[3], lat);
  }
  // Rain routing needs graph, places and hours; it does not need a completed shade build.
  cached = buildData({ graph, places: read<Place[]>("places.json"), hours: read<HoursRow[]>("hours.json"), shade: null,
    manifest: { generated_at: "2026-10-23T00:00:00+08:00", pilot_bbox: bbox, graph_bbox: bbox, timezone: "Asia/Manila",
      dates: ["2026-10-23"], buckets_min: [900], sun: { "2026-10-23": [[40, 250]] } } });
  return cached;
}

const query = (from: number, to: number): Query => ({ from, to, dateIdx: 0, bucketIdx: 0, departMin: 900, mode: "rain", stepFree: false, includeUnchecked: false });
const median = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

it.each([null, undefined, "", "HEAD; echo injected", "../HEAD", "x".repeat(10000)])("rejects an unrecognized benchmark revision before invoking Git", async (revision) => {
  await expect(routerBaseline(revision as "HEAD")).rejects.toThrow("Unknown routing baseline");
});

describe.skipIf(!available)("production Metro Core routing without shade markers", () => {
  it("shows East Street once on the actual Ayala MRT to Greenbelt trip", () => {
    const data = metroData();
    const from = data.places.find((p) => p.name === "Ayala MRT Station")!;
    const to = data.places.find((p) => p.name === "Greenbelt")!;
    expect(from).toBeDefined(); expect(to).toBeDefined();
    const result = findRoutes(data, query(from.node_id, to.node_id));
    expect(result.state).toBe("ok");
    const route = result.routes.find((r) => r.label === "shortest")!;
    // Compare street identities, since two repeats can have different turn/landmark wording.
    for (const street of ["Courtyard Drive", "East Street", "Greenbelt Drive"]) {
      expect(route.steps.filter((s) => s.text.includes(street)), street).toHaveLength(1);
    }
    // Legazpi's centre-to-side instruction is a separate case, without a short different-road link.
    const legazpi = route.steps.filter((s) => s.text.includes("Legazpi Street"));
    expect(legazpi).toHaveLength(2);
    expect(legazpi[0].side).toBeUndefined();
    expect(legazpi[1].side).toBe("north");
    for (let i = 1; i < route.steps.length; i++) expect(route.steps[i].text).not.toBe(route.steps[i - 1].text);
    console.log("METRO_ROUTE", JSON.stringify({ edges: data.edgeCount, from: from.name, to: to.name, metres: route.length_m, steps: route.steps.map((s) => s.text), warnings: route.warnings }));
  });

  it.skipIf(!routerHistoryAvailable())("keeps findRoutes within 1.15 times the original router over 200 real place pairs", async () => {
    const original = await routerBaseline("9aae1dd");
    const head = await routerBaseline("HEAD");
    const data = metroData();
    let seed = 20261023;
    const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    const pairs: Query[] = [];
    for (let attempts = 0; pairs.length < 200 && attempts < 20000; attempts++) {
      const from = data.places[Math.floor(random() * data.places.length)].node_id;
      const to = data.places[Math.floor(random() * data.places.length)].node_id;
      if (from < 0 || to < 0 || from >= data.nodeCount || to >= data.nodeCount) continue;
      const distance = Math.hypot(data.nodeX[from] - data.nodeX[to], data.nodeY[from] - data.nodeY[to]);
      if (distance < 500 || distance > 3000) continue;
      pairs.push(query(from, to));
    }
    expect(pairs).toHaveLength(200);
    const runs = { original, head, branch: findRoutes };
    const cold: Record<string, number> = {};
    for (const [name, run] of Object.entries(runs)) {
      const start = performance.now();
      run({ ...data }, pairs[0]);
      cold[name] = performance.now() - start;
    }
    for (const run of Object.values(runs)) for (const q of pairs.slice(0, 10)) run(data, q);
    const samples: Record<string, number[]> = { original: [], head: [], branch: [] };
    const states: Record<string, Record<string, number>> = { original: {}, head: {}, branch: {} };
    const timeByState: Record<string, Record<string, number>> = { original: {}, head: {}, branch: {} };
    const names = Object.keys(runs) as (keyof typeof runs)[];
    for (let i = 0; i < pairs.length; i++) {
      for (let j = 0; j < names.length; j++) {
        const name = names[(i + j) % names.length];
        const start = performance.now();
        const result: Result = runs[name](data, pairs[i]);
        const elapsed = performance.now() - start;
        samples[name].push(elapsed);
        states[name][result.state] = (states[name][result.state] ?? 0) + 1;
        timeByState[name][result.state] = (timeByState[name][result.state] ?? 0) + elapsed;
      }
    }
    const stats = Object.fromEntries(Object.entries(samples).map(([name, a]) => [name, {
      median_ms: median(a), p95_ms: a.slice().sort((x, y) => x - y)[190], total_ms: a.reduce((x, y) => x + y, 0),
    }]));
    const ratio = stats.branch.median_ms / stats.original.median_ms;
    const totalRatio = stats.branch.total_ms / stats.original.total_ms;
    console.log("METRO_200_PAIR_TIMING", JSON.stringify({ edges: data.edgeCount, pairs: pairs.length, cold_ms: cold, stats, states, time_by_state_ms: timeByState, median_ratio: ratio, total_ratio: totalRatio }));
    expect(ratio).toBeLessThanOrEqual(1.15);
    expect(totalRatio).toBeLessThanOrEqual(1.15);
  }, 180000);
});
