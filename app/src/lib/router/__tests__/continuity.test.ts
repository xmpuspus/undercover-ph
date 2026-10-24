import { describe, expect, it } from "vitest";
import { advanceSide, Switch } from "../astar";
import { findRoutes } from "../index";
import { edgeIdx, makeData, query, type EdgeSpec } from "./helpers";

const UNMARKED = "Crosses a road where there is no marked crossing.";
const road = (u: number, v: number, side: EdgeSpec["side"], extra: Partial<EdgeSpec> = {}): EdgeSpec =>
  ({ u, v, side, name: "Main Street", way: 7, ...extra });

describe("sidewalk continuity across centre runs", () => {
  const chain = (flags: number[], sameSide = false, reversed = 0) => {
    const edges = [road(0, 1, "left"), road(1, 2, "centre"), road(2, 3, "centre"), road(3, 4, "centre"), road(4, 5, sameSide ? "left" : "right")];
    edges.forEach((e, i) => {
      if (!(reversed & (1 << i))) return;
      [e.u, e.v] = [e.v, e.u];
      if (e.side !== "centre") e.side = e.side === "left" ? "right" : "left";
    });
    return makeData({ nodes: [[0, 0], [100, 0], [200, 0], [300, 0], [400, 0], [500, 0]], edges, nodeFlags: flags });
  };

  it("uses every entry, interior and exit node, in either walking and way direction", () => {
    for (const reversed of [0, 1, 2, 4, 8, 16, 31]) {
      for (const [from, to] of [[0, 5], [5, 0]]) {
        for (let node = 1; node <= 4; node++) {
          for (const flag of [0, 1, 2, 4]) {
            const flags = [4, 0, 0, 0, 0, 4];
            flags[node] = flag;
            const r = findRoutes(chain(flags, false, reversed), query({ from, to }));
            expect(r.state).toBe(flag === 0 ? "no_route" : "ok");
            if (flag !== 0) {
              const s = r.routes.find((x) => x.label === "shortest")!;
              expect(s.warnings.includes(UNMARKED)).toBe(flag === 4);
              expect(s.steps.some((x) => x.flags.includes("crossing"))).toBe(true);
              if (flag === 4) expect(s.steps.some((x) => x.textTl.includes("Tumawid kahit walang tawiran"))).toBe(true);
            }
          }
        }
      }
    }
  });

  it("prefers a marked crossing over an earlier or later unmarked junction", () => {
    for (const flags of [[4, 4, 0, 1, 0, 4], [4, 0, 2, 0, 4, 4]]) {
      for (const [from, to] of [[0, 5], [5, 0]]) {
        const s = findRoutes(chain(flags), query({ from, to })).routes[0];
        expect(s.warnings).not.toContain(UNMARKED);
      }
    }
  });

  it("keeps a same-side run free and allows starts and ends on centre edges", () => {
    const flags = [4, 0, 0, 0, 0, 4];
    expect(findRoutes(chain(flags, true, 21), query({ to: 5 })).state).toBe("ok");
    expect(findRoutes(chain(flags), query({ from: 2, to: 5 })).state).toBe("ok");
    expect(findRoutes(chain(flags), query({ from: 0, to: 3 })).state).toBe("ok");
    const legacy = chain(flags);
    legacy.nodeFlags = null;
    expect(findRoutes(legacy, query({ to: 5 })).routes[0].warnings).not.toContain(UNMARKED);
  });

  it("retains a more expensive incoming sidewalk at a shared centre edge", () => {
    const data = makeData({
      nodes: [[0, 0], [100, 0], [200, 0], [300, 0]],
      edges: [road(0, 1, "left"), road(0, 1, "right", { geom: [[0, -5], [50, -30], [100, -5]] }), road(1, 2, "centre"), road(2, 3, "right")],
      nodeFlags: [4, 0, 0, 4],
    });
    const s = findRoutes(data, query({ to: 3 })).routes[0];
    expect(edgeIdx(s.edgeIds)).toEqual([1, 2, 3]);
    expect(s.warnings).not.toContain(UNMARKED);
  });

  it("retains a longer arrival with a marked crossing at a shared centre edge", () => {
    const data = makeData({
      nodes: [[0, 0], [100, 0], [200, 0], [300, 0], [100, 50], [400, 0]],
      edges: [road(0, 1, "left"), road(1, 2, "centre"), road(0, 4, "left"), road(4, 2, "centre"), road(2, 3, "centre"), road(3, 5, "right")],
      nodeFlags: [4, 0, 0, 0, 1, 4],
    });
    const s = findRoutes(data, query({ to: 5 })).routes[0];
    expect(edgeIdx(s.edgeIds)).toEqual([2, 3, 4, 5]);
    expect(s.warnings).not.toContain(UNMARKED);
  });

  it("resets continuity on a different road, but follows a shared name or way", () => {
    const build = (middle: Partial<EdgeSpec>) => makeData({
      nodes: [[0, 0], [100, 0], [200, 0], [300, 0]],
      edges: [road(0, 1, "left"), road(1, 2, "centre", middle), road(2, 3, "right")],
      nodeFlags: [4, 0, 0, 4],
    });
    expect(findRoutes(build({ name: "Other Street", way: 8 }), query({ to: 3 })).state).toBe("ok");
    expect(findRoutes(build({ way: 8 }), query({ to: 3 })).state).toBe("no_route");
    expect(findRoutes(build({ name: null }), query({ to: 3 })).state).toBe("no_route");
  });

  it("keeps the physical sidewalk through a U-turn at either end of a centre run", () => {
    for (const atEntry of [true, false]) {
      for (const side of ["left", "right"] as const) {
        const data = makeData({
          nodes: [[0, 0], [100, 0], [200, 0]],
          edges: [road(0, 1, "left"), atEntry ? road(0, 1, "centre") : road(1, 2, "centre"), road(1, 2, side)],
          nodeFlags: [0, 0, 0],
        });
        const entry = advanceSide(data, 0, 1, atEntry ? 0 : 1, 0);
        const exit = advanceSide(data, 1, 2, atEntry ? 1 : 2, entry.context);
        expect(exit.switchIn).toBe(side === "left" ? Switch.None : Switch.Forbidden);
      }
    }
  });
});

describe("street steps around short connectors", () => {
  const trip = (connectorLengths: number[], extra: Partial<EdgeSpec> = {}, lastSide: EdgeSpec["side"] = "left") => {
    const nodes: [number, number][] = [[0, 0], [100, 0]];
    const edges: EdgeSpec[] = [road(0, 1, "left")];
    connectorLengths.forEach((length, i) => {
      nodes.push([100, nodes[nodes.length - 1][1] - length]);
      edges.push(road(i + 1, i + 2, "centre", { name: `Link ${i}`, way: 10 + i, ...extra }));
    });
    const u = nodes.length - 1;
    nodes.push([200, nodes[u][1]]);
    edges.push(road(u, u + 1, lastSide));
    return findRoutes(makeData({ nodes, edges, nodeFlags: nodes.map(() => 4) }), query({ to: u + 1 })).routes[0];
  };

  it("joins the same street around one or several brief walking links", () => {
    for (const lengths of [[24], [10, 12], [21, 2]]) {
      const s = trip(lengths).steps;
      expect(s).toHaveLength(1);
      expect(s[0].distance_m).toBe(200 + lengths.reduce((a, b) => a + b, 0));
      expect(s[0].text).toContain("Main Street");
      expect(s[0].textTl).toContain("Main Street");
    }
  });

  it("keeps a longer diversion and a change of sidewalk separate", () => {
    expect(trip([25]).steps.filter((s) => s.text.includes("Main Street"))).toHaveLength(2);
    expect(trip([24], {}, "right").steps.filter((s) => s.text.includes("Main Street"))).toHaveLength(2);
  });

  it("keeps crossing and stair instructions when their short legs fold", () => {
    for (const [flags, phrase, phraseTl] of [[256, "cross", "tumawid"], [16, "stairs", "hagdan"]] as const) {
      const s = trip([12], { flags }).steps;
      expect(s).toHaveLength(2);
      expect(s[1].text.toLowerCase()).toContain(phrase);
      expect(s[1].textTl.toLowerCase()).toContain(phraseTl);
    }
  });
});
