// Hand-built graphs for unit tests. Nothing here reads or writes app/public/data.
import { buildData } from "../data";
import type { Data, HoursRow, Manifest, Place, Query, RawEdge } from "../types";

const LON0 = 121.02;
const LAT0 = 14.55;
const BBOX: [number, number, number, number] = [121.0074, 14.5435, 121.0366, 14.5665];
const M_LAT = (6371008.8 * Math.PI) / 180;
const M_LON = M_LAT * Math.cos((((BBOX[1] + BBOX[3]) / 2) * Math.PI) / 180);

/** Metres east and north of a point in Makati CBD, as [lon, lat]. */
export function pt(x: number, y: number): [number, number] {
  return [LON0 + x / M_LON, LAT0 + y / M_LAT];
}

export const DATES = ["2026-10-21", "2026-10-22"];
export const BUCKETS = [600, 900, 1080, 1110];
// Bucket 2 has the sun exactly on the horizon. Bucket 3 has it below.
export const SUN: [number, number][] = [
  [60, 90],
  [40, 250],
  [0, 260],
  [-5, 262],
];
export const DAY = 1;
export const HORIZON = 2;
export const NIGHT = 3;
export const THURSDAY = 1; // 2026-10-22

export interface EdgeSpec {
  u: number;
  v: number;
  flags?: number;
  routable?: boolean;
  name?: string | null;
  landmark?: string | null;
  hours?: number | null;
  /** Percent, one value for every bucket or one per bucket. */
  building?: number | number[];
  tree?: number | number[];
  lowconf?: number;
  side?: "left" | "right" | "centre";
  way?: number;
  /** Geometry in metres. Defaults to the straight line from u to v. */
  geom?: [number, number][];
}

export interface Fixture {
  nodes: [number, number][];
  edges: EdgeSpec[];
  hours?: HoursRow[];
  places?: Place[];
  shade?: boolean;
  nodeFlags?: number[];
  buckets?: number[];
  sun?: [number, number][];
}

export function makeData(f: Fixture): Data {
  const nodes = f.nodes.map(([x, y]) => pt(x, y));
  const edges: RawEdge[] = f.edges.map((s, id) => {
    const [x0, y0] = f.nodes[s.u];
    const [x1, y1] = f.nodes[s.v];
    return {
      id: 1000 + id,
      u: s.u,
      v: s.v,
      len_m: s.geom ? s.geom.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - s.geom![i][0], p[1] - s.geom![i][1]), 0) : Math.hypot(x1 - x0, y1 - y0),
      geom: s.geom ? s.geom.map(([x, y]) => pt(x, y)) : [nodes[s.u], nodes[s.v]],
      flags: s.flags ?? 32,
      routable: s.routable ?? true,
      side: s.side ?? "centre",
      way_id: s.way ?? id,
      name: s.name ?? null,
      landmark: s.landmark ?? null,
      hours_idx: s.hours ?? null,
      level: null,
    };
  });
  const E = edges.length;
  const buckets = f.buckets ?? BUCKETS;
  const sun = f.sun ?? SUN;
  const nd = DATES.length;
  const nb = buckets.length;
  const manifest: Manifest = {
    generated_at: "2026-10-21T12:00:00+08:00",
    pilot_bbox: [121.012, 14.548, 121.032, 14.562],
    graph_bbox: BBOX,
    timezone: "Asia/Manila",
    dates: DATES,
    buckets_min: buckets,
    sun: Object.fromEntries(DATES.map((d) => [d, sun])),
    sunrise_sunset: Object.fromEntries(DATES.map((d) => [d, ["05:51", "17:33"] as [string, string]])),
  };
  let shade: ArrayBuffer | null = null;
  if (f.shade !== false) {
    manifest.shade = { n_dates: nd, n_buckets: nb, n_edges: E, layout: "uint8 building[d][b][e], then uint8 tree[d][b][e], then uint8 lowconf[e]" };
    const plane = nd * nb * E;
    const bytes = new Uint8Array(2 * plane + E);
    for (let d = 0; d < nd; d++) {
      for (let b = 0; b < nb; b++) {
        for (let e = 0; e < E; e++) {
          const i = (d * nb + b) * E + e;
          const night = sun[b][0] <= 0;
          const at = (v: number | number[] | undefined) => (Array.isArray(v) ? v[b] : (v ?? 0));
          bytes[i] = night ? 255 : at(f.edges[e].building);
          bytes[plane + i] = night ? 255 : at(f.edges[e].tree);
        }
      }
    }
    f.edges.forEach((s, e) => (bytes[2 * plane + e] = s.lowconf ?? 0));
    shade = bytes.buffer;
  }
  return buildData({ manifest, graph: { nodes, edges, node_flags: f.nodeFlags }, places: f.places ?? [], hours: f.hours ?? [], shade });
}

/** One way between S and T along y = 0 or through a middle node at (200, y). */
export interface Via extends Omit<EdgeSpec, "u" | "v"> {
  y: number;
}

/**
 * S is node 0 at (0, 0). T is node 1 at (400, 0). Each via adds one or two edges.
 * Returns the data and the edge indexes of each via.
 */
export function fan(vias: Via[], extra: Omit<Fixture, "nodes" | "edges"> = {}): { data: Data; via: number[][] } {
  const nodes: [number, number][] = [
    [0, 0],
    [400, 0],
  ];
  const edges: EdgeSpec[] = [];
  const via: number[][] = [];
  for (const { y, ...attrs } of vias) {
    if (y === 0) {
      via.push([edges.length]);
      edges.push({ u: 0, v: 1, ...attrs });
    } else {
      const m = nodes.length;
      nodes.push([200, y]);
      via.push([edges.length, edges.length + 1]);
      edges.push({ u: 0, v: m, ...attrs }, { u: m, v: 1, ...attrs });
    }
  }
  return { data: makeData({ nodes, edges, ...extra }), via };
}

export function query(over: Partial<Query> = {}): Query {
  return {
    from: 0,
    to: 1,
    dateIdx: THURSDAY,
    bucketIdx: DAY,
    mode: "shade",
    stepFree: false,
    includeUnchecked: false,
    departMin: 900,
    ...over,
  };
}

/** Edge indexes (not ids) of a route, from its edgeIds. */
export function edgeIdx(ids: number[]): number[] {
  return ids.map((id) => id - 1000);
}
