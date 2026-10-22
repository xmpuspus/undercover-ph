import { openAt } from "./hours";
import type { Data } from "./types";

/** 1.1 m/s in metres per minute. */
export const WALK_M_PER_MIN = 66;

/** A side switch at an unmarked junction costs as much as this many metres of open-sky walking. */
export const JUNCTION_PENALTY_M = 60;

const NODE_CROSSING = 1;
const NODE_SIGNALS = 2;
const NODE_JUNCTION = 4;

/** Kinds of move between two edges at a node. */
export const Switch = {
  /** Not a change between opposite sidewalks of one road. */
  None: 0,
  /** A side change at a mapped crossing or signals, or anywhere when the graph has no node flags. */
  Free: 1,
  /** A side change at a junction without a mapped crossing. Allowed with a penalty. */
  Junction: 2,
  /** A side change mid-block. Not allowed. */
  Forbidden: 3,
} as const;
export type Switch = (typeof Switch)[keyof typeof Switch];

function sameRoad(data: Data, a: number, b: number): boolean {
  const na = data.edgeName[a];
  if (na !== null && na === data.edgeName[b]) return true;
  if (data.edgeWay[a] >= 0 && data.edgeWay[a] === data.edgeWay[b]) return true;
  const ua = data.edgeU[a];
  const va = data.edgeV[a];
  const ub = data.edgeU[b];
  const vb = data.edgeV[b];
  return (ua === ub && va === vb) || (ua === vb && va === ub);
}

/**
 * Classify the move from edge a to edge b at node x. A side switch is a move between two side edges
 * of the same road whose sidewalk offsets point to opposite sides (dot product below 0).
 */
export function sideSwitch(data: Data, a: number, b: number, x: number): Switch {
  if (a < 0 || !data.edgeSide[a] || !data.edgeSide[b]) return Switch.None;
  if (!(data.sideX[a] * data.sideX[b] + data.sideY[a] * data.sideY[b] < 0)) return Switch.None;
  if (!sameRoad(data, a, b)) return Switch.None;
  const nf = data.nodeFlags;
  if (!nf) return Switch.Free;
  const f = nf[x];
  if (f & (NODE_CROSSING | NODE_SIGNALS)) return Switch.Free;
  if (f & NODE_JUNCTION) return Switch.Junction;
  return Switch.Forbidden;
}

export interface SearchSpec {
  /** 1 when the edge passes the query filters at departure: access, step-free, open at departMin. */
  allowed: Uint8Array;
  /** Exposure per edge, 0 to 1, at the departure bucket. */
  exposure: Float32Array;
  departMin: number;
  dateIdx: number;
}

export interface Path {
  /** Edge indexes in walking order. */
  edges: number[];
  /** Node sequence, one longer than edges. */
  nodes: number[];
  length: number;
  /** Sum of length x exposure at the departure bucket. */
  exposed: number;
}

interface Buffers {
  g: Float64Array;
  walked: Float64Array;
  prev: Int32Array;
  stamp: Uint32Array;
  run: number;
  heapK: Float64Array;
  heapV: Int32Array;
}

const pool = new WeakMap<Data, Buffers>();

function buffers(data: Data): Buffers {
  let b = pool.get(data);
  if (!b) {
    const n = 2 * data.edgeCount;
    b = {
      g: new Float64Array(n),
      walked: new Float64Array(n),
      prev: new Int32Array(n),
      stamp: new Uint32Array(n),
      run: 0,
      heapK: new Float64Array(1024),
      heapV: new Int32Array(1024),
    };
    pool.set(data, b);
  }
  return b;
}

/**
 * A* with cost = len x (1 + k x exposure), plus the junction penalty on side switches.
 * Each state is a directed edge: 2e when walked from u to v, 2e + 1 when walked from v to u.
 * So a move can see the edge it came from, which the side-switch rule needs.
 * Every edge costs at least its length, and data.hScale keeps straight-line distance under every
 * edge length, so the heuristic is consistent. States reopen when their cost drops.
 */
export function aStar(data: Data, spec: SearchSpec, s: number, t: number, k: number): Path | null {
  const b = buffers(data);
  const run = ++b.run;
  const { nodeX, nodeY, adjOff, adjNode, adjEdge, edgeLen, edgeHours, edgeU, edgeV } = data;
  const { allowed, exposure, departMin, dateIdx } = spec;
  const tx = nodeX[t];
  const ty = nodeY[t];
  const hs = data.hScale;
  const h = (v: number) => hs * Math.hypot(nodeX[v] - tx, nodeY[v] - ty);
  const penalty = JUNCTION_PENALTY_M * (1 + k);

  let size = 0;
  const push = (key: number, v: number) => {
    if (size === b.heapK.length) {
      const nk = new Float64Array(size * 2);
      nk.set(b.heapK);
      b.heapK = nk;
      const nv = new Int32Array(size * 2);
      nv.set(b.heapV);
      b.heapV = nv;
    }
    const hk = b.heapK;
    const hv = b.heapV;
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= key) break;
      hk[i] = hk[p];
      hv[i] = hv[p];
      i = p;
    }
    hk[i] = key;
    hv[i] = v;
  };

  // Relax the move from state from (or the start when from < 0) at node x along adjacency slot j.
  const relax = (from: number, x: number, j: number) => {
    const e = adjEdge[j];
    if (!allowed[e]) return;
    const gx = from < 0 ? 0 : b.g[from];
    const wx = from < 0 ? 0 : b.walked[from];
    const len = edgeLen[e];
    const hi = edgeHours[e];
    if (hi >= 0) {
      // A passage with hours must be open when the walker enters and leaves it.
      // The search orders by cost, not time, so with k > 0 this arrival time is approximate.
      const arrive = departMin + wx / WALK_M_PER_MIN;
      if (!(openAt(data, hi, dateIdx, arrive) && openAt(data, hi, dateIdx, arrive + len / WALK_M_PER_MIN))) return;
    }
    let c = gx + len * (1 + k * exposure[e]);
    if (from >= 0) {
      const sw = sideSwitch(data, from >> 1, e, x);
      if (sw === Switch.Forbidden) return;
      if (sw === Switch.Junction) c += penalty;
    }
    const d = edgeU[e] === x ? 2 * e : 2 * e + 1;
    if (b.stamp[d] !== run || c < b.g[d]) {
      b.stamp[d] = run;
      b.g[d] = c;
      b.walked[d] = wx + len;
      b.prev[d] = from;
      push(c + h(adjNode[j]), d);
    }
  };

  for (let j = adjOff[s], end = adjOff[s + 1]; j < end; j++) relax(-1, s, j);

  let goal = -1;
  while (size > 0) {
    const hk = b.heapK;
    const hv = b.heapV;
    const d = hv[0];
    const key = hk[0];
    const lastK = hk[--size];
    const lastV = hv[size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= lastK) break;
      hk[i] = hk[c];
      hv[i] = hv[c];
      i = c;
    }
    hk[i] = lastK;
    hv[i] = lastV;

    const e = d >> 1;
    const x = d & 1 ? edgeU[e] : edgeV[e];
    if (x === t) {
      goal = d;
      break;
    }
    if (key > b.g[d] + h(x) + 1e-7) continue; // stale heap entry
    for (let j = adjOff[x], end = adjOff[x + 1]; j < end; j++) {
      if (adjEdge[j] !== e) relax(d, x, j);
    }
  }
  if (goal < 0) return null;

  const edges: number[] = [];
  const nodes: number[] = [];
  for (let d = goal; d >= 0; d = b.prev[d]) {
    const e = d >> 1;
    edges.push(e);
    nodes.push(d & 1 ? edgeU[e] : edgeV[e]);
  }
  nodes.push(s);
  edges.reverse();
  nodes.reverse();
  let length = 0;
  let exposed = 0;
  for (const e of edges) {
    length += edgeLen[e];
    exposed += edgeLen[e] * exposure[e];
  }
  return { edges, nodes, length, exposed };
}
