import { expect, it } from "vitest";
import { advanceSide, aStar, JUNCTION_PENALTY_M, Switch, type SearchOptions } from "../router/astar";
import { makeData } from "../router/__tests__/helpers";
import { grid, sidewalkGrid } from "./__tests__/fixtures";
import { distancePotential } from "./potential";

it("finds weighted distances and leaves disconnected nodes unreachable", () => {
  const data = makeData({ nodes: [[0, 0], [100, 0], [0, 100], [200, 0]], edges: [{ u: 0, v: 1 }, { u: 0, v: 2 }, { u: 2, v: 1 }] });
  const extra = new Float32Array(data.edgeCount); extra[0] = 10;
  const distance = distancePotential(data, extra, 0);
  expect(distance[0]).toBe(0);
  expect(distance[1]).toBeCloseTo(data.edgeLen[1] + data.edgeLen[2]);
  expect(distance[3]).toBe(Infinity);
});

it("builds bounds on the leg's permitted streets rather than a forbidden shortcut", () => {
  const data = makeData({ nodes: [[0, 0], [100, 0], [0, 100], [100, 100]], edges: [{ u: 0, v: 1 }, { u: 0, v: 2 }, { u: 2, v: 3 }, { u: 3, v: 1 }] });
  const allowed = new Uint8Array([0, 1, 1, 1]);
  const bound = distancePotential(data, new Float32Array(data.edgeCount), 0, { allowed });
  expect(bound[1]).toBeCloseTo(300);
});

it("stops at the leg's start and clips farther distances without overestimating any route", () => {
  const { data, at } = grid(30, 30, 100);
  const extra = new Float32Array(data.edgeCount);
  let reads = 0;
  const allowed = new Proxy(new Uint8Array(data.edgeCount).fill(1), { get: (array, key) => {
    if (typeof key === "string" && /^\d+$/.test(key)) reads++;
    return Reflect.get(array, key, array);
  } });
  const target = at(0, 0), start = at(2, 2);
  const bound = distancePotential(data, extra, target, { allowed, stopAt: start });
  expect(bound[start]).toBeCloseTo(400);
  expect(bound[at(29, 29)]).toBeCloseTo(400);
  expect(reads).toBeGreaterThan(0);
  expect(reads).toBeLessThan(data.edgeCount / 10);
  for (let e = 0; e < data.edgeCount; e++) {
    expect(Math.abs(bound[data.edgeU[e]] - bound[data.edgeV[e]])).toBeLessThanOrEqual(data.edgeLen[e] + 1e-6);
  }
  const spec = { allowed, exposure: extra, departMin: 900, dateIdx: 0 };
  expect(aStar(data, spec, start, target, 0, { extra, potential: bound })?.length).toBeCloseTo(400);
});

it("preserves weighted optima and incoming sidewalks with a clipped destination bound", () => {
  const { data, at } = sidewalkGrid(6, 6, 100);
  const allowed = new Uint8Array(data.edgeCount).fill(1);
  const extra = Float32Array.from({ length: data.edgeCount }, (_, e) => (e % 13) / 3);
  const junctionExtra = Float32Array.from({ length: data.edgeCount }, (_, e) => e % 9);
  const spec = { allowed, exposure: new Float32Array(data.edgeCount), departMin: 900, dateIdx: 0 };
  for (const [start, target] of [[at(1, 0), at(5, 5)], [at(2, 1), at(0, 4)], [at(4, 4), at(2, 0)]]) {
    const incoming = Array.from(data.edgeV).findIndex((v, e) => v === start && data.edgeSide[e] === 1);
    const entry = { edge: incoming, context: 0 };
    const options = { extra, junctionExtra, entry };
    const baseline = aStar(data, spec, start, target, 0, options)!;
    const bound = distancePotential(data, extra, target, { allowed, stopAt: start });
    const optimized = aStar(data, spec, start, target, 0, { ...options, potential: bound })!;
    const cost = (path: typeof baseline) => {
      let total = 0, previous = incoming, context = 0;
      for (let i = 0; i < path.edges.length; i++) {
        const e = path.edges[i], move = advanceSide(data, previous, e, path.nodes[i], context);
        expect(move.switchIn).not.toBe(Switch.Forbidden);
        total += data.edgeLen[e] * (1 + extra[e]);
        if (move.switchIn === Switch.Junction) total += JUNCTION_PENALTY_M + junctionExtra[e];
        previous = e; context = move.context;
      }
      return total;
    };
    expect(baseline).not.toBeNull();
    expect(optimized).not.toBeNull();
    expect(cost(optimized)).toBeCloseTo(cost(baseline));
  }
});

it("keeps the optimum while avoiding broad A* expansion on weighted streets", () => {
  const { data, at } = grid(30, 30, 100);
  const extra = Float32Array.from({ length: data.edgeCount }, (_, e) => (e % 17) / 7);
  const distance = distancePotential(data, extra, at(29, 29));
  let reads = 0;
  const allowed = new Proxy(new Uint8Array(data.edgeCount).fill(1), { get: (array, key) => {
    if (typeof key === "string" && /^\d+$/.test(key)) reads++;
    return Reflect.get(array, key, array);
  } });
  const spec = { allowed, exposure: new Float32Array(data.edgeCount), departMin: 900, dateIdx: 0 };
  const cost = (edges: number[]) => edges.reduce((sum, e) => sum + data.edgeLen[e] * (1 + extra[e]), 0);
  const baseline = aStar(data, spec, at(0, 0), at(29, 29), 0, { extra })!;
  const baselineReads = reads; reads = 0;
  const optimized = aStar(data, spec, at(0, 0), at(29, 29), 0, { extra, potential: distance } as SearchOptions)!;
  expect(cost(optimized.edges)).toBeCloseTo(cost(baseline.edges));
  expect(reads).toBeLessThan(baselineReads / 2);
});

it.each([NaN, Infinity, -Infinity])("ignores a nonfinite distance bound (%s)", (value) => {
  const { data, at } = grid(4, 4, 100);
  const spec = { allowed: new Uint8Array(data.edgeCount).fill(1), exposure: new Float32Array(data.edgeCount), departMin: 900, dateIdx: 0 };
  const start = at(0, 0), end = at(3, 3);
  expect(aStar(data, spec, start, end, 0, { potential: new Float64Array(data.nodeCount).fill(value) }))
    .toEqual(aStar(data, spec, start, end, 0));
});
