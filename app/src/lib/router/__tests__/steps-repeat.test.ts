import { describe, expect, it } from "vitest";
import { findRoutes } from "../index";
import type { Route } from "../types";
import { makeData, query, type EdgeSpec } from "./helpers";

// Acceptance for plan item 7 (2026-10-23). On Ayala MRT Station to Greenbelt the steps read
// "Turn right, then walk on the northwest side (on your left) of East Street" twice in a row, 90 m then 67 m.
// The route walked East Street (left side, OSM way 712411945), then 24 m of North Street (centre edge), then
// East Street again (left side, way 31827179). The 24 m piece folds into the next step, so East Street repeats.
// The same street on the same side, split only by a short piece of another street, must read as one step.

const east = (u: number, v: number, geom: [number, number][], way: number): EdgeSpec => ({
  u, v, name: "East Street", side: "left", way, geom, flags: 32,
});

function trip() {
  // Courtyard Drive runs north from A (0, 0) to B (0, 146). East Street runs east from B to C (90, 146).
  // North Street joins C to D (100, 124), 24 m. East Street goes on from D to E (160, 115).
  const nodes: [number, number][] = [[0, 0], [0, 146], [90, 146], [100, 124], [160, 115]];
  const edges: EdgeSpec[] = [
    { u: 0, v: 1, name: "Courtyard Drive", side: "left", way: 1, geom: [[-4, 0], [-4, 146]], flags: 32 },
    east(1, 2, [[0, 150], [90, 150]], 2),
    { u: 2, v: 3, name: "North Street", side: "centre", way: 3, flags: 0 },
    east(3, 4, [[100, 128], [160, 119]], 4),
  ];
  return makeData({ nodes, edges, nodeFlags: [4, 4, 4, 4, 4] });
}

const shortest = (): Route => {
  const r = findRoutes(trip(), query({ from: 0, to: 4 }));
  const s = r.routes.find((x) => x.label === "shortest");
  if (!s) throw new Error(`no route: ${r.notes.join(" | ")}`);
  return s;
};

describe("steps after a short piece of another street", () => {
  it("never repeats the same step text twice in a row", () => {
    const steps = shortest().steps;
    for (let i = 1; i < steps.length; i++) expect(steps[i].text).not.toBe(steps[i - 1].text);
  });

  it("reads East Street as one step when only a short piece of North Street splits it", () => {
    const steps = shortest().steps;
    const onEast = steps.filter((s) => s.text.includes("East Street"));
    expect(onEast).toHaveLength(1);
    expect(onEast[0].distance_m).toBeGreaterThanOrEqual(90 + 24 + 61 - 2);
  });
});
