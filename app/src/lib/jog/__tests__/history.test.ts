import { describe, expect, it } from "vitest";
import { makeData, type EdgeSpec } from "../../router/__tests__/helpers";
import { historyMask, streetsOf } from "../history";
import type { RunRecord } from "../types";

// Acceptance for run history on the phone, SPEC J-H1 and J-H2 (app/src/lib/jog/SPEC.md). A run stores
// street keys (OSM way id and side) with points at most 25 m apart along each edge, rounded to 5 decimals, so it
// survives a rebuild that splits or renumbers edges.

const left = (u: number, v: number, x0: number, x1: number, way = 7): EdgeSpec => ({
  u, v, name: "Main Road", way, side: "left", geom: [[x0, 5], [x1, 5]],
});
const right = (u: number, v: number, x0: number, x1: number, way = 7): EdgeSpec => ({
  u, v, name: "Main Road", way, side: "right", geom: [[x0, -5], [x1, -5]],
});

// Before: the north sidewalk of way 7 is two 100 m edges, plus the south sidewalk and way 8 beside it.
const before = makeData({
  nodes: [[0, 0], [100, 0], [200, 0], [300, 0]],
  edges: [left(0, 1, 0, 100), left(1, 2, 100, 200), right(0, 1, 0, 100), left(2, 3, 200, 300, 8)],
});
// After a rebuild: the same sidewalk is three edges in another order, with other edges first.
const after = makeData({
  nodes: [[300, 0], [200, 0], [0, 0], [66.7, 0], [133.3, 0]],
  edges: [
    left(1, 0, 200, 300, 8),
    right(2, 3, 0, 66.7),
    left(4, 1, 133.3, 200),
    left(2, 3, 0, 66.7),
    left(3, 4, 66.7, 133.3),
  ],
});

describe("run history", () => {
  it("stores street keys with points at most 25 m apart, in 1e-5 degrees", () => {
    const streets = streetsOf(before, [0, 1]);
    // Two 100 m edges need at least 4 points each.
    expect(streets.length).toBeGreaterThanOrEqual(8);
    for (const [way, side, lonE5, latE5] of streets) {
      expect(way).toBe(7);
      expect(side).toBe(1);
      expect(Number.isInteger(lonE5) && Number.isInteger(latE5)).toBe(true);
    }
  });

  it("marks the same sidewalk after a rebuild, and nothing else", () => {
    const run: RunRecord = { id: "r1", area: "test", date: "2026-10-24", length_m: 200, streets: streetsOf(before, [0, 1]) };
    const mask = historyMask(after, [run]);
    expect(Array.from(mask)).toEqual([0, 0, 1, 1, 1]);
  });

  it("an empty history marks nothing", () => {
    expect(Array.from(historyMask(after, []))).toEqual([0, 0, 0, 0, 0]);
  });

  it("stored points more than 30 m from an edge midpoint do not match", () => {
    const far: RunRecord = { id: "r2", area: "test", date: "2026-10-24", length_m: 100, streets: streetsOf(before, [0]).map(([w, s, x, y]): [number, number, number, number] => [w, s, x + 300, y]) };
    // 300e-5 degrees of longitude is about 323 m here, so the nearest moved point is about 270 m from the middle of edge 0.
    const mask = historyMask(before, [far]);
    expect(mask[0]).toBe(0);
  });
});
