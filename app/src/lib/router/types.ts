// Public types for the router. docs/data-contract.md, section "Router API", fixes them.

export type Mode = "shade" | "rain";

export interface Query {
  /** Start node id. Use snapToNode or a place's node_id. */
  from: number;
  /** End node id. */
  to: number;
  /** Index into manifest.dates. */
  dateIdx: number;
  /** Index into manifest.buckets_min. The search uses this bucket's shade for the whole walk. Route metrics use the bucket when the walker reaches each edge. */
  bucketIdx: number;
  mode: Mode;
  /** Avoid edges with the steps flag (16). Lifts and ramps are not checked. */
  stepFree: boolean;
  /** Allow edges with routable == false. They come back as kind "unchecked". */
  includeUnchecked: boolean;
  /** Departure time in minutes after midnight. Opening hours use it. */
  departMin: number;
  /** Snap distance of the start point. Over 150 m gives state "outside". */
  from_snap_m?: number;
  /** Snap distance of the end point. Over 150 m gives state "outside". */
  to_snap_m?: number;
}

/**
 * Map colour class of a run of edges.
 * "roof": sheltered edge (flags & 7).
 * "building" or "tree": shade mode by day, at least half the edge in that shade.
 * "sun": open sky. In rain mode, at night, or without shade data it marks every unroofed edge.
 * "unchecked": an edge with routable == false. Draw it dashed.
 */
export type SegKind = "sun" | "building" | "tree" | "roof" | "unchecked";

export type StepFlag = "stairs" | "footbridge" | "underpass" | "indoor" | "hours" | "unchecked" | "crossing";

export interface Step {
  /** English, under 12 words when possible. */
  text: string;
  /** Short Taglish helper string. */
  textTl: string;
  distance_m: number;
  /** Walking minutes at 1.1 m/s, rounded up. */
  minutes: number;
  /** "shade" counts building and tree shade, by day in shade mode only. */
  cover: "roof" | "shade" | "sun" | "mixed";
  landmark: string | null;
  flags: StepFlag[];
  /** Closing time "HH:MM" (24 h) of a passage with opening hours on this step. */
  closesAt: string | null;
  /** [lon, lat] where the step starts. */
  at: [number, number];
  /** 8-wind side of the street ("south") when most of the step runs on one sidewalk edge. */
  side?: string;
  /** False when the side's sidewalk is assumed from the road class, because OSM maps none. */
  sideMapped?: boolean;
}

/**
 * One route.
 *
 * Reported cover uses the shade bucket at the time the walker reaches each edge (departMin plus walking
 * time), never earlier than the departure bucket. The search itself ranks routes with the departure bucket.
 *
 * split: the real cover, in metres. It sums to length_m.
 *   roof_m counts sheltered edges. sun_m is open sky (no roof, building, or tree cover).
 *   At night or without shade data, building_m and tree_m are 0 and sun_m holds all unroofed metres.
 * covered_pct: shade mode by day counts roof, building, and tree. Rain mode and night count roof only.
 *   It rounds down, so it never claims more cover than measured.
 * sun_minutes: minutes exposed under the active mode, at 1.1 m/s, rounded up to 0.1.
 *   Shade mode: minutes in sun. Rain mode: minutes without a roof. Night: 0.
 * lowconf_pct: share of building-shaded metres cast by buildings with a default height.
 *   Building shade on edges with flag 1024 (inside a building footprint, cover unverified) counts in full.
 */
export interface Route {
  label: "recommended" | "shortest" | "most";
  /** Edge ids from graph.json, in walking order. */
  edgeIds: number[];
  coords: [number, number][];
  length_m: number;
  /** Walking minutes at 1.1 m/s, rounded up. */
  minutes: number;
  covered_pct: number;
  sun_minutes: number;
  split: { roof_m: number; building_m: number; tree_m: number; sun_m: number };
  segments: { coords: [number, number][]; kind: SegKind }[];
  steps: Step[];
  warnings: string[];
  lowconf_pct: number;
}

/**
 * state "ok": routes holds recommended (when kept), shortest, and most. most appears only when it saves at
 *   least 5 m of sun (rain and night: unroofed metres) over the recommended route, or the shortest when
 *   there is no recommended route. Otherwise a note names the route it matches.
 * state "night": the sun altitude at the bucket is 3 degrees or lower. routes holds shortest and
 *   most (most sheltered). Shade does not apply, and notes say "The sun is down or very low. Shade does not apply."
 * state "no_route" and "outside": routes is empty. notes say why.
 * recommendedIsShortest: true when no route cuts exposure by 15% within a 20% detour.
 *   The UI then preselects the shortest route. It is always true at night.
 */
export interface Result {
  state: "ok" | "night" | "no_route" | "outside";
  routes: Route[];
  recommendedIsShortest: boolean;
  notes: string[];
  /** The sun at the departure bucket, or null when manifest.sun has no row for it. */
  sun: SunInfo | null;
}

/**
 * The sun at the departure bucket. Buildings on the sun's side of a street block it, so that side's
 * sidewalk is the shadier one more often.
 */
export interface SunInfo {
  altitude: number;
  /** Degrees clockwise from north. */
  azimuth: number;
  /** 16-wind word, for example "west-southwest". */
  compass: string;
  /** "Shade falls on the southwest side of streets." with the 8-wind word. Empty at night (3 degrees or lower). */
  shadySide: string;
}

export interface Place {
  name: string;
  category: string;
  lon: number;
  lat: number;
  node_id: number;
  /** Always an array after loadData, possibly empty. */
  aliases: string[];
  /** Few words that tell apart places sharing a name, such as "in Greenbelt 5" or a street. Set only on repeated names. */
  detail?: string;
  /** Area id, on places from places_index.json. node_id is a node of that area's graph. */
  area?: string;
}

export interface Source {
  name: string;
  licence: string;
  url: string;
  used_for: string;
}

export interface ShadeHeader {
  n_dates: number;
  n_buckets: number;
  n_edges: number;
  layout: string;
  /** One file per date (files, in manifest date order) and shade/lowconf.bin, instead of one shade.bin. */
  per_date?: boolean;
  files?: string[];
  lowconf?: string;
}

export interface Manifest {
  generated_at: string;
  osm_extract?: string;
  pilot_bbox: [number, number, number, number];
  graph_bbox: [number, number, number, number];
  timezone: string;
  dates: string[];
  buckets_min: number[];
  /** Per date, one [altitude_deg, azimuth_deg] per bucket. */
  sun: Record<string, [number, number][]>;
  sunrise_sunset?: Record<string, [string, string]>;
  counts?: Record<string, number>;
  sources?: Source[];
  limits?: string[];
  shade?: ShadeHeader;
}

/** A day's rule: ["10:00", "21:00"], a list of such pairs, or [] for closed. */
export type HoursRule = string[] | string[][];

export interface HoursRow {
  /** The pipeline can write null for an unnamed OSM area. */
  name: string | null;
  rules: Record<string, HoursRule>;
  source_url: string;
  checked: string;
}

/** Raw graph.json edge. */
export interface RawEdge {
  id: number;
  u: number;
  v: number;
  len_m: number;
  geom: [number, number][];
  flags: number;
  routable: boolean;
  side?: string;
  way_id?: number;
  name: string | null;
  landmark: string | null;
  hours_idx: number | null;
  level?: string | number | null;
}

export interface RawGraph {
  nodes: [number, number][];
  edges: RawEdge[];
  /** Per node: 1 mapped crossing, 2 traffic signals, 4 junction of 3 or more ways, 8 grade-separated link. */
  node_flags?: number[];
}

/** The parsed files before indexing. buildData turns this into Data. */
export interface RawFiles {
  manifest: Manifest;
  graph: RawGraph;
  places: Place[];
  hours: HoursRow[];
  /** shade.bin bytes, or null when the file is absent. */
  shade: ArrayBuffer | null;
  /** Per-date layout: shade/lowconf.bin bytes, and the date files loaded so far by date index. */
  lowconf?: ArrayBuffer | null;
  days?: Record<number, ArrayBuffer | null>;
}

/** Shade split into its three parts. Index building and tree with (d * nBuckets + b) * nEdges + e. */
export interface Shade {
  nDates: number;
  nBuckets: number;
  nEdges: number;
  building: Uint8Array;
  tree: Uint8Array;
  lowconf: Uint8Array;
  /** 1 per date whose shade is in place. A per-date bundle starts with one date; loadShadeDate adds more. */
  loaded: Uint8Array;
}

/** Everything the router needs, in typed arrays where speed matters. */
export interface Data {
  /** Graph digest captured with the area's initial load; null when requested but unavailable. */
  graphHash?: string | null;
  /** Optional component labels prepared by the page and reused by the jog worker. */
  network?: { comp: Int32Array; main: number; cycles: boolean[] };
  manifest: Manifest;
  places: Place[];
  hours: HoursRow[];
  nodeCount: number;
  edgeCount: number;
  nodeLon: Float64Array;
  nodeLat: Float64Array;
  /** Local planar metres, for distance and bearing. */
  nodeX: Float64Array;
  nodeY: Float64Array;
  edgeId: Int32Array;
  edgeU: Int32Array;
  edgeV: Int32Array;
  edgeLen: Float64Array;
  edgeFlags: Uint16Array;
  /** 1 when routable == true. */
  edgeRoutable: Uint8Array;
  /** hours.json index, or -1. */
  edgeHours: Int32Array;
  edgeName: (string | null)[];
  edgeLandmark: (string | null)[];
  /** Edge e's geometry is geomXY[2 * geomOff[e]] up to geomXY[2 * geomOff[e + 1]], as lon, lat pairs from u to v. */
  geomOff: Uint32Array;
  geomXY: Float64Array;
  /** CSR adjacency over all edges, both directions. Query filters apply at search time. */
  adjOff: Uint32Array;
  adjNode: Int32Array;
  adjEdge: Int32Array;
  /** 1 when the node touches at least one routable edge. */
  routableNode: Uint8Array;
  /** 0 centre, 1 left, 2 right (graph.json side). */
  edgeSide: Uint8Array;
  /** OSM way id, or -1. */
  edgeWay: Float64Array;
  /** Sidewalk offset vector in metres (east, north), from the u-v chord midpoint to the geom's mean point. 0 on centre edges. */
  sideX: Float32Array;
  sideY: Float32Array;
  /** graph.node_flags, or null when the file has none. */
  nodeFlags: Uint8Array | null;
  /** Metres per degree of longitude and latitude at the graph's middle latitude. */
  mPerLon: number;
  mPerLat: number;
  /** Heuristic scale so straight-line distance never exceeds any edge length. 1 for clean data. */
  hScale: number;
  /** Day of week (0 = Sunday) per manifest date. */
  dateDow: number[];
  /** Open intervals per hours row, per day of week (0 = Sunday), as flat [open, close] minute pairs. */
  hoursOpen: number[][][];
  shade: Shade | null;
  /** Problems found while loading, such as a missing or mismatched shade file. findRoutes repeats them. */
  loadNotes: string[];
  /** Search keys per place, lower case without accents. */
  placeKeys: { name: string; aliases: string[]; tokens: string[] }[];
  /** Where loadData fetched the files, so loadShadeDate can fetch another date. Null for hand-built data. */
  source: { base: string; fetchImpl: FetchLike } | null;
}

/** The parts of a fetch Response that loadData reads. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FetchLike = (url: string) => Promise<FetchResponseLike>;
