/// <reference types="node" />
// Acceptance on real areas, SPEC J-R1 to J-R6 (app/src/lib/jog/SPEC.md). Each area skips until its
// graph.json and jog.json exist in app/public/data/areas/<id>/. Dates come from the manifest, never pinned.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadData, snapToNode } from "../../router/index";
import type { Data, FetchLike } from "../../router/types";
import { parseJog } from "../attrs";
import { findLoops } from "../loops";
import type { JogAttrs, JogQuery, Loop } from "../types";

const HERE = dirname(fileURLToPath(import.meta.url));
const AREAS = join(HERE, "../../../../public/data/areas");
interface Anchor { id: string; area: string; targetM: number; start: number[]; ring?: number[][]; check: Record<string, number | number[]> }
const fixture = JSON.parse(readFileSync(join(HERE, "anchors.json"), "utf8")) as {
  anchors: Anchor[];
  speedStarts: { area: string; targetM: number; places: { name: string; lonlat: number[] }[] };
};
const has = (area: string) => ["graph.json", "jog.json", "manifest.json"].every((f) => existsSync(join(AREAS, area, f)));

const diskFetch: FetchLike = async (url) => {
  if (!existsSync(url)) return { ok: false, status: 404, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = readFileSync(url);
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString("utf8")) as unknown, arrayBuffer: async () => new Uint8Array(buf).buffer };
};

const cache = new Map<string, Promise<{ data: Data; jog: JogAttrs | null }>>();
function area(id: string) {
  if (!cache.has(id)) {
    cache.set(id, loadData(join(AREAS, id), diskFetch, { dateIdx: 1 }).then((data) => ({
      data,
      jog: parseJog(JSON.parse(readFileSync(join(AREAS, id, "jog.json"), "utf8")), data.edgeCount),
    })));
  }
  return cache.get(id)!;
}

// 07:00 on the second manifest date: daylight, with shade data. A named place starts at its own node, as when a
// runner picks it in the app; snapping its point can land on a short isolated path (Greenbelt's basement way).
function query(data: Data, lonlat: number[], targetM: number, place?: string): JogQuery {
  const named = place ? data.places.find((p) => p.name === place) : undefined;
  const snap = named ? { node: named.node_id } : snapToNode(data, lonlat[0], lonlat[1]);
  if (!snap) throw new Error(`no node near ${lonlat}`);
  const bucketIdx = data.manifest.buckets_min.indexOf(7 * 60);
  return { start: snap.node, targetM, dateIdx: 1, bucketIdx, departMin: 7 * 60, paceMinPerKm: 7, seed: 1 };
}

const xy = (data: Data, p: number[]) => [p[0] * data.mPerLon, p[1] * data.mPerLat];
// The point halfway along the edge's line, as [lon, lat].
function mid(data: Data, e: number): number[] {
  const pts: number[][] = [];
  for (let i = data.geomOff[e]; i < data.geomOff[e + 1]; i++) pts.push([data.geomXY[2 * i], data.geomXY[2 * i + 1]]);
  const seg = pts.slice(1).map((p, i) => Math.hypot((p[0] - pts[i][0]) * data.mPerLon, (p[1] - pts[i][1]) * data.mPerLat));
  let left = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const t = seg[i] > 0 ? Math.min(1, left / seg[i]) : 0;
      return [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])];
    }
    left -= seg[i];
  }
  return pts[0];
}
function inside(pt: number[], ring: number[][]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function ringDistance(data: Data, pt: number[], ring: number[][]): number {
  const [px, py] = xy(data, pt);
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = xy(data, ring[i - 1]), [bx, by] = xy(data, ring[i]);
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
}
const idx = (data: Data, loop: Loop) => loop.edgeIds.map((id) => data.edgeId.indexOf(id));

describe("real anchors", () => {
  for (const a of fixture.anchors) {
    it.skipIf(!has(a.area))(`${a.id}: a ${a.targetM / 1000} km loop runs where runners run`, async () => {
      const { data, jog } = await area(a.area);
      expect(jog, "jog.json matches the graph").not.toBeNull();
      const res = findLoops(data, jog, query(data, a.start, a.targetM));
      expect(res.state).toBe("ok");
      expect(res.loops.length).toBeGreaterThanOrEqual(1);
      const scores = res.loops.map((loop) => {
        expect(Math.abs(loop.length_m - a.targetM)).toBeLessThanOrEqual(0.1 * a.targetM);
        const edges = idx(data, loop);
        const c = a.check as { nearRingShare?: number; nearRingM?: number; insideM?: number; wayIds?: number[]; onWaysM?: number };
        let m = 0;
        for (const e of edges) {
          if (c.nearRingShare && a.ring && ringDistance(data, mid(data, e), a.ring) <= c.nearRingM!) m += data.edgeLen[e];
          else if (c.insideM && a.ring && inside(mid(data, e), a.ring)) m += data.edgeLen[e];
          else if (c.wayIds && c.wayIds.includes(data.edgeWay[e])) m += data.edgeLen[e];
        }
        return c.nearRingShare ? m / loop.length_m >= c.nearRingShare : m >= (c.insideM ?? c.onWaysM!);
      });
      console.log("JOG_ANCHOR", JSON.stringify({ id: a.id, lengths: res.loops.map((l) => l.length_m), hit: scores, ms: res.elapsedMs }));
      expect(scores.some(Boolean)).toBe(true);
    }, 120_000);
  }
});

describe("speed on metro-core", () => {
  const s = fixture.speedStarts;
  it.skipIf(!has(s.area))("returns three 5 km loops from five starts, median 400 ms or less on this Mac", async () => {
    const { data, jog } = await area(s.area);
    findLoops(data, jog, query(data, s.places[0].lonlat, s.targetM, s.places[0].name)); // warm-up, not timed
    const times: number[] = [];
    for (const p of s.places) {
      const res = findLoops(data, jog, query(data, p.lonlat, s.targetM, p.name));
      expect(res.loops, p.name).toHaveLength(3);
      times.push(res.elapsedMs);
    }
    times.sort((a, b) => a - b);
    console.log("JOG_SPEED", JSON.stringify({ times }));
    // Vercel builds share unknown hardware, and a failed test there stops the daily deploy. The bound still holds
    // on a laptop and in the CI deploy-build job.
    if (!process.env.VERCEL) expect(times[2]).toBeLessThanOrEqual(400);
  }, 180_000);
});
