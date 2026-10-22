/// <reference types="node" />
// Loads the pipeline's real files from app/public/data. Skips until READY.graph and READY.shade exist.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sideSwitch, Switch } from "../astar";
import { findRoutes, loadData, openAt, searchPlaces } from "../index";
import type { Data, FetchLike, Query, Result, Route } from "../types";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../public/data");
const mtime = (f: string) => (existsSync(join(DIR, f)) ? statSync(join(DIR, f)).mtimeMs : -1);
// Shade is built from the graph, so a shade marker older than the graph marker is stale.
const READY = mtime("READY.graph") > 0 && mtime("READY.shade") >= mtime("READY.graph");

const diskFetch: FetchLike = async (url) => {
  const missing = { ok: false, status: 404, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
  if (!existsSync(url)) return missing;
  const buf = readFileSync(url);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString("utf8")) as unknown,
    arrayBuffer: async () => new Uint8Array(buf).buffer,
  };
};

function quantile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function minLenChordRatio(data: Data): number {
  let min = Infinity;
  for (let e = 0; e < data.edgeCount; e++) {
    const u = data.edgeU[e];
    const v = data.edgeV[e];
    const chord = Math.hypot(data.nodeX[u] - data.nodeX[v], data.nodeY[u] - data.nodeY[v]);
    if (chord > 1) min = Math.min(min, data.edgeLen[e] / chord);
  }
  return min;
}

// Plain search over routable edges open at departure, as a check on no_route results.
function connected(data: Data, a: number, b: number, dateIdx: number, minute: number): boolean {
  const seen = new Uint8Array(data.nodeCount);
  const stack = [a];
  seen[a] = 1;
  while (stack.length > 0) {
    const u = stack.pop() as number;
    if (u === b) return true;
    for (let j = data.adjOff[u]; j < data.adjOff[u + 1]; j++) {
      const e = data.adjEdge[j];
      const h = data.edgeHours[e];
      if (!data.edgeRoutable[e] || (h >= 0 && !openAt(data, h, dateIdx, minute))) continue;
      const v = data.adjNode[j];
      if (!seen[v]) {
        seen[v] = 1;
        stack.push(v);
      }
    }
  }
  return false;
}

const COMPASS8 = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

// The longest named street of a route, metres per sidewalk side on it, and its side switches.
function sides(data: Data, route: Route) {
  const idx = route.edgeIds.map((id) => data.edgeId.indexOf(id));
  const byName = new Map<string, number>();
  for (const e of idx) {
    const n = data.edgeName[e];
    if (n) byName.set(n, (byName.get(n) ?? 0) + data.edgeLen[e]);
  }
  const street = [...byName.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const bySide: Record<string, number> = {};
  for (const e of idx) {
    if (data.edgeName[e] !== street) continue;
    const word = data.edgeSide[e] ? COMPASS8[Math.round((((Math.atan2(data.sideX[e], data.sideY[e]) * 180) / Math.PI + 360) % 360) / 45) % 8] : "centre";
    bySide[word] = Math.round((bySide[word] ?? 0) + data.edgeLen[e]);
  }
  // Classify each move with the node flags, even for a route found without them.
  let marked = 0;
  let junction = 0;
  let midBlock = 0;
  if (idx.length > 1) {
    const [e0, e1] = idx;
    let at = data.edgeU[e0] === data.edgeU[e1] || data.edgeU[e0] === data.edgeV[e1] ? data.edgeV[e0] : data.edgeU[e0];
    for (let i = 0; i < idx.length; i++) {
      const e = idx[i];
      const x = at;
      at = data.edgeU[e] === x ? data.edgeV[e] : data.edgeU[e];
      if (i === 0) continue;
      const sw = sideSwitch(data, idx[i - 1], e, x);
      if (sw === Switch.Free) marked++;
      else if (sw === Switch.Junction) junction++;
      else if (sw === Switch.Forbidden) midBlock++;
    }
  }
  return { label: route.label, length_m: route.length_m, minutes: route.minutes, covered_pct: route.covered_pct, sun_minutes: route.sun_minutes, street, side_m: bySide, switches: { marked, junction, midBlock }, warnings: route.warnings };
}

const routeSides = (data: Data, r: Result) => ({ state: r.state, sun: r.sun, notes: r.notes, routes: r.routes.map((x) => sides(data, x)) });

describe.skipIf(!READY)("real Makati data", () => {
  it("routes Ayala MRT Station to Greenbelt at 2026-10-22 15:00 and times 100 pairs", async () => {
    const t0 = performance.now();
    const data = await loadData(DIR, diskFetch);
    const loadMs = performance.now() - t0;
    expect(data.loadNotes).toEqual([]);
    expect(data.shade).not.toBeNull();
    // A* stays admissible only if the heuristic scale is at most the smallest len_m / chord ratio.
    const ratio = minLenChordRatio(data);
    expect(data.hScale).toBeLessThanOrEqual(ratio);

    const dateIdx = data.manifest.dates.indexOf("2026-10-22");
    const bucketIdx = data.manifest.buckets_min.indexOf(900);
    expect(dateIdx).toBeGreaterThanOrEqual(0);
    expect(bucketIdx).toBeGreaterThanOrEqual(0);
    const from = searchPlaces(data, "Ayala MRT Station")[0];
    const to = searchPlaces(data, "Greenbelt")[0];
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    const base: Query = { from: from.node_id, to: to.node_id, dateIdx, bucketIdx, mode: "shade", stepFree: false, includeUnchecked: false, departMin: 900 };
    const r = findRoutes(data, base);
    expect(r.state).toBe("ok");
    if (r.routes.length < 3) expect(r.notes.length).toBeGreaterThan(0);
    const summary = r.routes.map((x) => ({
      label: x.label,
      length_m: x.length_m,
      minutes: x.minutes,
      covered_pct: x.covered_pct,
      sun_minutes: x.sun_minutes,
      split: x.split,
      lowconf_pct: x.lowconf_pct,
      steps: x.steps.map((s) => `${s.text} (${s.distance_m} m)`),
      warnings: x.warnings,
    }));
    console.log("AYALA_GREENBELT", JSON.stringify({ from: from.name, to: to.name, state: r.state, recommendedIsShortest: r.recommendedIsShortest, notes: r.notes, routes: summary }, null, 1));
    // Sidewalk sides at 08:00 and 16:00, with and without the side-switch rule (node flags off).
    const noFlags: Data = { ...data, nodeFlags: null };
    const times2: Record<string, unknown> = {};
    for (const minute of [480, 960]) {
      const b = data.manifest.buckets_min.indexOf(minute);
      expect(b).toBeGreaterThanOrEqual(0);
      const q = { ...base, bucketIdx: b, departMin: minute };
      const on = findRoutes(data, q);
      expect(on.state).toBe("ok");
      expect(on.sun?.shadySide).toMatch(/^Shade falls on the [a-z]+ side of streets\.$/);
      for (const route of on.routes) expect(sides(data, route).switches.midBlock).toBe(0);
      times2[`${minute / 60}:00`] = {
        rule_on: { ...routeSides(data, on), steps: on.routes.map((x) => [x.label, x.steps.map((s) => `${s.text} (${s.distance_m} m)`)]) },
        rule_off: routeSides(data, findRoutes(noFlags, q)),
      };
    }
    console.log("AYALA_GREENBELT_SIDES", JSON.stringify(times2, null, 1));
    const rain = findRoutes(data, { ...base, mode: "rain" });
    console.log("AYALA_GREENBELT_RAIN", JSON.stringify({ state: rain.state, notes: rain.notes, routes: rain.routes.map((x) => [x.label, x.length_m, x.covered_pct, x.sun_minutes]) }));

    // 100 random pairs, 500 to 3000 m apart, like the earlier bench_route.mjs.
    const nodes: number[] = [];
    for (let i = 0; i < data.nodeCount; i++) if (data.routableNode[i]) nodes.push(i);
    let seed = 20261022;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
    for (let i = 0; i < 5; i++) findRoutes(data, base); // warm-up, not timed
    const times: number[] = [];
    const pairs: [number, number][] = [];
    const states: Record<string, number> = {};
    let three = 0;
    let tries = 0;
    let noRouteButConnected = 0;
    let changedAny = 0;
    let changedShortest = 0;
    let midBlockOff = 0;
    let shortestHadMidBlock = 0;
    const lengthGain: number[] = [];
    while (times.length < 100 && tries < 20000) {
      tries++;
      const a = nodes[Math.floor(rnd() * nodes.length)];
      const b = nodes[Math.floor(rnd() * nodes.length)];
      const d = Math.hypot(data.nodeX[a] - data.nodeX[b], data.nodeY[a] - data.nodeY[b]);
      if (d < 500 || d > 3000) continue;
      const s = performance.now();
      const res = findRoutes(data, { ...base, from: a, to: b });
      const ms = performance.now() - s;
      states[res.state] = (states[res.state] ?? 0) + 1;
      if (res.state === "no_route" && connected(data, a, b, dateIdx, base.departMin)) noRouteButConnected++;
      if (res.state !== "ok") continue;
      times.push(ms);
      pairs.push([a, b]);
      const off = findRoutes(noFlags, { ...base, from: a, to: b });
      const keyOf = (r: Result, label: string) => r.routes.find((x) => x.label === label)?.edgeIds.join(",") ?? "";
      const changedLabels = ["shortest", "recommended", "most"].filter((l) => keyOf(res, l) !== keyOf(off, l));
      if (changedLabels.length > 0) changedAny++;
      if (changedLabels.includes("shortest")) changedShortest++;
      for (const route of off.routes) midBlockOff += sides(data, route).switches.midBlock;
      const offShort = off.routes.find((x) => x.label === "shortest");
      const onShort = res.routes.find((x) => x.label === "shortest");
      if (offShort && sides(data, offShort).switches.midBlock > 0) shortestHadMidBlock++;
      if (offShort && onShort) lengthGain.push(onShort.length_m / offShort.length_m - 1);
      for (const route of res.routes) expect(sides(data, route).switches.midBlock).toBe(0);
      if (res.routes.length === 3) three++;
    }
    expect(times.length).toBe(100);
    expect(noRouteButConnected).toBe(0);
    // Re-time the slowest pair. A slow first run and fast repeats point to warm-up or GC, not the search.
    const slow = pairs[times.indexOf(Math.max(...times))];
    const repeats: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = performance.now();
      findRoutes(data, { ...base, from: slow[0], to: slow[1] });
      repeats.push(+(performance.now() - s).toFixed(2));
    }
    console.log(
      "ROUTER_TIMING",
      JSON.stringify({
        nodes: data.nodeCount,
        edges: data.edgeCount,
        routable_nodes: nodes.length,
        load_ms: +loadMs.toFixed(1),
        h_scale: +data.hScale.toFixed(4),
        min_len_chord_ratio: +ratio.toFixed(4),
        pairs_timed: times.length,
        states,
        no_route_but_connected: noRouteButConnected,
        three_routes: three,
        side_rule_pairs_changed_any_route: changedAny,
        side_rule_pairs_changed_shortest: changedShortest,
        mid_block_switches_without_rule: midBlockOff,
        shortest_without_rule_crossed_mid_block: shortestHadMidBlock,
        shortest_length_increase_p50_pct: +(100 * quantile(lengthGain, 0.5)).toFixed(2),
        shortest_length_increase_p95_pct: +(100 * quantile(lengthGain, 0.95)).toFixed(2),
        shortest_length_increase_max_pct: +(100 * Math.max(...lengthGain)).toFixed(2),
        findRoutes_ms_p50: +quantile(times, 0.5).toFixed(2),
        findRoutes_ms_p95: +quantile(times, 0.95).toFixed(2),
        findRoutes_ms_max: +Math.max(...times).toFixed(2),
        slowest_pair_repeat_ms: repeats,
      }),
    );
  }, 120000);
});
