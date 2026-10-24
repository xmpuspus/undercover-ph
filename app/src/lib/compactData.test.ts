/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { searchFiles } from "../../scripts/build-data";
import type { AreaInfo, Place } from "../types";
import { decodeSearch, encodeSearch, mergeSearch } from "./searchIndex";
import { decodeGraph, encodeGraph } from "./router/columns";
import { findRoutes, loadData, placeKeys, searchPlaces, type FetchLike, type RawGraph } from "./router";
import { SUGGESTED } from "./suggested";
import { wellKnown } from "./wellKnown";

const root = new URL("../../public/data/", import.meta.url);
const read = <T,>(file: string): T => JSON.parse(readFileSync(new URL(file, root), "utf8")) as T;
// places_index.json and the area graphs come from the data release, and manifest.json from the shade run. The CI
// app job fetches only the release files, so each block skips when its inputs are missing.
const has = (file: string) => existsSync(new URL(file, root));
const places = has("places_index.json") ? read<Place[]>("places_index.json").map((p) => ({ ...p, aliases: p.aliases ?? [] })) : [];
const areas = read<{ areas: AreaInfo[] }>("areas.json").areas;

describe.skipIf(!has("places_index.json"))("generated search files", () => {
  it("starts with every area's notable places under 300 KB, then restores the full index and ranking", () => {
    const files = searchFiles(places, areas);
    const json = files.get("data/search/top.json")!;
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(300_000);
    const top = decodeSearch(JSON.parse(json));
    const entries = new Map<number, Place>();
    const first = mergeSearch(entries, top.entries);
    expect(first.some((p) => p.name === "Greenbelt")).toBe(true);
    const initialOrders = new Set(top.entries.map((e) => e.order));
    places.forEach((p, order) => {
      if (["station", "mall", "bus_station", "hospital", "landmark"].includes(p.category)) expect(initialOrders.has(order)).toBe(true);
    });
    for (const area of areas) {
      expect(first.some((p) => p.area === area.id)).toBe(true);
      for (const p of wellKnown(places, area.id, 6)) expect(first).toContainEqual(p);
      for (const name of SUGGESTED[area.id] ?? []) {
        const p = places.find((p) => p.area === area.id && p.name.toLowerCase() === name.toLowerCase());
        if (p) expect(first).toContainEqual(p);
      }
    }
    // Reverse arrival order exercises stable ties, then replay a shard to prove it does not duplicate places.
    let all = first;
    for (const path of [...top.chunks].reverse()) all = mergeSearch(entries, decodeSearch(JSON.parse(files.get(`data/search/${path}`)!)).entries);
    all = mergeSearch(entries, top.entries);
    expect(all).toEqual(places);
    const before = { places, placeKeys: placeKeys(places) }, after = { places: all, placeKeys: placeKeys(all) };
    for (const query of ["Greenbelt", "station", "SM", "St Luke", "Ayla", "Cebu IT Park Transport Terminal", "Café", "zzzz", ""]) {
      for (const prefer of [undefined, (p: Place) => p.area === "metro-core"]) expect(searchPlaces(after, query, 12, prefer)).toEqual(searchPlaces(before, query, 12, prefer));
    }
    console.log(`Search: ${Buffer.byteLength(json)} bytes, ${first.length} initial places, ${all.length} total, ${top.chunks.length} background files`);
  }, 30_000);

  it("rejects malformed search payloads and unsafe chunk names", () => {
    const valid = encodeSearch([{ order: 0, place: places[0] }]);
    expect(() => decodeSearch({ ...valid, chunks: ["../../places_index.json"] })).toThrow();
    for (const bad of [null, {}, [], "", { ...valid, version: 2 }, { ...valid, name: [] }, { ...valid, order: [-1] },
      { ...valid, area: [9999] }, { ...valid, aliases: { 0: [null] } }, { ...valid, lon: [Infinity] }, { ...valid, order: Array(100_001).fill(0) }]) {
      expect(() => decodeSearch(bad)).toThrow();
    }
    expect(decodeSearch(encodeSearch([])).entries).toEqual([]);
  });
});

for (const id of ["metro-core", "cebu-city-centre"]) {
  describe.skipIf(!["graph.json", "places.json", "hours.json", "manifest.json"].every((f) => has(`areas/${id}/${f}`)))(`column graph ${id}`, () => {
    it("round-trips to six decimals under 80% gzip and preserves sampled routes", async () => {
      const original = readFileSync(new URL(`areas/${id}/graph.json`, root));
      const raw = JSON.parse(original.toString()) as RawGraph;
      const encoded = JSON.stringify(encodeGraph(raw));
      const decoded = decodeGraph(JSON.parse(encoded));
      const round = (p: [number, number]) => p.map((n) => Math.round(n * 1e6) / 1e6);
      expect(decoded).toEqual({ ...raw, nodes: raw.nodes.map(round), edges: raw.edges.map((e) => ({ ...e, geom: e.geom.map(round) })) });
      expect(gzipSync(encoded).length).toBeLessThanOrEqual(0.8 * gzipSync(original).length);
      const disk: FetchLike = async (url) => {
        let bytes: Uint8Array;
        try { bytes = url.endsWith("graph.cols.json") ? new TextEncoder().encode(encoded) : readFileSync(new URL(url, root)); }
        catch { return { ok: false, status: 404, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) }; }
        return { ok: true, status: 200, json: async () => JSON.parse(new TextDecoder().decode(bytes)), arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer };
      };
      const before = await loadData(`areas/${id}`, disk);
      const after = await loadData(`areas/${id}`, disk, { graphFile: "graph.cols.json" });
      expect(after.nodeX).toEqual(before.nodeX);
      expect(after.nodeY).toEqual(before.nodeY);
      expect(after.hScale).toBe(before.hScale);
      const candidates = before.places.filter((p) => before.routableNode[p.node_id]);
      const pairs = [[0, 1], [2, 5], [7, 10], [12, 20]];
      let routed = 0;
      for (const [a, b] of pairs) {
        const q = { from: candidates[a].node_id, to: candidates[b].node_id, dateIdx: 0, bucketIdx: before.manifest.buckets_min.indexOf(900), mode: "shade" as const, stepFree: false, includeUnchecked: false, departMin: 900 };
        for (const mode of ["shade", "rain"] as const) {
          const r1 = findRoutes(before, { ...q, mode }), r2 = findRoutes(after, { ...q, mode });
          expect(r2.state).toBe(r1.state);
          const summary = (r: typeof r1) => r.routes.map((r) => ({ label: r.label, edges: r.edgeIds, length: r.length_m, minutes: r.minutes, covered: r.covered_pct, split: r.split }));
          expect(summary(r2)).toEqual(summary(r1));
          routed += r1.routes.length;
        }
      }
      expect(routed).toBeGreaterThan(0);
      console.log(`${id}: gzip ${(100 * gzipSync(encoded).length / gzipSync(original).length).toFixed(1)}% of original, ${routed} sampled routes`);
    }, 60_000);
  });
}

it("rejects malformed column graphs and preserves optional edge fields", () => {
  const raw: RawGraph = { nodes: [[1, 2], [3, 4]], edges: [
    { id: 0, u: 0, v: 1, len_m: 1, flags: 0, routable: true, name: null, landmark: null, hours_idx: null, geom: [[1, 2], [3, 4]] },
  ] };
  const valid = encodeGraph(raw);
  expect(decodeGraph(JSON.parse(JSON.stringify(valid)))).toEqual(raw);
  for (const bad of [null, {}, [], "", { ...valid, version: 2 }, { ...valid, nodes: [[1], []] }, { ...valid, geom: { ...valid.geom, offsets: [0, 10] } },
    { ...valid, edges: { ...valid.edges, u: [] } }, { ...valid, absent: { id: [999] } }, { ...valid, node_flags: [] }]) expect(() => decodeGraph(bad)).toThrow();
});
