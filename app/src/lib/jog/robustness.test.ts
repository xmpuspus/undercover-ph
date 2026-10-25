/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadData, snapToNode } from "../router/index";
import type { Data, FetchLike } from "../router/types";
import { grid, rawJog } from "./__tests__/fixtures";
import { loadJog, parseJog } from "./attrs";
import { JogClient } from "./client";
import { historyMask, streetsOf, validRun } from "./history";
import { findLoops } from "./loops";
import { edgeLine, lineLength, pointAlong } from "./geometry";
import type { JogQuery } from "./types";

const g = grid(8, 8, 100), jog = parseJog(rawJog(g.data), g.data.edgeCount);
const q: JogQuery = { start: g.at(4, 4), targetM: 1000, dateIdx: 0, bucketIdx: 0, departMin: 600, paceMinPerKm: 7 };
describe("invalid run inputs", () => {
  it("rejects unusable distances, pace, dates and isolated starts without throwing", () => {
    for (const targetM of [0, -1, NaN, Infinity, 1e12]) expect(findLoops(g.data, jog, { ...q, targetM }).state).toBe("no_loop");
    for (const paceMinPerKm of [0, -1, Infinity]) expect(findLoops(g.data, jog, { ...q, paceMinPerKm }).state).toBe("no_loop");
    expect(findLoops(g.data, jog, { ...q, dateIdx: -1 }).state).toBe("no_loop");
    expect(findLoops(g.data, jog, { ...q, start: 1e9 }).state).toBe("outside");
  });
  it("rejects broken supplement columns and a digest from another graph", () => {
    expect(parseJog({ ...rawJog(g.data), graph_sha256: "bad" }, g.data.edgeCount)).toBeNull();
    expect(parseJog(rawJog(g.data), g.data.edgeCount, "a".repeat(64))).toBeNull();
    expect(parseJog({ ...rawJog(g.data), counts: { ...rawJog(g.data).counts, edges: 0 } }, g.data.edgeCount)).toBeNull();
    for (const value of [null, [], {}, "<script>", new Array(100).fill(0), [Infinity]]) {
      expect(parseJog({ ...rawJog(g.data), edges: { ...rawJog(g.data).edges, road: value } }, g.data.edgeCount)).toBeNull();
    }
  });
  it("ignores corrupt storage records and never treats an unknown way as history", () => {
    for (const value of [null, {}, { streets: null }, { id: "<script>", area: "a", date: "2026-10-24", length_m: 100, streets: [[7, 9, 1, 2]] }]) {
      expect(validRun(value)).toBe(false);
      expect(Array.from(historyMask(g.data, [value as never])).some(Boolean)).toBe(false);
    }
  });
});

it("falls back to base data when an optional street-data request stalls", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  })));
  try {
    const reply = loadJog(g.data, "https://example.test/data/areas/test/");
    await vi.advanceTimersByTimeAsync(3001);
    expect(await reply).toBeNull();
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});

it("sends an area once and keeps later history inside worker messages", async () => {
  const messages: { type: string; id?: number; data?: { source: unknown }; query?: JogQuery }[] = [];
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    postMessage(message: typeof messages[number]) {
      messages.push(message);
      if (message.type === "query") queueMicrotask(() => this.onmessage?.({ data: { id: message.id, result: { loops: [] }, litShare: 0, grade: "thin" } }));
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", FakeWorker);
  const client = new JogClient();
  try {
    await client.query("test", g.data, "https://example.test/data/areas/test/", q);
    await client.query("test", g.data, "https://example.test/data/areas/test/", { ...q, seed: 2, history: [] });
    expect(messages.filter((m) => m.type === "init")).toHaveLength(1);
    expect(messages.find((m) => m.type === "init")!.data!.source).toBeNull();
    expect(messages.filter((m) => m.type === "query")).toHaveLength(2);
  } finally { client.close(); vi.unstubAllGlobals(); }
});

// A local data path lets sandboxed worktrees exercise real inputs without copying the data bundle.
const root = process.env.UCPH_JOG_DATA;
const disk: FetchLike = async (url) => {
  if (!existsSync(url)) return { ok: false, status: 404, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
  const b = readFileSync(url);
  return { ok: true, status: 200, json: async () => JSON.parse(b.toString()), arrayBuffer: async () => new Uint8Array(b).buffer };
};
it.skipIf(!root)("finds loops on the runner validation anchors", async () => {
  const anchors = JSON.parse(readFileSync(new URL("./__tests__/anchors.json", import.meta.url), "utf8"));
  const cache = new Map<string, { data: Data; jog: ReturnType<typeof parseJog> }>();
  for (const a of [...anchors.anchors, ...anchors.speedStarts.places.map((p: { name: string; lonlat: number[] }) => ({ id: p.name, place: p.name, area: "metro-core", start: p.lonlat, targetM: 5000 }))]) {
    if (!cache.has(a.area)) {
      const data = await loadData(join(root!, a.area), disk, { dateIdx: 1 });
      cache.set(a.area, { data, jog: parseJog(JSON.parse(readFileSync(join(root!, a.area, "jog.json"), "utf8")), data.edgeCount) });
    }
    const { data, jog } = cache.get(a.area)!;
    const node = data.places.find((p) => p.name === a.place)?.node_id ?? snapToNode(data, a.start[0], a.start[1])!.node;
    const r = findLoops(data, jog, { ...q, start: node, targetM: a.targetM, dateIdx: 1, bucketIdx: data.manifest.buckets_min.indexOf(420), departMin: 420 });
    console.log("RUN_ANCHOR", a.id, r.loops.map((l) => l.length_m), Math.round(r.elapsedMs), r.searches, r.notes);
    expect.soft(r.state, a.id).toBe("ok");
    if (a.targetM === 5000 && a.area === "metro-core") expect.soft(r.loops, a.id).toHaveLength(3);
    if (a.check) {
      const values = r.loops.map((loop) => {
        let m = 0;
        for (const id of loop.edgeIds) {
          const e = data.edgeId.indexOf(id), line = edgeLine(data, e);
          const pt = pointAlong(data, line, lineLength(data, line) / 2);
          if (a.check.wayIds?.includes(data.edgeWay[e])) m += data.edgeLen[e];
          else if (a.ring) {
            let inside = false, near = Infinity;
            for (let i = 0, j = a.ring.length - 1; i < a.ring.length; j = i++) {
              const [x, y] = a.ring[i], [xx, yy] = a.ring[j];
              if ((y > pt[1]) !== (yy > pt[1]) && pt[0] < (xx - x) * (pt[1] - y) / (yy - y) + x) inside = !inside;
              const dx = (xx - x) * data.mPerLon, dy = (yy - y) * data.mPerLat;
              const px = (pt[0] - x) * data.mPerLon, py = (pt[1] - y) * data.mPerLat;
              const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
              near = Math.min(near, Math.hypot(px - t * dx, py - t * dy));
            }
            if (a.check.nearRingM ? near <= a.check.nearRingM : inside) m += data.edgeLen[e];
          }
        }
        return a.check.nearRingShare ? m / loop.length_m : m;
      });
      console.log("ANCHOR_QUALITY", a.id, values);
      expect.soft(Math.max(0, ...values), a.id).toBeGreaterThanOrEqual(a.check.nearRingShare ?? a.check.insideM ?? a.check.onWaysM);
    }
    if (a.id === "Ayala Triangle Gardens" && r.loops[0]) {
      const loop = r.loops[0];
      const history = [{ id: "run", area: a.area, date: "2026-10-24", length_m: loop.length_m, streets: streetsOf(data, loop.edgeIds.map((id) => data.edgeId.indexOf(id))) }];
      const next = findLoops(data, jog, { ...q, start: node, targetM: 5000, dateIdx: 1, bucketIdx: data.manifest.buckets_min.indexOf(420), departMin: 420, seed: 2, history });
      console.log("RUN_HISTORY", next.loops.map((l) => ({ length: l.length_m, new: l.new_pct, shared: l.shared_m })), next.elapsedMs);
      expect.soft(next.loops).toHaveLength(3);
      for (const l of next.loops) expect.soft(l.new_pct).toBeGreaterThanOrEqual(50);
    }
  }
}, 180_000);
