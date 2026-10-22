import { describe, expect, it } from "vitest";
import { sideSwitch, Switch } from "../astar";
import { findRoutes } from "../index";
import type { Result, Route } from "../types";
import { DAY, edgeIdx, fan, makeData, NIGHT, query, type EdgeSpec } from "./helpers";

function byLabel(r: Result, label: Route["label"]): Route {
  const route = r.routes.find((x) => x.label === label);
  if (!route) throw new Error(`no ${label} route (${r.notes.join(" | ")})`);
  return route;
}

describe("Result.sun", () => {
  const { data } = fan([{ y: 0 }, { y: 80 }]);

  it("gives the sun's direction and the shady side of streets by day", () => {
    const r = findRoutes(data, query({ bucketIdx: DAY }));
    expect(r.sun).toEqual({ altitude: 40, azimuth: 250, compass: "west-southwest", shadySide: "Shade falls on the west side of streets." });
  });

  it("leaves shadySide empty at night and keeps sun in every state", () => {
    expect(findRoutes(data, query({ bucketIdx: NIGHT })).sun?.shadySide).toBe("");
    expect(findRoutes(data, query({ from_snap_m: 500 })).sun?.compass).toBe("west-southwest");
    expect(findRoutes(data, query({ from: 0, to: 0 })).sun?.altitude).toBe(40);
  });
});

// Ayala Avenue runs east from A (0, 0) through B (200, 0) to C (400, 0).
// Its north sidewalk sits 5 m north of the centreline and its south sidewalk 5 m south.
const north = (u: number, v: number, x0: number, x1: number, extra: Partial<EdgeSpec> = {}): EdgeSpec => ({
  u, v, name: "Ayala Avenue", side: "left", way: 7, geom: [[x0, 5], [x1, 5]], ...extra,
});
const south = (u: number, v: number, x0: number, x1: number, extra: Partial<EdgeSpec> = {}): EdgeSpec => ({
  u, v, name: "Ayala Avenue", side: "right", way: 7, geom: [[x0, -5], [(x0 + x1) / 2, -6], [x1, -5]], ...extra,
});
const AVENUE: [number, number][] = [
  [0, 0],
  [200, 0],
  [400, 0],
];

describe("sidewalk side in steps", () => {
  it("names the side of the street each route walks on", () => {
    const data = makeData({
      nodes: AVENUE,
      edges: [north(0, 1, 0, 200), north(1, 2, 200, 400), south(0, 1, 0, 200, { building: 100 }), south(1, 2, 200, 400, { building: 100 })],
      nodeFlags: [4, 4, 4],
    });
    const r = findRoutes(data, query({ from: 0, to: 2 }));
    const s = byLabel(r, "shortest");
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0].side).toBe("north");
    expect(s.steps[0].text).toBe("Head east on the north side (on your left) of Ayala Avenue");
    const rec = byLabel(r, "recommended");
    expect(rec.steps[0].side).toBe("south");
    expect(rec.steps[0].text).toBe("Head east on the south side (on your right) of Ayala Avenue");
    expect(rec.steps[0].textTl).toBe("Maglakad pa-east sa timog na bahagi (sa kanan mo) ng Ayala Avenue");
    expect(rec.covered_pct).toBe(100);
  });

  it("marks a side as mapped only when OSM tags its sidewalk", () => {
    // makeData tags every edge as a sidewalk (flag 32) by default. Here only the north side keeps the tag.
    const data = makeData({
      nodes: AVENUE,
      edges: [
        north(0, 1, 0, 200),
        north(1, 2, 200, 400),
        south(0, 1, 0, 200, { building: 100, flags: 0 }),
        south(1, 2, 200, 400, { building: 100, flags: 0 }),
      ],
      nodeFlags: [4, 4, 4],
    });
    const r = findRoutes(data, query({ from: 0, to: 2 }));
    expect(byLabel(r, "shortest").steps[0]).toMatchObject({ side: "north", sideMapped: true });
    expect(byLabel(r, "recommended").steps[0]).toMatchObject({ side: "south", sideMapped: false });
    expect(byLabel(r, "recommended").steps[0].text).toBe("Head east on the south side (on your right) of Ayala Avenue");
  });

  it("words a turn onto a sidewalk as walk on the side", () => {
    // A footway runs north from P (0, -100) to A, then the walk turns right along the south sidewalk.
    const data = makeData({
      nodes: [...AVENUE, [0, -100]],
      edges: [{ u: 3, v: 0 }, south(0, 1, 0, 200), south(1, 2, 200, 400)],
      nodeFlags: [4, 0, 4, 0],
    });
    const steps = findRoutes(data, query({ from: 3, to: 2 })).routes[0].steps;
    expect(steps.map((x) => x.text)).toEqual(["Head north", "Turn right, then walk on the south side (on your right) of Ayala Avenue"]);
    expect(steps[1].textTl).toBe("Kumanan, tapos sa timog na bahagi (sa kanan mo) ng Ayala Avenue");
    expect(steps[1].side).toBe("south");
    expect(steps[0].side).toBeUndefined();
  });
});

describe("the walker's own side", () => {
  // Only the north sidewalk exists, so both directions walk on it.
  const data = makeData({ nodes: AVENUE, edges: [north(0, 1, 0, 200), north(1, 2, 200, 400)], nodeFlags: [4, 4, 4] });

  it("puts the north side on the left when walking east", () => {
    const step = findRoutes(data, query({ from: 0, to: 2 })).routes[0].steps[0];
    expect(step.text).toBe("Head east on the north side (on your left) of Ayala Avenue");
    expect(step.textTl).toBe("Maglakad pa-east sa hilagang bahagi (sa kaliwa mo) ng Ayala Avenue");
  });

  it("puts the north side on the right when walking west", () => {
    const step = findRoutes(data, query({ from: 2, to: 0 })).routes[0].steps[0];
    expect(step.text).toBe("Head west on the north side (on your right) of Ayala Avenue");
    expect(step.textTl).toBe("Maglakad pa-west sa hilagang bahagi (sa kanan mo) ng Ayala Avenue");
  });
});

describe("side switches", () => {
  // Only the north sidewalk exists from A to B and only the south one from B to C, so the direct
  // walk must change sides at B. A footway through X at (200, y) is the way around.
  const build = (flagB: number, y: number | null) =>
    makeData({
      nodes: [...AVENUE, [200, y ?? 300]],
      edges: [
        north(0, 1, 0, 200),
        { ...south(1, 2, 200, 400), geom: [[200, -5], [400, -5]] },
        ...(y === null ? [] : [{ u: 0, v: 3 }, { u: 3, v: 2 }]),
      ],
      nodeFlags: [4, flagB, 4, 0],
    });
  const switches = (route: Route) => edgeIdx(route.edgeIds).join(",") === "0,1";

  it("refuses a switch mid-block", () => {
    const r = findRoutes(build(0, 100), query({ from: 0, to: 2 }));
    for (const route of r.routes) expect(switches(route)).toBe(false);
    expect(findRoutes(build(0, null), query({ from: 0, to: 2 })).state).toBe("no_route");
  });

  it("allows a free switch at a mapped crossing or signals", () => {
    for (const flag of [1, 2, 1 | 4]) {
      const r = findRoutes(build(flag, 100), query({ from: 0, to: 2 }));
      const s = byLabel(r, "shortest");
      expect(switches(s)).toBe(true);
      expect(s.length_m).toBe(400);
      expect(s.steps[1].text).toBe("Cross to the south side (on your right) of Ayala Avenue");
      expect(s.steps[1].textTl).toBe("Tumawid sa timog na bahagi (sa kanan mo) ng Ayala Avenue");
      expect(s.steps[1].flags).toContain("crossing");
      expect(s.warnings).not.toContain("Crosses a road where there is no marked crossing.");
    }
  });

  it("charges 60 m for a switch at an unmarked junction and warns", () => {
    // A 447 m way around beats 400 m plus 60 m. A 477 m way around does not.
    const around = byLabel(findRoutes(build(4, 100), query({ from: 0, to: 2 })), "shortest");
    expect(switches(around)).toBe(false);
    expect(around.length_m).toBe(447);
    const r = findRoutes(build(4, 130), query({ from: 0, to: 2 }));
    const s = byLabel(r, "shortest");
    expect(switches(s)).toBe(true);
    expect(s.length_m).toBe(400);
    expect(s.steps[1].text).toBe("Cross where there is no marked crossing. Walk on the south side (on your right) of Ayala Avenue");
    expect(s.steps[1].flags).toContain("crossing");
    expect(s.warnings).toContain("Crosses a road where there is no marked crossing.");
  });

  it("reads the side from the way direction, not the bend of a curved piece", () => {
    // B to C bulges 150 m north. Its south sidewalk line then has a mean point north of the chord, so the
    // old offset test called the move from the north sidewalk a same-side move and hid the crossing at B.
    const curved = (flagB: number) =>
      makeData({
        nodes: AVENUE,
        edges: [north(0, 1, 0, 200), { ...south(1, 2, 200, 400), geom: [[200, -5], [300, 145], [400, -5]] }],
        nodeFlags: [4, flagB, 4],
      });
    expect(sideSwitch(curved(0), 0, 1, 1)).toBe(Switch.Forbidden);
    expect(findRoutes(curved(0), query({ from: 0, to: 2 })).state).toBe("no_route");
    const s = byLabel(findRoutes(curved(4), query({ from: 0, to: 2 })), "shortest");
    expect(s.steps[1].text).toMatch(/^Cross where there is no marked crossing\. /);
    expect(s.warnings).toContain("Crosses a road where there is no marked crossing.");
  });

  it("keeps a walker on one sidewalk through a mid-block bend", () => {
    // Both pieces carry only the north sidewalk. B to C bulges 150 m south, so its mean point falls south of
    // the chord, and the old offset test forbade this same-side move: no route.
    const data = makeData({
      nodes: AVENUE,
      edges: [north(0, 1, 0, 200), north(1, 2, 200, 400, { geom: [[200, 5], [300, -145], [400, 5]] })],
      nodeFlags: [4, 0, 4],
    });
    expect(sideSwitch(data, 0, 1, 1)).toBe(Switch.None);
    const r = findRoutes(data, query({ from: 0, to: 2 }));
    expect(r.state).toBe("ok");
    expect(byLabel(r, "shortest").warnings).not.toContain("Crosses a road where there is no marked crossing.");
  });

  it("counts a U-turn onto the other sidewalk of the same piece as a switch", () => {
    // Walking the north sidewalk west from B to A, then back east on the south sidewalk, crosses at A.
    const data = makeData({ nodes: AVENUE, edges: [north(0, 1, 0, 200), south(0, 1, 0, 200)], nodeFlags: [0, 4, 4] });
    expect(sideSwitch(data, 0, 1, 0)).toBe(Switch.Forbidden);
    expect(sideSwitch(data, 0, 1, 1)).toBe(Switch.Junction);
  });

  it("keeps the same sidewalk round a sharp corner between two ways", () => {
    // A road reaches X (200, 0) from the west on one way and leaves on another way back to the southwest,
    // a 150 degree turn. The second way runs from Y to X. The north (left) sidewalk of the first way and the
    // southeast (right) sidewalk of the second both run round the outside of the corner. The south and the
    // northwest sidewalks both run round the inside.
    const data = makeData({
      nodes: [
        [0, 0],
        [200, 0],
        [27, -100],
      ],
      edges: [
        { u: 0, v: 1, name: "Osmena Highway", side: "left", way: 1, geom: [[0, 5], [200, 5]] },
        { u: 0, v: 1, name: "Osmena Highway", side: "right", way: 1, geom: [[0, -5], [200, -5]] },
        { u: 2, v: 1, name: "Osmena Highway", side: "right", way: 2, geom: [[29.5, -104.3], [202.5, -4.3]] },
        { u: 2, v: 1, name: "Osmena Highway", side: "left", way: 2, geom: [[24.5, -95.7], [197.5, 4.3]] },
      ],
      nodeFlags: [4, 0, 4],
    });
    expect(sideSwitch(data, 0, 2, 1)).toBe(Switch.None);
    expect(sideSwitch(data, 1, 3, 1)).toBe(Switch.None);
    expect(sideSwitch(data, 0, 3, 1)).toBe(Switch.Forbidden);
    expect(sideSwitch(data, 1, 2, 1)).toBe(Switch.Forbidden);
  });

  it("leaves moves onto centre edges alone", () => {
    // From the north sidewalk onto a footway and back is not a side switch, even mid-block.
    const data = makeData({
      nodes: [...AVENUE, [200, 40]],
      edges: [north(0, 1, 0, 200), { u: 1, v: 3 }, { u: 3, v: 2 }],
      nodeFlags: [0, 0, 0, 0],
    });
    expect(findRoutes(data, query({ from: 0, to: 2 })).state).toBe("ok");
  });
});

describe("arrival-time shade", () => {
  it("scores each edge with the bucket in force when the walker reaches it", () => {
    // Buckets at 14:30, 15:00, and 15:30. The second edge is shaded only in the 14:30 bucket.
    const data = makeData({
      nodes: [
        [0, 0],
        [200, 0],
        [400, 0],
      ],
      edges: [
        { u: 0, v: 1, building: 100 },
        { u: 1, v: 2, building: [100, 0, 0] },
      ],
      buckets: [870, 900, 930],
      sun: [
        [40, 250],
        [38, 252],
        [35, 255],
      ],
    });
    // Leaving at 14:57, the walker reaches the second edge at 15:00, so its shade is gone.
    const late = byLabel(findRoutes(data, query({ from: 0, to: 2, bucketIdx: 0, departMin: 897 })), "shortest");
    expect(late.covered_pct).toBe(50);
    expect(late.split).toEqual({ roof_m: 0, building_m: 200, tree_m: 0, sun_m: 200 });
    expect(late.segments.map((x) => x.kind)).toEqual(["building", "sun"]);
    expect(late.sun_minutes).toBeCloseTo(3.1, 5);
    expect(late.steps[0].cover).toBe("mixed");
    // Leaving at 14:40, the whole walk stays inside the 14:30 bucket.
    const early = byLabel(findRoutes(data, query({ from: 0, to: 2, bucketIdx: 0, departMin: 880 })), "shortest");
    expect(early.covered_pct).toBe(100);
  });
});
