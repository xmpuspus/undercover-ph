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

const MOVES = Array.from({ length: 28 }, (_, code) => Object.freeze({ context: code >> 2, switchIn: (code & 3) as Switch }));

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

function sameArm(data: Data, a: number, b: number): boolean {
  return (data.edgeU[a] === data.edgeU[b] && data.edgeV[a] === data.edgeV[b]) ||
    (data.edgeU[a] === data.edgeV[b] && data.edgeV[a] === data.edgeU[b]);
}

function crossingAt(data: Data, x: number): Switch {
  if (!data.nodeFlags) return Switch.Free;
  const f = data.nodeFlags[x];
  if (f & (NODE_CROSSING | NODE_SIGNALS)) return Switch.Free;
  if (f & NODE_JUNCTION) return Switch.Junction;
  return Switch.Forbidden;
}

/**
 * Classify the move from edge a to edge b at node x. A side switch is a move between two side edges
 * of the same road on opposite sidewalks.
 *
 * An edge's side, left or right, is relative to its u-to-v direction, which is the OSM way direction.
 * So the side and the direction walked give the hand the walker has the sidewalk on. Between pieces on
 * two different arms of x, the same sidewalk stays on the same hand, at any turn angle. A U-turn onto
 * the other edge between the same two nodes reverses the walker, so there the same hand means the
 * other sidewalk. The offset vectors (sideX, sideY) do not work for this test. On a curved piece the bend
 * moves the mean of the line more than the sidewalk offset does.
 */
export function sideSwitch(data: Data, a: number, b: number, x: number): Switch {
  const side = data.edgeSide;
  if (a < 0 || !side[a] || !side[b]) return Switch.None;
  if (!sameRoad(data, a, b)) return Switch.None;
  const { edgeU, edgeV } = data;
  // 1 = the walker's left, 2 = the right. Walking against the way direction swaps them.
  const handA = edgeU[a] === x ? 3 - side[a] : side[a];
  const handB = edgeV[b] === x ? 3 - side[b] : side[b];
  if (sameArm(data, a, b) ? handA !== handB : handA === handB) return Switch.None;
  return crossingAt(data, x);
}

/**
 * Carry the incoming sidewalk through centre edges of the same road. Context 0 has no incoming side;
 * 1..3 carry the left hand and 4..6 the right, each with Free, Junction, or Forbidden permission.
 * Only nodes from entry to exit of the centre run contribute permission. A different road resets it.
 */
export function advanceSide(data: Data, a: number, b: number, x: number, context: number): Readonly<{ context: number; switchIn: Switch }> {
  return MOVES[advanceSideCode(data, a, b, x, context)];
}

// Low two bits classify the move; the remaining bits carry the centre context. No per-move objects.
function advanceSideCode(data: Data, a: number, b: number, x: number, context: number): number {
  if (a < 0) return 0;
  const sideA = data.edgeSide[a];
  const sideB = data.edgeSide[b];
  if (!sideA && !context) return 0;
  if (sideA && sideB) return sideSwitch(data, a, b, x);
  if (!sameRoad(data, a, b)) return 0;
  let hand = sideA ? (data.edgeU[a] === x ? 3 - sideA : sideA) : Math.floor((context - 1) / 3) + 1;
  if (sameArm(data, a, b)) hand = 3 - hand;
  const best = Math.min(sideA ? Switch.Forbidden : (context - 1) % 3 + 1, crossingAt(data, x)) as Switch;
  if (!sideB) return ((hand - 1) * 3 + best) << 2;
  const handB = data.edgeV[b] === x ? 3 - sideB : sideB;
  return hand === handB ? Switch.None : best;
}

export interface SearchSpec {
  /** 1 when the edge passes the query filters at departure: access, step-free, open at departMin. */
  allowed: Uint8Array;
  /** Exposure per edge, 0 to 1, at the departure bucket. */
  exposure: Float32Array;
  departMin: number;
  dateIdx: number;
  /** Diagnose an unavailable route at other hours while reusing this graph's search buffers. */
  ignoreHours?: boolean;
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

export interface SearchOptions {
  /** Additional non-negative cost per metre, indexed by edge. */
  extra?: Float32Array;
  /** Incoming edge and centre-side context from the preceding leg. */
  entry?: { edge: number; context?: number };
  /** Metres added to an unmarked side change into each edge. */
  junctionExtra?: Float32Array;
  /** Opening-hours travel speed. Defaults to the walking speed. */
  mPerMin?: number;
  /** Distances from one landmark under costs no greater than this search's. Differences
   * strengthen the lower bound without changing the optimum. Nonfinite entries are ignored. */
  potential?: Float64Array;
}

interface Buffers {
  centreOffset: Int32Array;
  directed: Int32Array;
  context: Uint8Array;
  g: Float64Array;
  walked: Float64Array;
  prev: Int32Array;
  stamp: Uint32Array;
  h: Float64Array;
  hStamp: Uint32Array;
  turnOff: Int32Array;
  turnState: Int32Array | null;
  turnJunction: Uint8Array | null;
  turnReady: Uint8Array;
  run: number;
  heapK: Float64Array;
  heapV: Int32Array;
}

const pool = new WeakMap<Data, Buffers>();

function buffers(data: Data): Buffers {
  let b = pool.get(data);
  if (!b) {
    // Only centres reachable from a sidewalk through same-road moves can carry a side context.
    // Propagate through adjacent centres because names and way IDs may change within a run.
    const base = 2 * data.edgeCount;
    const eligible = new Uint8Array(data.edgeCount);
    const queue: number[] = [];
    for (let e = 0; e < data.edgeCount; e++) if (data.edgeSide[e]) queue.push(e);
    for (let i = 0; i < queue.length; i++) {
      const e = queue[i];
      for (let dir = 0; dir < 2; dir++) {
        const x = dir ? data.edgeV[e] : data.edgeU[e];
        for (let j = data.adjOff[x]; j < data.adjOff[x + 1]; j++) {
          const next = data.adjEdge[j];
          if (data.edgeSide[next] || eligible[next] || !sameRoad(data, e, next)) continue;
          eligible[next] = 1;
          queue.push(next);
        }
      }
    }
    const centreOffset = new Int32Array(data.edgeCount);
    centreOffset.fill(-1);
    let n = base;
    for (let e = 0; e < data.edgeCount; e++) {
      if (eligible[e]) {
        centreOffset[e] = n;
        n += 8;
      }
    }
    const directed = new Int32Array(n);
    const context = new Uint8Array(n);
    for (let d = 0; d < base; d++) directed[d] = d;
    for (let e = 0; e < data.edgeCount; e++) {
      if (!eligible[e]) continue;
      for (let dir = 0; dir < 2; dir++) {
        for (let c = 0; c < 4; c++) {
          const state = centreOffset[e] + dir * 4 + c;
          directed[state] = 2 * e + dir;
          context[state] = c < 2 ? c + 2 : c + 3;
        }
      }
    }
    // Graph-only turn classifications are shared by all route queries. If their total exceeds the
    // linear budget, disable the table for the whole graph and classify moves directly.
    const turnOff = new Int32Array(n);
    let turns = 0;
    for (let state = 0; state < n; state++) {
      const d = directed[state];
      const e = d >> 1;
      const x = d & 1 ? data.edgeU[e] : data.edgeV[e];
      turnOff[state] = turns;
      turns += data.adjOff[x + 1] - data.adjOff[x];
    }
    const turnState = turns <= 32 * data.edgeCount ? new Int32Array(turns) : null;
    const turnJunction = turnState ? new Uint8Array(turns) : null;
    b = {
      centreOffset, directed, context, turnOff, turnState, turnJunction,
      turnReady: new Uint8Array(n),
      g: new Float64Array(n),
      walked: new Float64Array(n),
      prev: new Int32Array(n),
      stamp: new Uint32Array(n),
      h: new Float64Array(data.nodeCount),
      hStamp: new Uint32Array(data.nodeCount),
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
 * Each state is a directed edge and, on centre edges, its incoming hand and best crossing permission.
 * Eligible centre edges have four extra states per direction, independent of run length. Free centre
 * contexts share state zero: their future moves have the same legality and cost as an unknown side.
 * Route instructions replay the full contexts from the chosen path, so free crossings stay visible.
 * Every edge costs at least its length, and data.hScale keeps straight-line distance under every
 * edge length, so the heuristic is consistent. States reopen when their cost drops.
 */
export function aStar(data: Data, spec: SearchSpec, s: number, t: number, k: number, opts?: SearchOptions): Path | null {
  const b = buffers(data);
  const run = ++b.run;
  const { nodeX, nodeY, adjOff, adjNode, adjEdge, edgeLen, edgeHours, edgeU, edgeV } = data;
  const { allowed, exposure, departMin, dateIdx, ignoreHours } = spec;
  const tx = nodeX[t];
  const ty = nodeY[t];
  const hs = data.hScale;
  const h = (v: number) => {
    if (b.hStamp[v] !== run) {
      b.hStamp[v] = run;
      let lower = hs * Math.hypot(nodeX[v] - tx, nodeY[v] - ty);
      const p = opts?.potential;
      if (p && Number.isFinite(p[v]) && Number.isFinite(p[t])) lower = Math.max(lower, Math.abs(p[v] - p[t]));
      b.h[v] = lower;
    }
    return b.h[v];
  };
  const penalty = JUNCTION_PENALTY_M * (1 + k);
  const speed = opts?.mPerMin && Number.isFinite(opts.mPerMin) && opts.mPerMin > 0 ? opts.mPerMin : WALK_M_PER_MIN;
  const nonnegative = (v: number | undefined) => v !== undefined && Number.isFinite(v) && v > 0 ? v : 0;

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
    if (hi >= 0 && !ignoreHours) {
      // A passage with hours must be open when the walker enters and leaves it.
      // The search orders by cost, not time, so with k > 0 this arrival time is approximate.
      const arrive = departMin + wx / speed;
      if (!(openAt(data, hi, dateIdx, arrive) && openAt(data, hi, dateIdx, arrive + len / speed))) return;
    }
    let c = gx + len * (1 + k * exposure[e]);
    if (opts?.extra) c += len * nonnegative(opts.extra[e]);
    let d: number;
    if (from >= 0 && b.turnState && b.turnJunction) {
      const slot = b.turnOff[from] + j - adjOff[x];
      d = b.turnState[slot];
      if (d < 0) return;
      if (b.turnJunction[slot]) c += penalty + nonnegative(opts?.junctionExtra?.[e]);
    } else {
      const move = advanceSideCode(data, from < 0 ? (opts?.entry?.edge ?? -1) : b.directed[from] >> 1, e, x, from < 0 ? (opts?.entry?.context ?? 0) : b.context[from]);
      const sw = move & 3;
      if (sw === Switch.Forbidden) return;
      if (sw === Switch.Junction) c += penalty + nonnegative(opts?.junctionExtra?.[e]);
      const carry = move >> 2;
      const context = carry === 1 || carry === 4 ? 0 : carry;
      const dir = edgeU[e] === x ? 0 : 1;
      d = context ? b.centreOffset[e] + dir * 4 + context - (context < 4 ? 2 : 3) : 2 * e + dir;
    }
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

    const directed = b.directed[d];
    const e = directed >> 1;
    const x = directed & 1 ? edgeU[e] : edgeV[e];
    if (x === t) {
      goal = d;
      break;
    }
    if (key > b.g[d] + h(x) + 1e-7) continue; // stale heap entry
    // Populate graph-only classifications on first use, so the first route does not classify the
    // entire city. Subsequent queries reuse these entries regardless of their filters or exposure.
    if (b.turnState && b.turnJunction && !b.turnReady[d]) {
      for (let j = adjOff[x]; j < adjOff[x + 1]; j++) {
        const next = adjEdge[j];
        const move = advanceSideCode(data, e, next, x, b.context[d]);
        const sw = move & 3;
        const carry = move >> 2;
        const c = carry === 1 || carry === 4 ? 0 : carry;
        const dir = edgeU[next] === x ? 0 : 1;
        const slot = b.turnOff[d] + j - adjOff[x];
        b.turnState[slot] = sw === Switch.Forbidden ? -1 : c ? b.centreOffset[next] + dir * 4 + c - (c < 4 ? 2 : 3) : 2 * next + dir;
        b.turnJunction[slot] = sw === Switch.Junction ? 1 : 0;
      }
      b.turnReady[d] = 1;
    }
    for (let j = adjOff[x], end = adjOff[x + 1]; j < end; j++) {
      if (adjEdge[j] !== e) relax(d, x, j);
    }
  }
  if (goal < 0) return null;

  const edges: number[] = [];
  const nodes: number[] = [];
  for (let d = goal; d >= 0; d = b.prev[d]) {
    const directed = b.directed[d];
    const e = directed >> 1;
    edges.push(e);
    nodes.push(directed & 1 ? edgeU[e] : edgeV[e]);
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
