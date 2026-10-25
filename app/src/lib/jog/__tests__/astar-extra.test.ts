import { describe, expect, it } from "vitest";
import { aStar, type SearchSpec } from "../../router/astar";
import { fan, makeData, THURSDAY, type EdgeSpec } from "../../router/__tests__/helpers";
import type { Data } from "../../router/types";
import { grid } from "./fixtures";

// Acceptance for SPEC J-E1 (app/src/lib/jog/SPEC.md): aStar takes optional per-edge extra cost, an entry
// edge with its side context, a per-edge cost on an unmarked side change, and a pace for opening hours. Without
// them every route stays the same.

function spec(data: Data, departMin = 900): SearchSpec {
  const allowed = new Uint8Array(data.edgeCount).fill(1);
  const exposure = new Float32Array(data.edgeCount);
  return { allowed, exposure, departMin, dateIdx: THURSDAY };
}

describe("aStar options for jog legs", () => {
  it("an extra cost on an edge moves the path to another way", () => {
    const { data, via } = fan([{ y: 0 }, { y: 100 }]);
    const s = spec(data);
    expect(aStar(data, s, 0, 1, 0)!.edges).toEqual(via[0]);
    const extra = new Float32Array(data.edgeCount);
    extra[via[0][0]] = 1;
    expect(aStar(data, s, 0, 1, 0, { extra })!.edges).toEqual(via[1]);
  });

  it("all-zero options give the same path as no options", () => {
    const g = grid(8, 8, 100);
    const s = spec(g.data);
    const zero = new Float32Array(g.data.edgeCount);
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) % g.data.nodeCount;
    for (let i = 0; i < 30; i++) {
      const a = rnd(), b = rnd();
      if (a === b) continue;
      const plain = aStar(g.data, s, a, b, 0);
      const opts = aStar(g.data, s, a, b, 0, { extra: zero, junctionExtra: zero, mPerMin: 66 });
      expect(opts?.edges).toEqual(plain?.edges);
    }
  });

  // Ayala Avenue: north sidewalk A (0) to B (1), south sidewalk B to C (2). B is mid-block with no crossing.
  // A footway runs from B round X (3) at (300, 150) to C.
  function road(bFlag: number) {
    const edges: EdgeSpec[] = [
      { u: 0, v: 1, name: "Ayala Avenue", side: "left", way: 7, geom: [[0, 5], [200, 5]] },
      { u: 1, v: 2, name: "Ayala Avenue", side: "right", way: 7, geom: [[200, -5], [400, -5]] },
      { u: 1, v: 3, name: "Footway", way: 9 },
      { u: 3, v: 2, name: "Footway", way: 9 },
    ];
    return makeData({ nodes: [[0, 0], [200, 0], [400, 0], [300, 150]], edges, nodeFlags: [4, bFlag, 4, 0] });
  }

  it("a leg that enters on the north sidewalk cannot change sides mid-block at its start", () => {
    const data = road(0);
    const s = spec(data);
    expect(aStar(data, s, 1, 2, 0)!.edges).toEqual([1]);
    expect(aStar(data, s, 1, 2, 0, { entry: { edge: 0 } })!.edges).toEqual([2, 3]);
  });

  it("a per-edge cost on an unmarked side change sends the leg round by the footway", () => {
    const data = road(4);
    const s = spec(data);
    expect(aStar(data, s, 1, 2, 0, { entry: { edge: 0 } })!.edges).toEqual([1]);
    const junctionExtra = new Float32Array(data.edgeCount);
    junctionExtra[1] = 200;
    expect(aStar(data, s, 1, 2, 0, { entry: { edge: 0 }, junctionExtra })!.edges).toEqual([2, 3]);
  });

  it("opening hours use the runner's pace when one is given", () => {
    // 2,000 m of street, then 100 m through a mall that closes at 20:00. Departure 19:30.
    const hours = [{ name: "Test Mall", rules: { thu: ["10:00", "20:00"] }, source_url: "https://example.org/hours", checked: "2026-10-24" }];
    const data = makeData({ nodes: [[0, 0], [2000, 0], [2100, 0]], edges: [{ u: 0, v: 1 }, { u: 1, v: 2, flags: 4, hours: 0, name: "Test Mall" }], hours });
    const s = spec(data, 19 * 60 + 30);
    expect(aStar(data, s, 0, 2, 0)).toBeNull();
    expect(aStar(data, s, 0, 2, 0, { mPerMin: 200 })!.edges).toEqual([0, 1]);
  });
});
