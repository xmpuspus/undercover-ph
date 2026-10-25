/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THURSDAY } from "../../router/__tests__/helpers";
import { loadData } from "../../router/index";
import type { FetchLike, HoursRow } from "../../router/types";
import { parseJog } from "../attrs";
import { findLoops, measureLoop } from "../loops";
import type { JogQuery } from "../types";
import { grid, rawJog } from "./fixtures";

// Acceptance for park opening hours, SPEC J-D13, J-E12 and J-N3 (app/src/lib/jog/SPEC.md). Most runs start before
// sunrise, and some parks close at night: Track 30th in BGC opens at 06:00. jog.json gives each park edge the
// hours.json row of its park, and a loop never enters a park while it is closed.

const DAILY = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, ["06:00", "22:00"]]));
const HOURS: HoursRow[] = [{ name: "Test Park", rules: DAILY, source_url: "https://www.openstreetmap.org/way/201", checked: "2026-10-20" }];

// A 12 by 12 grid of 100 m blocks. The park covers the blocks between columns 6 and 9 and rows 3 and 8.
const G = grid(12, 12, 100, { hours: HOURS });
const inPark = (e: number) => {
  const [x0, y0] = G.nodes[G.data.edgeU[e]], [x1, y1] = G.nodes[G.data.edgeV[e]];
  return [x0, x1].every((x) => x >= 600 && x <= 900) && [y0, y1].every((y) => y >= 300 && y <= 800);
};
const parkEdges = Array.from({ length: G.data.edgeCount }, (_, e) => e).filter(inPark);
const JOG = parseJog(rawJog(G.data, {
  park: Array.from({ length: G.data.edgeCount }, (_, e) => (inPark(e) ? 1 : 0)),
  hours: Array.from({ length: G.data.edgeCount }, (_, e) => (inPark(e) ? 0 : -1)),
}), G.data.edgeCount)!;

const q = (over: Partial<JogQuery> = {}): JogQuery => ({
  start: G.at(5, 5), targetM: 3000, dateIdx: THURSDAY, bucketIdx: 0, departMin: 7 * 60, paceMinPerKm: 7, seed: 1, ...over,
});
const usesPark = (edgeIds: number[]) => edgeIds.some((id) => inPark(id - 1000));

describe("park hours in the jog file", () => {
  it("reads an hours column and fills -1 when an older file has none", () => {
    expect(parkEdges.length).toBeGreaterThan(20);
    expect(Array.from(JOG.edges.hours).filter((h) => h === 0)).toHaveLength(parkEdges.length);
    const old = parseJog(rawJog(G.data), G.data.edgeCount)!;
    expect(old.edges.hours).toHaveLength(G.data.edgeCount);
    expect(Array.from(old.edges.hours).every((h) => h === -1)).toBe(true);
  });

  it("refuses an hours column with a bad value", () => {
    for (const bad of [-2, 0.5, Number.NaN]) {
      const hours = Array.from({ length: G.data.edgeCount }, () => -1);
      hours[3] = bad;
      expect(parseJog(rawJog(G.data, { hours }), G.data.edgeCount)).toBeNull();
    }
  });
});

describe("loops and park hours", () => {
  it("use the open park at 07:00", () => {
    const res = findLoops(G.data, JOG, q());
    expect(res.loops.length).toBeGreaterThanOrEqual(1);
    expect(res.loops.some((l) => usesPark(l.edgeIds))).toBe(true);
  });

  it("never enter the park while it is closed at 05:00", () => {
    const res = findLoops(G.data, JOG, q({ departMin: 5 * 60 }));
    expect(res.loops.length).toBeGreaterThanOrEqual(1);
    for (const l of res.loops) expect(usesPark(l.edgeIds)).toBe(false);
  });

  it("warn with the park's name when a known path reaches it closed", () => {
    const loop = findLoops(G.data, JOG, q()).loops.find((l) => usesPark(l.edgeIds))!;
    const path = { edges: loop.edgeIds.map((id) => id - 1000), nodes: loop.nodes };
    const early = measureLoop(G.data, JOG, path, q({ departMin: 5 * 60 }));
    expect(early.warnings.join(" ")).toContain("Test Park");
    const open = measureLoop(G.data, JOG, path, q());
    expect(open.warnings.join(" ")).not.toContain("Test Park");
  });

  it("from a start inside the closed park, give no loop and say when the park opens", () => {
    const res = findLoops(G.data, JOG, q({ start: G.at(7, 5), departMin: 5 * 60 }));
    expect(res.state).toBe("no_loop");
    expect(res.notes.join(" ")).toMatch(/Test Park.*6(:00)? AM/);
  });

  it("ignore an hours index that the area's hours.json does not have", () => {
    const bad = parseJog(rawJog(G.data, { hours: Array.from({ length: G.data.edgeCount }, (_, e) => (inPark(e) ? 5 : -1)) }), G.data.edgeCount)!;
    const res = findLoops(G.data, bad, q({ departMin: 5 * 60 }));
    expect(res.loops.length).toBeGreaterThanOrEqual(1);
  });
});

// Real data: Track 30th in metro-core opens at 06:00 in OSM. Skips until the area files exist.
const AREA = join(dirname(fileURLToPath(import.meta.url)), "../../../../public/data/areas/metro-core");
const READY = ["graph.json", "jog.json", "manifest.json", "hours.json"].every((f) => existsSync(join(AREA, f)));
const disk: FetchLike = async (url) => existsSync(url)
  ? { ok: true, status: 200, json: async () => JSON.parse(readFileSync(url, "utf8")) as unknown, arrayBuffer: async () => new Uint8Array(readFileSync(url)).buffer }
  : { ok: false, status: 404, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) };

describe.skipIf(!READY)("Track 30th on real data", () => {
  it("a 05:00 loop near Track 30th never runs inside it, and a 07:00 loop may", async () => {
    const data = await loadData(AREA, disk, { dateIdx: 1 });
    const jog = parseJog(JSON.parse(readFileSync(join(AREA, "jog.json"), "utf8")), data.edgeCount)!;
    const row = data.hours.findIndex((h) => h.name === "Track 30th");
    expect(row).toBeGreaterThanOrEqual(0);
    const inTrack = (id: number) => jog.edges.hours[data.edgeId.indexOf(id)] === row;
    expect(Array.from(jog.edges.hours).filter((h) => h === row).length).toBeGreaterThan(5);
    const place = data.places.find((p) => p.name === "Burgos Circle")!;
    const at = (departMin: number) => findLoops(data, jog, {
      start: place.node_id, targetM: 5000, dateIdx: 1, bucketIdx: 0, departMin, paceMinPerKm: 7, seed: 1,
    });
    const early = at(5 * 60);
    expect(early.loops.length).toBeGreaterThanOrEqual(1);
    for (const l of early.loops) expect(l.edgeIds.some(inTrack)).toBe(false);
    const track = data.places.find((p) => p.name === "Track 30th")!;
    const inside = findLoops(data, jog, { start: track.node_id, targetM: 3000, dateIdx: 1, bucketIdx: 0, departMin: 5 * 60, paceMinPerKm: 7, seed: 1 });
    if (inside.state === "no_loop") expect(inside.notes.join(" ")).toContain("Track 30th");
    // A start node on the park's edge may leave through one park edge that touches it; no other park edge is used.
    else for (const l of inside.loops) for (const id of l.edgeIds.filter(inTrack)) {
      const e = data.edgeId.indexOf(id);
      expect([data.edgeU[e], data.edgeV[e]]).toContain(track.node_id);
    }
  }, 120_000);
});
