import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceSide, aStar, type SearchSpec } from "../astar";
import { findRoutes } from "../index";
import { edgeIdx, makeData, query, type EdgeSpec } from "./helpers";

const road = (u: number, v: number, extra: Partial<EdgeSpec> = {}): EdgeSpec =>
  ({ u, v, name: "Main Street", side: "left", way: 7, ...extra });
afterEach(() => vi.restoreAllMocks());

describe("review regressions", () => {
  it("rejoins uncovered and covered streets across a brief covered or uncovered link", () => {
    for (const streetFlags of [32, 33]) {
      for (const linkFlags of [0, 1]) {
        const data = makeData({
          nodes: [[0, 0], [100, 0], [100, -24], [200, -24]],
          edges: [road(0, 1, { flags: streetFlags }), road(1, 2, { name: "Link Street", way: 8, side: "centre", flags: linkFlags }), road(2, 3, { flags: streetFlags })],
          nodeFlags: [4, 4, 4, 4],
        });
        const steps = findRoutes(data, query({ to: 3 })).routes[0].steps;
        expect(steps).toHaveLength(1);
        expect(steps[0].distance_m).toBe(224);
        expect(steps[0].text).not.toMatch(/turn left/i);
        if (streetFlags & 1) expect(steps[0].cover).toBe("roof");
      }
    }
  });

  it("rejoins the street across a short link when its cover changes in either direction", () => {
    for (const firstFlags of [32, 33]) {
      for (const lastFlags of [32, 33]) {
        for (const linkFlags of [0, 1]) {
          const data = makeData({
            nodes: [[0, 0], [100, 0], [100, -24], [200, -24]],
            edges: [road(0, 1, { flags: firstFlags }), road(1, 2, { name: "Link Street", way: 8, side: "centre", flags: linkFlags }), road(2, 3, { flags: lastFlags })],
            nodeFlags: [4, 4, 4, 4],
          });
          for (const [from, to] of [[0, 3], [3, 0]]) {
            const route = findRoutes(data, query({ from, to, mode: "rain" })).routes.find((r) => r.label === "shortest")!;
            expect(route.steps, JSON.stringify({ firstFlags, lastFlags, linkFlags, from })).toHaveLength(1);
            expect(route.steps[0].distance_m).toBe(224);
            expect(route.steps[0].text).not.toMatch(/turn (left|right)/i);
            expect(route.steps[0].textTl).not.toMatch(/kumaliwa|kumanan/i);
            const roof = ((firstFlags & 1) ? 100 : 0) + ((lastFlags & 1) ? 100 : 0) + (linkFlags ? 24 : 0);
            expect(route.split.roof_m).toBe(roof);
            expect(route.split.sun_m).toBe(224 - roof);
            if (firstFlags !== lastFlags) {
              expect(route.steps[0].text).toContain("Main Street");
              expect(route.steps[0].textTl).toContain("Main Street");
              expect(route.steps[0].cover).toBe("mixed");
              expect(route.steps[0].text).not.toContain("Take the covered walkway");
            }
          }
        }
      }
    }
  });

  it("keeps real turns, side changes and structural links across a street cover change", () => {
    for (const [firstFlags, lastFlags] of [[32, 33], [33, 32]]) {
      for (const change of ["turn", "side", "crossing", "stairs"] as const) {
        const data = makeData({
          nodes: [[0, 0], [100, 0], [100, -24], change === "turn" ? [100, -124] : [200, -24]],
          edges: [road(0, 1, { flags: firstFlags }), road(1, 2, { name: "Link Street", way: 8, side: "centre", flags: change === "crossing" ? 256 : change === "stairs" ? 16 : 1 }), road(2, 3, { flags: lastFlags, side: change === "side" ? "right" : "left" })],
          nodeFlags: [4, 4, 4, 4],
        });
        const route = findRoutes(data, query({ to: 3 })).routes.find((r) => r.label === "shortest")!;
        expect(route.steps).toHaveLength(2);
        if (change === "crossing") expect(route.steps[1].flags).toContain("crossing");
        if (change === "stairs") expect(route.steps[1].flags).toContain("stairs");
      }
    }
  });

  it("allocates extra states only for centres reachable through same-road moves", () => {
    const nodes: [number, number][] = [[0, 0], [100, 0], [200, 0], [300, 0], [400, 0]];
    const edges: EdgeSpec[] = [
      road(0, 1),
      road(1, 2, { side: "centre", way: 8 }),
      road(2, 3, { side: "centre", name: "Renamed Street", way: 8 }),
      road(3, 4, { side: "centre", name: "Renamed Street", way: 9 }),
      road(0, 1, { side: "centre", name: "Parallel", way: 99 }),
    ];
    for (let i = 0; i < 30; i++) {
      const u = nodes.length;
      nodes.push([1000 + i * 10, 0], [1000 + i * 10, 10]);
      edges.push({ u, v: u + 1, side: "centre", name: "Unrelated footway", way: 100 });
    }
    const data = makeData({ nodes, edges, nodeFlags: nodes.map(() => 0) });
    const sizes: number[] = [];
    const Native = Float64Array;
    const tracked = class extends Native {
      constructor(size: number) { super(size); sizes.push(size); }
    };
    vi.spyOn(globalThis, "Float64Array").mockImplementation(tracked as typeof Float64Array);
    const spec: SearchSpec = { allowed: new Uint8Array(edges.length).fill(1), exposure: new Float32Array(edges.length), departMin: 900, dateIdx: 0 };
    expect(aStar(data, spec, 0, 4, 0)).not.toBeNull();
    // Four eligible centres, including name/way bridges and the parallel-arm fallback.
    expect(sizes[0]).toBeLessThanOrEqual(2 * edges.length + 4 * 8);
  });

  it("reuses transition results rather than allocating on each carried-side move", () => {
    const data = makeData({ nodes: [[0, 0], [100, 0], [200, 0]], edges: [road(0, 1), road(1, 2, { side: "centre" })], nodeFlags: [0, 0, 0] });
    expect(advanceSide(data, 0, 1, 1, 0)).toBe(advanceSide(data, 0, 1, 1, 0));
  });

  it("calculates the exact heuristic at most once per visited node in a search", () => {
    const data = makeData({ nodes: [[0, 0], [100, 0], [200, 0], [300, 0], [400, 0]], edges: [road(0, 1), road(1, 2), road(2, 3), road(3, 4)] });
    const hypot = vi.spyOn(Math, "hypot");
    const spec: SearchSpec = { allowed: new Uint8Array(4).fill(1), exposure: new Float32Array(4), departMin: 900, dateIdx: 0 };
    expect(aStar(data, spec, 0, 4, 0)?.length).toBe(400);
    expect(hypot.mock.calls.length).toBeLessThanOrEqual(data.nodeCount);
  });

  it("reuses graph search buffers when diagnosing a disconnected route", () => {
    const data = makeData({ nodes: [[0, 0], [100, 0], [300, 0], [400, 0]], edges: [road(0, 1), road(2, 3)] });
    const spec: SearchSpec = { allowed: new Uint8Array(2).fill(1), exposure: new Float32Array(2), departMin: 900, dateIdx: 0 };
    expect(aStar(data, spec, 0, 3, 0)).toBeNull();
    // The graph is already prepared. Checking other hours and access must reuse that preparation.
    const allocations: number[] = [];
    const Native = Float64Array;
    const tracked = class extends Native {
      constructor(size: number) { super(size); allocations.push(size); }
    };
    vi.spyOn(globalThis, "Float64Array").mockImplementation(tracked as typeof Float64Array);
    const result = findRoutes(data, query({ to: 3, stepFree: true }));
    expect(result.state).toBe("no_route");
    expect(result.notes).toContain("No walking route connects these points at any hour.");
    expect(allocations).toEqual([]);
  });

  it("keeps passage entry and exit hours active after diagnosing a closure", () => {
    const data = makeData({
      nodes: [[0, 0], [400, 0]], edges: [{ u: 0, v: 1, flags: 4, hours: 0 }],
      hours: [{ name: "Passage", rules: { thu: ["10:00", "21:00"] }, source_url: "https://example.org/hours", checked: "2026-10-20" }],
    });
    for (const departMin of [21 * 60 + 5, 20 * 60 + 58]) {
      const result = findRoutes(data, query({ departMin }));
      expect(result.state).toBe("no_route");
      expect(result.notes).toContain("Every route between these points passes through a place that is closed at this time.");
      expect(data.edgeHours[0]).toBe(0);
      expect(findRoutes(data, query({ departMin: 20 * 60 })).state).toBe("ok");
    }
  });

  it("does not classify turns in disconnected streets before they are visited", () => {
    const nodes: [number, number][] = [];
    const edges: EdgeSpec[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push([i * 100, 0], [i * 100 + 50, 0]);
      edges.push(road(i * 2, i * 2 + 1));
    }
    const data = makeData({ nodes, edges });
    let reads = 0;
    data.edgeName = new Proxy(data.edgeName, { get(target, key, receiver) {
      if (typeof key === "string" && Number.isInteger(Number(key))) reads++;
      return Reflect.get(target, key, receiver);
    } });
    const spec: SearchSpec = { allowed: new Uint8Array(100).fill(1), exposure: new Float32Array(100), departMin: 900, dateIdx: 0 };
    expect(aStar(data, spec, 0, 1, 0)?.length).toBe(50);
    expect(reads).toBe(0);
  });

  it("keeps crossing instructions when free centre arrivals share a search state", () => {
    const data = makeData({
      nodes: [[0, 0], [100, 0], [200, 0], [300, 0]],
      edges: [road(0, 1), road(0, 1, { side: "right", geom: [[0, -5], [50, -30], [100, -5]] }), road(1, 2, { side: "centre" }), road(2, 3, { side: "right" })],
      nodeFlags: [4, 1, 0, 4],
    });
    const route = findRoutes(data, query({ to: 3 })).routes[0];
    expect(edgeIdx(route.edgeIds)).toEqual([0, 2, 3]);
    expect(route.steps.some((s) => s.text.startsWith("Cross to"))).toBe(true);
    expect(route.warnings).not.toContain("Crosses a road where there is no marked crossing.");
  });

  it("keeps crossing legality at an unusually high-degree node", () => {
    const nodes: [number, number][] = [[0, 0], [-100, 0], [100, 0]];
    const edges: EdgeSpec[] = [road(1, 0), road(0, 2, { side: "right" })];
    for (let i = 0; i < 80; i++) {
      nodes.push([i, 100]);
      edges.push({ u: 0, v: nodes.length - 1 });
    }
    for (const flag of [0, 1]) {
      const data = makeData({ nodes, edges, nodeFlags: nodes.map((_, i) => i === 0 ? flag : 0) });
      expect(findRoutes(data, query({ from: 1, to: 2 })).state).toBe(flag ? "ok" : "no_route");
    }
  });
});
