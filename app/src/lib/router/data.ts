import { dayOfWeek, parseHours } from "./hours";
import { normalize } from "./search";
import { decodeGraph } from "./columns";
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

// Vercel compresses only listed MIME types, and .bin (application/octet-stream) is not one, so the deploy
// build writes a .bin.gz copy beside each shade file, about a quarter of the size. Inflate that here. Use the
// plain file when the copy is missing (dev server, local builds), broken, or the browser has no DecompressionStream.
// expected is the size that the manifest gives. A gzip copy that inflates to any other size counts as broken.
async function getShade(fetchImpl: FetchLike, base: string, expected: number, file = "shade.bin"): Promise<ArrayBuffer | null> {
  if (typeof DecompressionStream === "function") {
    const gz = await getBytes(fetchImpl, base, `${file}.gz`);
    if (gz) {
      try {
        const out = await gunzip(gz);
        if (out.byteLength === expected) return out;
      } catch {
        // Fall through to the plain file.
      }
    }
  }
  return getBytes(fetchImpl, base, file);
}

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  // A host that adds Content-Encoding: gzip hands the bytes over inflated already. Shade bytes are 0 to 100
  // or 255 (night), so plain shade.bin never starts with the gzip magic bytes 1f 8b.
  const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** The shade file of one date in the per-date layout. */
function dayFile(m: Manifest, dateIdx: number): string {
  return m.shade?.files?.[dateIdx] ?? `shade/${m.dates[dateIdx]}.bin`;
}

/**
 * Fetch manifest.json, a graph, places.json, hours.json, and the shade files (when manifest.shade exists).
 * The app passes graphFile: "graph.cols.json". The default keeps the disk/pipeline reader compatible.
 * Pass the UI's data URL for one area as base, for example `${import.meta.env.BASE_URL}data/areas/metro-core/`.
 * A per-date manifest (shade.per_date) keeps one shade file per date, so only shade/lowconf.bin and one date's file
 * load here: opts.date when the manifest has it, else opts.dateIdx, else the first date. loadShadeDate fetches
 * another date when the walker picks it. An older manifest without per_date loads the single shade.bin.
 * A missing or mismatched shade file does not throw. data.shade is then null and data.loadNotes says why.
 */
export async function loadData(base = "data", fetchImpl?: FetchLike, opts: { dateIdx?: number; date?: string; graphFile?: "graph.cols.json"; captureGraphHash?: boolean } = {}): Promise<Data> {
  const f: FetchLike = fetchImpl ?? ((url: string) => fetch(url, { cache: "no-cache" }));
  // Capture identity alongside the graph, so a later supplement cannot silently describe another
  // daily build with the same edge count. Optional metadata must not hold up walking routes.
  let graphHash: string | null = null;
  const hashRequest = opts.captureGraphHash ? getBytes(f, base, "graph.sha256").then((bytes) => {
    const hash = bytes && bytes.byteLength <= 1024 ? new TextDecoder().decode(bytes).trim() : "";
    return graphHash = /^[a-f0-9]{64}$/.test(hash) ? hash : null;
  }).catch(() => null) : null;
  const [manifest, graph, places, hours] = await Promise.all([
    getJson(f, base, "manifest.json"),
    getJson(f, base, opts.graphFile ?? "graph.json"),
    getJson(f, base, "places.json"),
    getJson(f, base, "hours.json"),
  ]);
  const m = manifest as Manifest;
  const h = m.shade;
  let shade: ArrayBuffer | null = null;
  let lowconf: ArrayBuffer | null = null;
  const days: Record<number, ArrayBuffer | null> = {};
  if (h?.per_date) {
    const named = opts.date ? m.dates.indexOf(opts.date) : -1;
    const d = named >= 0 ? named : Math.min(Math.max(0, opts.dateIdx ?? 0), Math.max(0, m.dates.length - 1));
    [lowconf, days[d]] = await Promise.all([
      getBytes(f, base, h.lowconf ?? "shade/lowconf.bin"),
      getShade(f, base, 2 * h.n_buckets * h.n_edges, dayFile(m, d)),
    ]);
  } else if (h) {
    shade = await getShade(f, base, 2 * h.n_dates * h.n_buckets * h.n_edges + h.n_edges);
  }
  const data = buildData({ manifest: m, graph: opts.graphFile ? decodeGraph(graph, { routing: true }) : graph as RawGraph, places: places as Place[], hours: hours as HoursRow[], shade, lowconf, days });
  if (hashRequest) {
    data.graphHash = graphHash;
    // Walking never waits for optional jog metadata. A later jog request can use a late capture,
    // or loadJog can try the digest again if the worker received an unavailable capture.
    void hashRequest.then((hash) => { data.graphHash = hash; });
  }
  data.source = { base, fetchImpl: f };
  return data;
}

/**
 * Fetch and add the shade file of one date, for data from a per-date manifest. True when that date's shade is
 * in place, now or already. False when it did not load; findRoutes then counts only roofs on that date.
 */
export async function loadShadeDate(data: Data, dateIdx: number): Promise<boolean> {
  const s = data.shade;
  if (!s || !(dateIdx >= 0 && dateIdx < s.nDates)) return false;
  if (s.loaded[dateIdx]) return true;
  if (!data.source) return false;
  const bytes = await getShade(data.source.fetchImpl, data.source.base, 2 * s.nBuckets * s.nEdges, dayFile(data.manifest, dateIdx));
  return fillDay(s, dateIdx, bytes);
}

// One date's file: uint8 building[b][e], then uint8 tree[b][e]. It goes into that date's plane of the full
// arrays, so the router reads every date the same way.
function fillDay(s: Shade, d: number, bytes: ArrayBuffer | null): boolean {
  const plane = s.nBuckets * s.nEdges;
  if (!bytes || bytes.byteLength !== 2 * plane) return false;
  s.building.set(new Uint8Array(bytes, 0, plane), d * plane);
  s.tree.set(new Uint8Array(bytes, plane, plane), d * plane);
  s.loaded[d] = 1;
  return true;
}

function parseShade(manifest: Manifest, raw: RawFiles, edgeCount: number, notes: string[]): Shade | null {
  const h = manifest.shade;
  if (!h) {
    notes.push("Shade data is not ready. Only roofs count as cover.");
    return null;
  }
  const plane = h.n_dates * h.n_buckets * h.n_edges;
  if (h.per_date) {
    const lc = raw.lowconf ?? null;
    if (!lc) {
      notes.push("Shade data did not load. Only roofs count as cover.");
      return null;
    }
    if (h.n_edges !== edgeCount || lc.byteLength !== h.n_edges) {
      console.warn(`shade/lowconf.bin: ${lc.byteLength} bytes for ${h.n_edges} edges, ${edgeCount} edges in the graph`);
      notes.push("Shade data did not load correctly. Only roofs count as cover.");
      return null;
    }
    if (h.n_dates !== manifest.dates.length || h.n_buckets !== manifest.buckets_min.length) {
      notes.push("Shade data did not load correctly. Only roofs count as cover.");
      return null;
    }
    // A date not loaded yet reads 255, no shade value, never 0, which would mean full sun.
    const s: Shade = {
      nDates: h.n_dates,
      nBuckets: h.n_buckets,
      nEdges: h.n_edges,
      building: new Uint8Array(plane).fill(255),
      tree: new Uint8Array(plane).fill(255),
      lowconf: new Uint8Array(lc.slice(0)),
      loaded: new Uint8Array(h.n_dates),
    };
    for (const [d, bytes] of Object.entries(raw.days ?? {})) fillDay(s, Number(d), bytes);
    return s;
  }
  const bytes = raw.shade;
  if (!bytes) {
    notes.push("Shade data did not load. Only roofs count as cover.");
    return null;
  }
  const expected = 2 * plane + h.n_edges;
  if (h.n_edges !== edgeCount || bytes.byteLength !== expected) {
    console.warn(`shade.bin: ${bytes.byteLength} bytes for ${h.n_edges} edges, expected ${expected} bytes for ${edgeCount} edges`);
    notes.push("Shade data did not load correctly. Only roofs count as cover.");
    return null;
  }
  if (h.n_dates !== manifest.dates.length || h.n_buckets !== manifest.buckets_min.length) {
    notes.push("Shade data did not load correctly. Only roofs count as cover.");
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
    loaded: new Uint8Array(h.n_dates).fill(1),
  };
}

/** Search keys per place: lower case without accents, and every word of the name and aliases. */
export function placeKeys(places: Place[]): Data["placeKeys"] {
  return places.map((pl) => {
    const name = normalize(pl.name);
    const aliases = (pl.aliases ?? []).map(normalize).filter((a) => a.length > 0);
    const tokens = [...new Set([name, ...aliases].flatMap((k) => k.split(" ")).filter((t) => t.length > 0))];
    return { name, aliases, tokens };
  });
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
  const shade = parseShade(manifest, raw, E, loadNotes);
  const nf = graph.node_flags;
  const nodeFlags = Array.isArray(nf) && nf.length === N ? Uint8Array.from(nf) : null;
  if (!nodeFlags) loadNotes.push("Crossing data is missing, so routes can change sides of a road mid-block.");
  const places: Place[] = (raw.places ?? []).map((pl) => ({ ...pl, aliases: Array.isArray(pl.aliases) ? pl.aliases : [] }));

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
    placeKeys: placeKeys(places),
    source: null,
  };
}
