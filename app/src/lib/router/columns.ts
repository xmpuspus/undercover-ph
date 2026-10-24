import type { RawEdge, RawGraph } from "./types";

type EdgeKey = Exclude<keyof RawEdge, "geom">;
const KEYS: EdgeKey[] = ["id", "u", "v", "len_m", "flags", "routable", "side", "way_id", "name", "landmark", "hours_idx", "level"];

export interface ColumnGraph {
  version: 1;
  nodes: [number[], number[]];
  // Seventh-decimal residuals preserve A* tie decisions without adding precision to display coordinates.
  routing_node_offsets: [number[], number[]];
  node_flags?: number[];
  edges: Partial<Record<EdgeKey, unknown[]>>;
  absent?: Partial<Record<EdgeKey, number[]>>;
  geom: { offsets: number[]; lon: number[]; lat: number[] };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Build output only. Node and edge order stay aligned with the pipeline's shade arrays. */
export function encodeGraph(graph: RawGraph): ColumnGraph {
  const edges: ColumnGraph["edges"] = {};
  const absent: NonNullable<ColumnGraph["absent"]> = {};
  for (const key of KEYS) {
    if (!graph.edges.some((e) => Object.hasOwn(e, key))) continue;
    edges[key] = graph.edges.map((e) => e[key] ?? null);
    const missing = graph.edges.flatMap((e, i) => Object.hasOwn(e, key) ? [] : [i]);
    if (missing.length) absent[key] = missing;
  }
  const geom: ColumnGraph["geom"] = { offsets: [0], lon: [], lat: [] };
  for (const edge of graph.edges) {
    for (const [lon, lat] of edge.geom) {
      geom.lon.push(round(lon));
      geom.lat.push(round(lat));
    }
    geom.offsets.push(geom.lon.length);
  }
  return {
    version: 1,
    nodes: [graph.nodes.map((p) => round(p[0])), graph.nodes.map((p) => round(p[1]))],
    routing_node_offsets: [
      graph.nodes.map((p) => Math.round(p[0] * 1e7) - Math.round(p[0] * 1e6) * 10),
      graph.nodes.map((p) => Math.round(p[1] * 1e7) - Math.round(p[1] * 1e6) * 10),
    ],
    ...(graph.node_flags ? { node_flags: graph.node_flags } : {}),
    edges,
    ...(Object.keys(absent).length ? { absent } : {}),
    geom,
  };
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid column graph array.");
  return value;
}
function numbers(value: unknown): number[] {
  const out = array(value);
  if (!out.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("Invalid column graph number.");
  return out as number[];
}

/** Decode the transport format before buildData creates the router's typed arrays. */
export function decodeGraph(value: unknown, opts: { routing?: boolean } = {}): RawGraph {
  const g = value as ColumnGraph | null;
  if (!g || g.version !== 1 || !g.edges || !g.geom) throw new Error("Invalid column graph version.");
  const nodes = array(g.nodes);
  if (nodes.length !== 2) throw new Error("Invalid column graph nodes.");
  const lon = numbers(nodes[0]), lat = numbers(nodes[1]);
  if (lon.length !== lat.length) throw new Error("Invalid column graph node lengths.");
  const residual = array(g.routing_node_offsets).map(numbers);
  if (residual.length !== 2 || residual.some((col) => col.length !== lon.length || col.some((n) => !Number.isInteger(n) || Math.abs(n) > 5))) {
    throw new Error("Invalid column graph routing offsets.");
  }
  const ids = numbers(g.edges.id);
  const count = ids.length;
  const columns = Object.entries(g.edges);
  for (const [key, col] of columns) {
    if (!KEYS.includes(key as EdgeKey) || array(col).length !== count) throw new Error("Invalid column graph edge lengths.");
  }
  for (const key of ["id", "u", "v", "len_m", "flags", "routable", "name", "landmark", "hours_idx"] as const) {
    if (!g.edges[key]) throw new Error("Missing column graph edge column.");
  }
  const offsets = numbers(g.geom.offsets), x = numbers(g.geom.lon), y = numbers(g.geom.lat);
  if (offsets.length !== count + 1 || offsets[0] !== 0 || offsets[count] !== x.length || x.length !== y.length ||
      offsets.some((n, i) => !Number.isInteger(n) || n < 0 || n > x.length || (i > 0 && n < offsets[i - 1]))) {
    throw new Error("Invalid column graph geometry offsets.");
  }
  const edges = Array.from({ length: count }, (_, i) => {
    const edge: Record<string, unknown> = {};
    for (const [key, col] of columns) edge[key] = col[i];
    edge.geom = x.slice(offsets[i], offsets[i + 1]).map((n, j) => [n, y[offsets[i] + j]]);
    return edge as unknown as RawEdge;
  });
  for (const [key, missing] of Object.entries(g.absent ?? {})) {
    if (!KEYS.includes(key as EdgeKey)) throw new Error("Invalid column graph absent column.");
    for (const i of numbers(missing)) {
      if (!Number.isInteger(i) || i < 0 || i >= count) throw new Error("Invalid column graph absent index.");
      delete (edges[i] as unknown as Record<string, unknown>)[key];
    }
  }
  if (g.node_flags && numbers(g.node_flags).length !== lon.length) throw new Error("Invalid column graph flags.");
  const coordinate = (n: number, axis: number, i: number) => opts.routing ? (Math.round(n * 1e6) * 10 + residual[axis][i]) / 1e7 : n;
  return { nodes: lon.map((n, i) => [coordinate(n, 0, i), coordinate(lat[i], 1, i)]), edges, ...(g.node_flags ? { node_flags: g.node_flags } : {}) };
}
