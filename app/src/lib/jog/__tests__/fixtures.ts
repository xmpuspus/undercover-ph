// Hand-built graphs and jog files for the jog loop tests (app/src/lib/jog/SPEC.md). Nothing here reads
// app/public/data. Edge ids are 1000 + index, as in the router helpers.
import { makeData, type EdgeSpec, type Fixture } from "../../router/__tests__/helpers";
import type { Data } from "../../router/types";

export interface Grid {
  data: Data;
  /** Node index at grid column i, row j. */
  at: (i: number, j: number) => number;
  edges: EdgeSpec[];
  nodes: [number, number][];
}

/**
 * nx by ny junctions, step metres apart, every edge a centre edge with its own way id. Every node is a junction
 * with a marked crossing, so no side rule applies. spur adds a dead end: nodes west of column 0 at row spurRow.
 */
export function grid(nx: number, ny: number, step = 100, extra: Omit<Fixture, "nodes" | "edges" | "nodeFlags"> & { spur?: { row: number; len: number[] } } = {}): Grid {
  const nodes: [number, number][] = [];
  const index = new Map<string, number>();
  const at = (i: number, j: number) => index.get(`${i},${j}`)!;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      index.set(`${i},${j}`, nodes.length);
      nodes.push([i * step, j * step]);
    }
  }
  const edges: EdgeSpec[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (i + 1 < nx) edges.push({ u: at(i, j), v: at(i + 1, j), name: `Row ${j}`, way: 10_000 + edges.length });
      if (j + 1 < ny) edges.push({ u: at(i, j), v: at(i, j + 1), name: `Column ${i}`, way: 10_000 + edges.length });
    }
  }
  const nodeFlags = nodes.map(() => 5);
  if (extra.spur) {
    let prev = at(0, extra.spur.row);
    let x = 0;
    for (const len of extra.spur.len) {
      x -= len;
      nodes.push([x, extra.spur.row * step]);
      nodeFlags.push(0);
      edges.push({ u: prev, v: nodes.length - 1, name: "Spur", way: 90_000 });
      prev = nodes.length - 1;
    }
  }
  const { spur: _spur, ...rest } = extra;
  return { data: makeData({ nodes, edges, nodeFlags, ...rest }), at, edges, nodes };
}

/**
 * Horizontal streets with a north (left) and a south (right) sidewalk and no centre edge, split mid-block by a
 * node with no crossing. Vertical streets are centre edges. Intersections are junctions without a marked
 * crossing (flag 4), so a side change there is allowed with a penalty and a mid-block change is forbidden.
 */
export function sidewalkGrid(nx: number, ny: number, step = 100): Grid {
  const nodes: [number, number][] = [];
  const flags: number[] = [];
  const index = new Map<string, number>();
  const add = (key: string, x: number, y: number, f: number) => {
    index.set(key, nodes.length);
    nodes.push([x, y]);
    flags.push(f);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      add(`${i},${j}`, i * step, j * step, 4);
      if (i + 1 < nx) add(`m${i},${j}`, (i + 0.5) * step, j * step, 0);
    }
  }
  const at = (i: number, j: number) => index.get(`${i},${j}`)!;
  const mid = (i: number, j: number) => index.get(`m${i},${j}`)!;
  const edges: EdgeSpec[] = [];
  for (let j = 0; j < ny; j++) {
    const y = j * step;
    for (let i = 0; i + 1 < nx; i++) {
      const x0 = i * step, xm = (i + 0.5) * step, x1 = (i + 1) * step;
      for (const [u, v, a, b] of [[at(i, j), mid(i, j), x0, xm], [mid(i, j), at(i + 1, j), xm, x1]] as const) {
        edges.push({ u, v, name: `Street ${j}`, way: 20_000 + j, side: "left", geom: [[a, y + 5], [b, y + 5]] });
        edges.push({ u, v, name: `Street ${j}`, way: 20_000 + j, side: "right", geom: [[a, y - 5], [b, y - 5]] });
      }
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j + 1 < ny; j++) edges.push({ u: at(i, j), v: at(i, j + 1), name: `Avenue ${i}`, way: 30_000 + i });
  }
  return { data: makeData({ nodes, edges, nodeFlags: flags }), at, edges, nodes };
}

export interface RawJogOver {
  road?: number[];
  lit?: number[];
  surface?: number[];
  park?: number[];
  water?: number[];
  sight?: number[];
  /** Park opening hours: an index into data.hours, or -1. Left out of the file when not given, as in older files. */
  hours?: number[];
  sights?: { name: string; kind: string; lon: number; lat: number; src: string }[];
  litShare?: number;
}

/** A jog.json object in the pipeline's format (SPEC J-D2), with every edge array filled. */
export function rawJog(data: Data, over: RawJogOver = {}) {
  const n = data.edgeCount;
  const col = (v: number[] | undefined, fill: number) => v ?? Array.from({ length: n }, () => fill);
  return {
    version: 1,
    graph_sha256: "0".repeat(64),
    edges: {
      road: col(over.road, 2),
      lit: col(over.lit, 0),
      surface: col(over.surface, 1),
      park: col(over.park, 0),
      water: col(over.water, 0),
      sight: col(over.sight, -1),
      ...(over.hours ? { hours: over.hours } : {}),
    },
    sights: over.sights ?? [],
    counts: { edges: n, walk_m: 0, lit_tagged_m: 0, lit_share: over.litShare ?? 0, sights: (over.sights ?? []).length },
    sources: [{ name: "test" }],
  };
}

/** Metres of corridor (unordered node pair) walked more than once on one path. */
export function repeatedMetres(data: Data, edges: number[]): number {
  const seen = new Map<string, number>();
  let rep = 0;
  for (const e of edges) {
    const a = data.edgeU[e], b = data.edgeV[e];
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n > 1) rep += data.edgeLen[e];
  }
  return rep;
}

/** Corridor metres two paths share, counted once per corridor. */
export function sharedMetres(data: Data, a: number[], b: number[]): number {
  const key = (e: number) => {
    const u = data.edgeU[e], v = data.edgeV[e];
    return u < v ? `${u}-${v}` : `${v}-${u}`;
  };
  const inB = new Set(b.map(key));
  const done = new Set<string>();
  let m = 0;
  for (const e of a) {
    const k = key(e);
    if (inB.has(k) && !done.has(k)) {
      done.add(k);
      m += data.edgeLen[e];
    }
  }
  return m;
}
