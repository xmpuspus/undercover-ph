import { describe, expect, it } from "vitest";
import { advanceSide, Switch } from "../../router/astar";
import { DAY, edgeIdx, makeData, NIGHT, THURSDAY } from "../../router/__tests__/helpers";
import type { Data } from "../../router/types";
import { parseJog } from "../attrs";
import { streetsOf } from "../history";
import { findLoops, measureLoop } from "../loops";
import type { JogQuery, Loop, RunRecord } from "../types";
import { grid, rawJog, repeatedMetres, sharedMetres, sidewalkGrid } from "./fixtures";

// Acceptance for the loop engine, SPEC J-E2 to J-E10 and J-H5 (app/src/lib/jog/SPEC.md).
// A 12 by 12 grid of 100 m blocks gives 26.4 km of streets around a start in its middle.

const G = grid(12, 12, 100);
const START = G.at(5, 5);
const JOG = parseJog(rawJog(G.data), G.data.edgeCount);

function q(over: Partial<JogQuery> = {}): JogQuery {
  return { start: START, targetM: 3000, dateIdx: THURSDAY, bucketIdx: DAY, departMin: 900, paceMinPerKm: 7, seed: 1, ...over };
}

function checkClosed(data: Data, start: number, loop: Loop) {
  const edges = edgeIdx(loop.edgeIds);
  expect(loop.nodes.length).toBe(edges.length + 1);
  expect(loop.nodes[0]).toBe(start);
  expect(loop.nodes[loop.nodes.length - 1]).toBe(start);
  edges.forEach((e, i) => {
    const a = loop.nodes[i], b = loop.nodes[i + 1];
    expect((data.edgeU[e] === a && data.edgeV[e] === b) || (data.edgeV[e] === a && data.edgeU[e] === b)).toBe(true);
  });
  let context = 0;
  edges.forEach((e, i) => {
    const move = advanceSide(data, i > 0 ? edges[i - 1] : -1, e, loop.nodes[i], context);
    expect(move.switchIn).not.toBe(Switch.Forbidden);
    context = move.context;
  });
}

describe("findLoops on a grid", () => {
  const r = findLoops(G.data, JOG, q());

  it("returns three loops that close at the start, with connected edges", () => {
    expect(r.state).toBe("ok");
    expect(r.loops).toHaveLength(3);
    for (const loop of r.loops) checkClosed(G.data, START, loop);
  });

  it("keeps every loop within 10% of the target length", () => {
    for (const loop of r.loops) expect(Math.abs(loop.length_m - 3000)).toBeLessThanOrEqual(300);
  });

  it("returns loops that share at most 30% of their street metres", () => {
    for (let i = 0; i < r.loops.length; i++) {
      for (let j = i + 1; j < r.loops.length; j++) {
        const a = edgeIdx(r.loops[i].edgeIds), b = edgeIdx(r.loops[j].edgeIds);
        const shorter = Math.min(r.loops[i].length_m, r.loops[j].length_m);
        expect(sharedMetres(G.data, a, b)).toBeLessThanOrEqual(0.3 * shorter + 1e-6);
      }
    }
  });

  it("repeats at most 10% of a loop, so no loop is an out and back", () => {
    for (const loop of r.loops) {
      const rep = repeatedMetres(G.data, edgeIdx(loop.edgeIds));
      expect(rep).toBeLessThanOrEqual(0.1 * loop.length_m + 1e-6);
      expect(loop.repeat_pct).toBeLessThanOrEqual(10);
    }
  });

  it("gives the same loops for the same seed and new loops for a new seed", () => {
    const again = findLoops(G.data, JOG, q());
    expect(again.loops.map((l) => l.edgeIds)).toEqual(r.loops.map((l) => l.edgeIds));
    const other = findLoops(G.data, JOG, q({ seed: 2 }));
    const keys = new Set(r.loops.map((l) => l.edgeIds.join(",")));
    expect(other.loops.some((l) => !keys.has(l.edgeIds.join(",")))).toBe(true);
  });

  it("reports its searches and time and does not hit the budget on a small grid", () => {
    expect(r.searches).toBeGreaterThan(0);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(r.budgetHit).toBe(false);
  });

  it("works for a 1 km target, and for 5 km on a grid big enough to hold it", () => {
    const big = grid(24, 24, 100);
    const bigJog = parseJog(rawJog(big.data), big.data.edgeCount);
    for (const [g, jog, start, targetM] of [[G, JOG, START, 1000], [big, bigJog, big.at(12, 12), 5000]] as const) {
      const res = findLoops(g.data, jog, q({ start, targetM }));
      expect(res.loops.length).toBeGreaterThanOrEqual(1);
      for (const loop of res.loops) {
        checkClosed(g.data, start, loop);
        expect(Math.abs(loop.length_m - targetM)).toBeLessThanOrEqual(0.1 * targetM);
      }
    }
  });
});

describe("findLoops edge cases", () => {
  it("never changes sides mid-block, also where one leg ends and the next begins", () => {
    const S = sidewalkGrid(9, 9, 100);
    const jog = parseJog(rawJog(S.data), S.data.edgeCount);
    const start = S.at(4, 4);
    const res = findLoops(S.data, jog, q({ start, targetM: 2000 }));
    expect(res.loops.length).toBeGreaterThanOrEqual(1);
    for (const loop of res.loops) checkClosed(S.data, start, loop);
  });

  it("a start on a dead end loops from the first junction and runs the stem out and back", () => {
    const D = grid(12, 12, 100, { spur: { row: 5, len: [100, 100] } });
    const jog = parseJog(rawJog(D.data), D.data.edgeCount);
    const deadEnd = D.data.nodeCount - 1;
    const res = findLoops(D.data, jog, q({ start: deadEnd, targetM: 3000 }));
    expect(res.loops.length).toBeGreaterThanOrEqual(1);
    for (const loop of res.loops) {
      checkClosed(D.data, deadEnd, loop);
      expect(Math.abs(loop.length_m - 3000)).toBeLessThanOrEqual(300);
      const rep = repeatedMetres(D.data, edgeIdx(loop.edgeIds));
      // The 200 m stem is walked twice. Apart from it, the loop repeats at most 10%.
      expect(rep - 200).toBeLessThanOrEqual(0.1 * loop.length_m + 1e-6);
    }
  });

  it("an unreachable target length gives no_loop with the closest length in a note", () => {
    const tiny = grid(3, 3, 100);
    const jog = parseJog(rawJog(tiny.data), tiny.data.edgeCount);
    const res = findLoops(tiny.data, jog, q({ start: tiny.at(1, 1), targetM: 10_000 }));
    expect(res.state).toBe("no_loop");
    expect(res.loops).toHaveLength(0);
    expect(res.notes.join(" ")).toMatch(/\d[\d.,]* km/);
  });

  it("stops at the time budget and returns what it found", () => {
    let t = 0;
    const res = findLoops(G.data, JOG, q({ budgetMs: 100, now: () => (t += 10) }));
    expect(res.budgetHit).toBe(true);
    expect(res.searches).toBeLessThanOrEqual(12);
    expect(res.elapsedMs).toBeGreaterThanOrEqual(100);
    expect(res.loops.length).toBeLessThanOrEqual(3);
    for (const loop of res.loops) checkClosed(G.data, START, loop);
  });

  it("works with no jog file, scoring shade and crossings only", () => {
    const res = findLoops(G.data, null, q());
    expect(res.loops.length).toBeGreaterThanOrEqual(1);
    expect(res.notes.join(" ")).toMatch(/not loaded|no extra data|street data/i);
  });

  it("a start outside the map gives state outside", () => {
    const res = findLoops(G.data, JOG, q({ start: -1 }));
    expect(res.state).toBe("outside");
  });
});

describe("history makes later loops use new streets", () => {
  it("loops after a marked run share less with it", () => {
    const first = findLoops(G.data, JOG, q());
    const ran = first.loops[0];
    const history: RunRecord[] = [{ id: "r1", area: "test", date: "2026-10-24", length_m: ran.length_m, streets: streetsOf(G.data, edgeIdx(ran.edgeIds)) }];
    const again = findLoops(G.data, JOG, q({ history }));
    expect(again.loops.length).toBeGreaterThanOrEqual(1);
    const best = again.loops[0];
    expect(best.new_pct).not.toBeNull();
    expect(best.new_pct!).toBeGreaterThanOrEqual(70);
    expect(best.shared_m).toBeLessThan(0.3 * ran.length_m);
    const same = measureLoop(G.data, JOG, { edges: edgeIdx(ran.edgeIds), nodes: ran.nodes }, q({ history }));
    expect(same.new_pct).toBeLessThanOrEqual(5);
  });

  it("with Prefer new streets off, history changes nothing", () => {
    const first = findLoops(G.data, JOG, q());
    const ran = first.loops[0];
    const history: RunRecord[] = [{ id: "r1", area: "test", date: "2026-10-24", length_m: ran.length_m, streets: streetsOf(G.data, edgeIdx(ran.edgeIds)) }];
    const off = findLoops(G.data, JOG, q({ history, preferNew: false }));
    expect(off.loops.map((l) => l.edgeIds)).toEqual(first.loops.map((l) => l.edgeIds));
  });
});

describe("measureLoop reads each edge at the runner's arrival time", () => {
  // A 4 km square: edges 0 and 1 are shaded at 10:00 and 10:30, edges 2 and 3 only at 10:30.
  const square = makeData({
    nodes: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]],
    edges: [
      { u: 0, v: 1, building: [100, 100, 0] },
      { u: 1, v: 2, building: [100, 100, 0] },
      { u: 2, v: 3, building: [0, 100, 0] },
      { u: 3, v: 0, building: [0, 100, 0] },
    ],
    buckets: [600, 630, 1110],
    sun: [[40, 100], [45, 110], [-5, 262]],
    nodeFlags: [5, 5, 5, 5],
  });
  const jog = parseJog(rawJog(square), square.edgeCount);
  const path = { edges: [0, 1, 2, 3], nodes: [0, 1, 2, 3, 0] };
  const at = (paceMinPerKm: number, bucketIdx = 0, departMin = 600) =>
    measureLoop(square, jog, path, { start: 0, targetM: 4000, dateIdx: THURSDAY, bucketIdx, departMin, paceMinPerKm });

  it("a faster pace reaches the last two edges before 10:30", () => {
    expect(at(5).shade_pct).toBe(50);
    expect(at(10).shade_pct).toBe(75);
    expect(at(5).minutes).toBe(20);
    expect(at(10).minutes).toBe(40);
  });

  it("in the dark the loop says so and has no shade share", () => {
    const dark = at(7, 2, 1110);
    expect(dark.dark).toBe(true);
    expect(dark.shade_pct).toBeNull();
  });

  it("puts a km mark at each full km", () => {
    const m = at(7);
    expect(m.kmMarks).toHaveLength(3);
  });

  it("reports steps with minutes at the runner's pace", () => {
    const m = at(5);
    expect(m.steps.length).toBeGreaterThan(0);
    for (const s of m.steps) {
      if (s.distance_m > 0) expect(s.minutes).toBe(Math.max(1, Math.ceil(s.distance_m / 200 - 1e-9)));
    }
  });
});

describe("findLoops marks a loop that runs after dark", () => {
  it("at night every loop is dark and has no shade share", () => {
    const res = findLoops(G.data, JOG, q({ bucketIdx: NIGHT, departMin: 1110 }));
    expect(res.dark).toBe(true);
    for (const loop of res.loops) {
      expect(loop.dark).toBe(true);
      expect(loop.shade_pct).toBeNull();
    }
  });
});
