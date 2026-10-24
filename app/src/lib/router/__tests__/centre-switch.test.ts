import { describe, expect, it } from "vitest";
import { findRoutes } from "../index";
import type { Result, Route } from "../types";
import { edgeIdx, makeData, query, type EdgeSpec } from "./helpers";

// Acceptance for the side-switch rule through centre edges (plan item 1, 2026-10-23).
// A route must not reach the other sidewalk of a road by stepping onto a centre edge of the same road
// in between. On 2026-10-23, 5 of 16 audited routes did this, one across Colonel Bonny Serrano Avenue mid-block.
//
// Ayala Avenue runs east: A (0, 0), B (200, 0), C (300, 0), D (500, 0). The north sidewalk runs A to B,
// a centre edge of the same road runs B to C (a piece where no sidewalk offset fits), and the south
// sidewalk runs C to D. A footway through X at (250, y) is the way around.

const north = (u: number, v: number, x0: number, x1: number, extra: Partial<EdgeSpec> = {}): EdgeSpec => ({
  u, v, name: "Ayala Avenue", side: "left", way: 7, geom: [[x0, 5], [x1, 5]], ...extra,
});
const south = (u: number, v: number, x0: number, x1: number, extra: Partial<EdgeSpec> = {}): EdgeSpec => ({
  u, v, name: "Ayala Avenue", side: "right", way: 7, geom: [[x0, -5], [x1, -5]], ...extra,
});
const centre = (u: number, v: number, x0: number, x1: number): EdgeSpec => ({
  u, v, name: "Ayala Avenue", side: "centre", way: 7, geom: [[x0, 0], [x1, 0]],
});

function byLabel(r: Result, label: Route["label"]): Route {
  const route = r.routes.find((x) => x.label === label);
  if (!route) throw new Error(`no ${label} route (${r.notes.join(" | ")})`);
  return route;
}

const UNMARKED = "Crosses a road where there is no marked crossing.";

/** flags: node flags for A, B, C, D. aroundY: the footway detour, or null for none. */
function build(flags: [number, number, number, number], aroundY: number | null, last: "south" | "north" = "south") {
  const edges: EdgeSpec[] = [
    north(0, 1, 0, 200),
    centre(1, 2, 200, 300),
    last === "south" ? south(2, 3, 300, 500) : north(2, 3, 300, 500),
  ];
  const nodes: [number, number][] = [[0, 0], [200, 0], [300, 0], [500, 0]];
  if (aroundY !== null) {
    nodes.push([250, aroundY]);
    edges.push({ u: 0, v: 4 }, { u: 4, v: 3 });
  }
  return makeData({ nodes, edges, nodeFlags: [...flags, 0].slice(0, nodes.length) });
}

const usesChain = (route: Route) => edgeIdx(route.edgeIds).join(",") === "0,1,2";

describe("side switches through a centre edge of the same road", () => {
  it("refuses north sidewalk, centre edge, south sidewalk when no node on the way has a crossing", () => {
    expect(findRoutes(build([4, 0, 0, 4], null), query({ from: 0, to: 3 })).state).toBe("no_route");
    const r = findRoutes(build([4, 0, 0, 4], 100), query({ from: 0, to: 3 }));
    expect(r.state).toBe("ok");
    for (const route of r.routes) expect(usesChain(route)).toBe(false);
  });

  it("allows the change for free when a node of the centre run is a mapped crossing or signals", () => {
    for (const flags of [[4, 1, 0, 4], [4, 0, 1, 4], [4, 0, 2, 4]] as [number, number, number, number][]) {
      const s = byLabel(findRoutes(build(flags, null), query({ from: 0, to: 3 })), "shortest");
      expect(usesChain(s)).toBe(true);
      expect(s.warnings).not.toContain(UNMARKED);
    }
  });

  it("charges the junction penalty and warns when the best node of the run is an unmarked junction", () => {
    const s = byLabel(findRoutes(build([4, 0, 4, 4], null), query({ from: 0, to: 3 })), "shortest");
    expect(usesChain(s)).toBe(true);
    expect(s.warnings).toContain(UNMARKED);
    // 500 m straight plus a 60 m penalty loses to the 514 m way around through (250, 60).
    const around = byLabel(findRoutes(build([4, 0, 4, 4], 60), query({ from: 0, to: 3 })), "shortest");
    expect(usesChain(around)).toBe(false);
  });

  it("keeps the same sidewalk through a centre edge free", () => {
    const s = byLabel(findRoutes(build([4, 0, 0, 4], null, "north"), query({ from: 0, to: 3 })), "shortest");
    expect(usesChain(s)).toBe(true);
    expect(s.warnings).not.toContain(UNMARKED);
  });
});
