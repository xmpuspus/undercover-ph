import { dayOfWeek, parseHours } from "./hours";
import { normalize } from "./search";
import type { Data, FetchLike, FetchResponseLike, HoursRow, Manifest, Place, RawFiles, RawGraph, Shade } from "./types";

const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;

function isHtml(res: FetchResponseLike): boolean {
  // The Vite dev server answers a missing file with index.html and status 200.
  return (res.headers?.get("content-type") ?? "").includes("text/html");
}

function join(base: string, file: string): string {
  return base === "" ? file : `${base.replace(/\/+$/, "")}/${file}`;
}

async function getJson(fetchImpl: FetchLike, base: string, file: string): Promise<unknown> {
  const res = await fetchImpl(join(base, file));
  if (!res.ok || isHtml(res)) throw new Error(`Cannot load ${file} (status ${res.status}).`);
  return res.json();
}

async function getBytes(fetchImpl: FetchLike, base: string, file: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetchImpl(join(base, file));
    if (!res.ok || isHtml(res)) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// Vercel compresses only listed MIME types, and shade.bin (application/octet-stream) is not one, so the deploy
// build writes shade.bin.gz beside it: 0.54 MB instead of 2.29 MB. Inflate that here. Use shade.bin when the
// copy is missing (dev server, local builds), broken, or the browser has no DecompressionStream.
async function getShade(fetchImpl: FetchLike, base: string): Promise<ArrayBuffer | null> {
  if (typeof DecompressionStream === "function") {
    const gz = await getBytes(fetchImpl, base, "shade.bin.gz");
    if (gz) {
      try {
        return await gunzip(gz);
      } catch {
        // Fall through to shade.bin.
      }
    }
  }
  return getBytes(fetchImpl, base, "shade.bin");
}

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  // A host that adds Content-Encoding: gzip hands the bytes over inflated already. Shade bytes are 0 to 100
  // or 255 (night), so plain shade.bin never starts with the gzip magic bytes 1f 8b.
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/**
 * Fetch manifest.json, graph.json, places.json, hours.json, and shade.bin.gz or shade.bin (when manifest.shade exists).
 * Pass the UI's data URL as base, for example `${import.meta.env.BASE_URL}data/`.
 * A missing or mismatched shade.bin does not throw. data.shade is then null and data.loadNotes says why.
 */
export async function loadData(base = "data", fetchImpl?: FetchLike): Promise<Data> {
  const f: FetchLike = fetchImpl ?? ((url: string) => fetch(url, { cache: "no-cache" }));
  const [manifest, graph, places, hours] = await Promise.all([
    getJson(f, base, "manifest.json"),
    getJson(f, base, "graph.json"),
    getJson(f, base, "places.json"),
    getJson(f, base, "hours.json"),
  ]);
  const m = manifest as Manifest;
  const shade = m.shade ? await getShade(f, base) : null;
  return buildData({
    manifest: m,
    graph: graph as RawGraph,
    places: places as Place[],
    hours: hours as HoursRow[],
    shade,
  });
}

function parseShade(manifest: Manifest, bytes: ArrayBuffer | null, edgeCount: number, notes: string[]): Shade | null {
  const h = manifest.shade;
  if (!h) {
    notes.push("Shade data is not ready. Only roofs count as cover.");
    return null;
  }
  if (!bytes) {
    notes.push("shade.bin did not load. Only roofs count as cover.");
    return null;
  }
  const plane = h.n_dates * h.n_buckets * h.n_edges;
  const expected = 2 * plane + h.n_edges;
  if (h.n_edges !== edgeCount || bytes.byteLength !== expected) {
    notes.push(
      `shade.bin does not match the graph (${bytes.byteLength} bytes for ${h.n_edges} edges, expected ${expected} bytes for ${edgeCount} edges). Only roofs count as cover.`,
    );
    return null;
  }
  if (h.n_dates !== manifest.dates.length || h.n_buckets !== manifest.buckets_min.length) {
    notes.push("shade.bin dates or buckets do not match the manifest. Only roofs count as cover.");
    return null;
  }
  // Layout: uint8 building[d][b][e], then uint8 tree[d][b][e], then uint8 lowconf[e].
  return {
    nDates: h.n_dates,
    nBuckets: h.n_buckets,
    nEdges: h.n_edges,
    building: new Uint8Array(bytes, 0, plane),
    tree: new Uint8Array(bytes, plane, plane),
    lowconf: new Uint8Array(bytes, 2 * plane, h.n_edges),
  };
}

/** Index parsed files for routing. Unit tests call it with hand-built graphs. */
export function buildData(raw: RawFiles): Data {
  const { manifest, graph } = raw;
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) throw new Error("graph.json needs nodes and edges arrays.");
  const N = graph.nodes.length;
  const E = graph.edges.length;

  const nodeLon = new Float64Array(N);
  const nodeLat = new Float64Array(N);
  let latSum = 0;
  for (let i = 0; i < N; i++) {
    nodeLon[i] = graph.nodes[i][0];
    nodeLat[i] = graph.nodes[i][1];
    latSum += nodeLat[i];
  }
  const midLat = manifest.graph_bbox ? (manifest.graph_bbox[1] + manifest.graph_bbox[3]) / 2 : N ? latSum / N : 0;
  const mPerLat = EARTH_R * RAD;
  const mPerLon = mPerLat * Math.cos(midLat * RAD);
  const nodeX = new Float64Array(N);
  const nodeY = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    nodeX[i] = nodeLon[i] * mPerLon;
    nodeY[i] = nodeLat[i] * mPerLat;
  }

  const edgeId = new Int32Array(E);
  const edgeU = new Int32Array(E);
  const edgeV = new Int32Array(E);
  const edgeLen = new Float64Array(E);
  const edgeFlags = new Uint16Array(E);
  const edgeRoutable = new Uint8Array(E);
  const edgeHours = new Int32Array(E);
  const edgeName: (string | null)[] = new Array<string | null>(E);
  const edgeLandmark: (string | null)[] = new Array<string | null>(E);
  const geomOff = new Uint32Array(E + 1);
  let pts = 0;
  for (let e = 0; e < E; e++) pts += Math.max(2, graph.edges[e].geom?.length ?? 0);
  const geomXY = new Float64Array(2 * pts);
  const routableNode = new Uint8Array(N);
  const degree = new Uint32Array(N);
  const edgeSide = new Uint8Array(E);
  const edgeWay = new Float64Array(E);
  const sideX = new Float32Array(E);
  const sideY = new Float32Array(E);
  let hScale = 1;
  let p = 0;
  for (let e = 0; e < E; e++) {
    const r = graph.edges[e];
    const u = r.u;
    const v = r.v;
    if (!(u >= 0 && u < N && v >= 0 && v < N)) throw new Error(`Edge ${r.id} points to a missing node.`);
    edgeId[e] = r.id ?? e;
    edgeU[e] = u;
    edgeV[e] = v;
    edgeFlags[e] = r.flags ?? 0;
    edgeRoutable[e] = r.routable === true ? 1 : 0;
    edgeHours[e] = typeof r.hours_idx === "number" && r.hours_idx >= 0 && r.hours_idx < raw.hours.length ? r.hours_idx : -1;
    edgeName[e] = r.name ?? null;
    edgeLandmark[e] = r.landmark ?? null;
    geomOff[e] = p;
    const g = r.geom && r.geom.length >= 2 ? r.geom : [graph.nodes[u], graph.nodes[v]];
    let walked = 0;
    let sumLon = 0;
    let sumLat = 0;
    for (let i = 0; i < g.length; i++) {
      geomXY[2 * p] = g[i][0];
      geomXY[2 * p + 1] = g[i][1];
      sumLon += g[i][0];
      sumLat += g[i][1];
      if (i > 0) walked += Math.hypot((g[i][0] - g[i - 1][0]) * mPerLon, (g[i][1] - g[i - 1][1]) * mPerLat);
      p++;
    }
    edgeWay[e] = typeof r.way_id === "number" ? r.way_id : -1;
    edgeSide[e] = r.side === "left" ? 1 : r.side === "right" ? 2 : 0;
    if (edgeSide[e]) {
      // Sidewalk offset: from the u-v chord midpoint to the mean of the geom points, in metres.
      sideX[e] = (sumLon / g.length - (nodeLon[u] + nodeLon[v]) / 2) * mPerLon;
      sideY[e] = (sumLat / g.length - (nodeLat[u] + nodeLat[v]) / 2) * mPerLat;
    }
    const len = typeof r.len_m === "number" && r.len_m >= 0 ? r.len_m : walked;
    edgeLen[e] = len;
    // A* needs h(u) <= cost(u, v) + h(v). Shrink h if any edge is shorter than its chord.
    const chord = Math.hypot(nodeX[u] - nodeX[v], nodeY[u] - nodeY[v]);
    if (chord > 0 && len < chord * hScale) hScale = len / chord;
    if (u !== v) {
      degree[u]++;
      degree[v]++;
    }
    if (edgeRoutable[e]) {
      routableNode[u] = 1;
      routableNode[v] = 1;
    }
  }
  geomOff[E] = p;
  // The scale starts at 0.85. A lower load-time ratio wins, so A* stays exact on any rebuild.
  hScale = Math.min(0.85, hScale * 0.999);

  const adjOff = new Uint32Array(N + 1);
  for (let i = 0; i < N; i++) adjOff[i + 1] = adjOff[i] + degree[i];
  const fill = adjOff.slice(0, N);
  const adjNode = new Int32Array(adjOff[N]);
  const adjEdge = new Int32Array(adjOff[N]);
  for (let e = 0; e < E; e++) {
    const u = edgeU[e];
    const v = edgeV[e];
    if (u === v) continue;
    adjNode[fill[u]] = v;
    adjEdge[fill[u]++] = e;
    adjNode[fill[v]] = u;
    adjEdge[fill[v]++] = e;
  }

  const loadNotes: string[] = [];
  const shade = parseShade(manifest, raw.shade, E, loadNotes);
  const nf = graph.node_flags;
  const nodeFlags = Array.isArray(nf) && nf.length === N ? Uint8Array.from(nf) : null;
  if (!nodeFlags) loadNotes.push("Crossing data is missing, so routes can change sides of a road mid-block.");
  const places: Place[] = (raw.places ?? []).map((pl) => ({ ...pl, aliases: Array.isArray(pl.aliases) ? pl.aliases : [] }));
  const placeKeys = places.map((pl) => {
    const name = normalize(pl.name);
    const aliases = pl.aliases.map(normalize).filter((a) => a.length > 0);
    const tokens = [...new Set([name, ...aliases].flatMap((k) => k.split(" ")).filter((t) => t.length > 0))];
    return { name, aliases, tokens };
  });

  return {
    manifest,
    places,
    hours: raw.hours ?? [],
    nodeCount: N,
    edgeCount: E,
    nodeLon,
    nodeLat,
    nodeX,
    nodeY,
    edgeId,
    edgeU,
    edgeV,
    edgeLen,
    edgeFlags,
    edgeRoutable,
    edgeHours,
    edgeName,
    edgeLandmark,
    geomOff,
    geomXY,
    adjOff,
    adjNode,
    adjEdge,
    routableNode,
    edgeSide,
    edgeWay,
    sideX,
    sideY,
    nodeFlags,
    mPerLon,
    mPerLat,
    hScale: Math.max(0, hScale),
    dateDow: (manifest.dates ?? []).map(dayOfWeek),
    hoursOpen: parseHours(raw.hours ?? []),
    shade,
    loadNotes,
    placeKeys,
  };
}
