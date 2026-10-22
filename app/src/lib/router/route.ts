import { aStar, sideSwitch, Switch, WALK_M_PER_MIN, type Path, type SearchSpec } from "./astar";
import { clock12, closesAtMinute, openAt } from "./hours";
import { appendLine, buildSteps, type EdgeTrip } from "./steps";
import type { Data, Query, Result, Route, SegKind, SunInfo } from "./types";

/** A start or end farther than this from the graph gives state "outside". */
export const MAX_SNAP_M = 150;
const MOST_KS = [8, 4, 2, 1, 0.5, 0.25];
const MOST_MAX_DETOUR = 0.5;
const REC_KS = [2, 1, 0.5, 0.25];
/** The recommended route is at most this much longer than the shortest. The route card and About quote it. */
export const REC_MAX_DETOUR = 0.2;
/** The recommended route cuts exposure by at least this share. The route card and About quote it. */
export const REC_MIN_CUT = 0.15;
// The most covered route must save this much exposure over the route it sits beside, or it is the same choice.
const MOST_MIN_GAIN_M = 5;
const SHELTERED = 7;
const STEPS = 16;
const CROSSING = 256;
const FOOTBRIDGE = 8;
const UNDERPASS = 2;
const NIGHT_VALUE = 255;
// Dusk cutoff: at 3 degrees or lower the model's long shadows do not count as shade.
const NIGHT_MAX_ALT = 3;
// Inside a building footprint, cover unverified. Not sheltered.
const IN_BUILDING = 1024;

// "shade": building and tree shade count, by day in shade mode with shade data.
// "roof": only sheltered edges count. Rain mode, night, and missing shade data use it.
type CoverMode = "shade" | "roof";

function sunAltitude(data: Data, dateIdx: number, bucketIdx: number): number | null {
  const date = data.manifest.dates[dateIdx];
  const row = data.manifest.sun?.[date]?.[bucketIdx];
  return row && typeof row[0] === "number" ? row[0] : null;
}

function isNight(data: Data, dateIdx: number, bucketIdx: number): boolean {
  const alt = sunAltitude(data, dateIdx, bucketIdx);
  if (alt !== null) return alt <= NIGHT_MAX_ALT;
  const date = data.manifest.dates[dateIdx];
  const rs = data.manifest.sunrise_sunset?.[date];
  const minute = data.manifest.buckets_min[bucketIdx];
  if (!rs) return false;
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  return minute < toMin(rs[0]) || minute >= toMin(rs[1]);
}

/** Building and tree percent for edge e at the bucket, or null when unknown or marked night (255). */
function shadeAt(data: Data, dateIdx: number, bucketIdx: number, e: number): [number, number] | null {
  const s = data.shade;
  if (!s) return null;
  const i = (dateIdx * s.nBuckets + bucketIdx) * s.nEdges + e;
  const b = s.building[i];
  const t = s.tree[i];
  if (b === NIGHT_VALUE || t === NIGHT_VALUE) return null;
  const bb = Math.min(100, b);
  return [bb, Math.min(100 - bb, t)];
}

function buildSpec(data: Data, q: Query, cover: CoverMode, includeUnchecked: boolean, stepFree: boolean): SearchSpec {
  const E = data.edgeCount;
  const allowed = new Uint8Array(E);
  const exposure = new Float32Array(E);
  for (let e = 0; e < E; e++) {
    const f = data.edgeFlags[e];
    const hi = data.edgeHours[e];
    allowed[e] =
      (data.edgeRoutable[e] || includeUnchecked) && !(stepFree && f & STEPS) && (hi < 0 || openAt(data, hi, q.dateIdx, q.departMin))
        ? 1
        : 0;
    if (f & SHELTERED) {
      exposure[e] = 0;
    } else if (cover === "roof") {
      exposure[e] = 1;
    } else {
      // The search uses the departure bucket's shade for the whole walk.
      // Reported metrics use the bucket when the walker reaches each edge (see coverAt).
      const s = shadeAt(data, q.dateIdx, q.bucketIdx, e);
      exposure[e] = s ? 1 - (s[0] + s[1]) / 100 : 1;
    }
  }
  return { allowed, exposure, departMin: q.departMin, dateIdx: q.dateIdx };
}

function edgeCoords(data: Data, e: number, forward: boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let i = data.geomOff[e]; i < data.geomOff[e + 1]; i++) out.push([data.geomXY[2 * i], data.geomXY[2 * i + 1]]);
  if (!forward) out.reverse();
  return out;
}

/** The bucket in force at the minute, never earlier than the departure bucket. */
function bucketAt(data: Data, departBucket: number, minute: number): number {
  const bm = data.manifest.buckets_min;
  let b = departBucket;
  while (b + 1 < bm.length && bm[b + 1] <= minute) b++;
  return b;
}

interface EdgeCover {
  roof: number;
  building: number;
  tree: number;
  sun: number;
  /** Metres that count against the route under the active mode. */
  exposed: number;
  /** The sun is at or below the dusk cutoff when the walker reaches the edge. */
  dark: boolean;
}

/**
 * Cover of edge e for reported metrics. The search ranks routes with the departure bucket, but the
 * route card uses the bucket at the time the walker reaches each edge: departMin + elapsed walking time.
 */
function coverAt(data: Data, q: Query, e: number, arriveMin: number, cover: CoverMode, night: boolean): EdgeCover {
  const L = data.edgeLen[e];
  const bucket = bucketAt(data, q.bucketIdx, arriveMin);
  const dark = night || isNight(data, q.dateIdx, bucket);
  if (data.edgeFlags[e] & SHELTERED) return { roof: L, building: 0, tree: 0, sun: 0, exposed: 0, dark };
  const sh = dark ? null : shadeAt(data, q.dateIdx, bucket, e);
  const building = sh ? (L * sh[0]) / 100 : 0;
  const tree = sh ? (L * sh[1]) / 100 : 0;
  const sun = L - building - tree;
  const exposed = night ? 0 : cover === "shade" ? (dark ? 0 : sun) : L;
  return { roof: 0, building, tree, sun, exposed, dark };
}

/**
 * Metres that count against a path when routes are compared: sun metres with arrival-time shade in
 * shade mode, unroofed metres in rain mode and at night. The 15% rule and the most-covered check use it.
 */
function rankExposure(data: Data, q: Query, path: Path, cover: CoverMode): number {
  let walked = 0;
  let exposed = 0;
  for (const e of path.edges) {
    const cv = coverAt(data, q, e, q.departMin + walked / WALK_M_PER_MIN, cover, false);
    exposed += cover === "shade" ? cv.exposed : data.edgeLen[e] - cv.roof;
    walked += data.edgeLen[e];
  }
  return exposed;
}

function makeRoute(
  data: Data,
  q: Query,
  label: Route["label"],
  path: Path,
  cover: CoverMode,
  night: boolean,
  stepFree: boolean,
): Route {
  const trips: EdgeTrip[] = [];
  const coords: [number, number][] = [];
  const segments: Route["segments"] = [];
  let roofM = 0;
  let buildingM = 0;
  let treeM = 0;
  let sunM = 0;
  let lowconfWeighted = 0;
  let uncheckedM = 0;
  let exposedM = 0;
  let walked = 0;
  let stairs = false;
  let kerb = false;
  let inBuilding = false;
  let footbridge = false;
  let underpass = false;
  let unmarked = false;
  const hoursSeen = new Map<number, number>();

  path.edges.forEach((e, i) => {
    const forward = path.nodes[i] === data.edgeU[e];
    const c = edgeCoords(data, e, forward);
    const L = data.edgeLen[e];
    const f = data.edgeFlags[e];
    const arriveMin = q.departMin + walked / WALK_M_PER_MIN;
    const cv = coverAt(data, q, e, arriveMin, cover, night);
    roofM += cv.roof;
    buildingM += cv.building;
    treeM += cv.tree;
    sunM += cv.sun;
    exposedM += cv.exposed;
    // Building shade on an unverified in-building edge counts as low confidence in full.
    if (data.shade && cv.building > 0) lowconfWeighted += cv.building * (f & IN_BUILDING ? 100 : data.shade.lowconf[e]);
    if (!data.edgeRoutable[e]) uncheckedM += L;
    if (f & STEPS && f & CROSSING) kerb = true;
    else if (f & STEPS) stairs = true;
    if (f & FOOTBRIDGE) footbridge = true;
    if (f & UNDERPASS) underpass = true;
    if (f & IN_BUILDING) inBuilding = true;
    const hi = data.edgeHours[e];
    if (hi >= 0 && !hoursSeen.has(hi)) hoursSeen.set(hi, arriveMin);
    const sw = i > 0 ? sideSwitch(data, path.edges[i - 1], e, path.nodes[i]) : Switch.None;
    if (sw === Switch.Junction) unmarked = true;

    const shadeM = cover === "shade" && !cv.dark ? cv.building + cv.tree : 0;
    trips.push({ e, coords: c, roof: cv.roof, shade: shadeM, sun: L - cv.roof - shadeM, arriveMin, switchIn: sw });

    let kind: SegKind;
    if (!data.edgeRoutable[e]) kind = "unchecked";
    else if (cv.roof > 0) kind = "roof";
    else if (cover === "shade" && !cv.dark && cv.building + cv.tree >= L / 2) kind = cv.building >= cv.tree ? "building" : "tree";
    else kind = "sun";
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) {
      appendLine(last.coords, c);
    } else {
      // Start at the previous segment's end, so the coloured line has no holes.
      const seg: [number, number][] = last ? [last.coords[last.coords.length - 1]] : [];
      appendLine(seg, c);
      segments.push({ kind, coords: seg });
    }
    appendLine(coords, c);
    walked += L;
  });

  const length = path.length;
  const coveredM = cover === "shade" ? roofM + buildingM + treeM : roofM;
  const coveredPct = length > 0 ? (coveredM / length) * 100 : 0;
  const lowconfPct = buildingM > 0 ? lowconfWeighted / buildingM : 0;

  const warnings: string[] = [];
  if (unmarked) warnings.push("Crosses a road where there is no marked crossing.");
  if (uncheckedM > 0) warnings.push(`Uses ${Math.round(uncheckedM)} m of paths with unchecked access.`);
  if (stairs) warnings.push("Uses stairs.");
  if (kerb) warnings.push("Has a raised kerb at a crossing.");
  if (stepFree && footbridge) warnings.push("Footbridge entrances may have stairs. Lifts are not checked.");
  if (night && underpass) {
    // Router night starts at 3 degrees. Between 0 and 3 degrees the sun is up, so it is not yet dark.
    const alt = sunAltitude(data, q.dateIdx, q.bucketIdx);
    warnings.push(alt !== null && alt > 0 ? "Uses an underpass in low light." : "Uses an underpass after dark.");
  }
  if (inBuilding) warnings.push("Passes through a building. Its cover is not checked.");
  for (const [hi, arrive] of hoursSeen) {
    const close = closesAtMinute(data, hi, q.dateIdx, arrive);
    if (close !== null && close - arrive <= 30) {
      warnings.push(`${data.hours[hi]?.name ?? "A passage"} closes at ${clock12(close)}, soon after you reach it.`);
    }
  }
  if (lowconfPct >= 25) warnings.push(`${Math.round(lowconfPct)}% of the building shade comes from estimated heights.`);

  return {
    label,
    edgeIds: path.edges.map((e) => data.edgeId[e]),
    coords,
    length_m: Math.round(length),
    minutes: length > 0 ? Math.ceil(length / WALK_M_PER_MIN - 1e-9) : 0,
    covered_pct: Math.floor(coveredPct + 1e-9),
    sun_minutes: Math.max(0, Math.ceil((exposedM / WALK_M_PER_MIN) * 10 - 1e-9)) / 10,
    split: { roof_m: Math.round(roofM), building_m: Math.round(buildingM), tree_m: Math.round(treeM), sun_m: Math.round(sunM) },
    segments,
    steps: buildSteps(data, trips, q.dateIdx),
    warnings,
    lowconf_pct: Math.round(lowconfPct),
  };
}

function validNode(data: Data, n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n < data.nodeCount;
}

function key(p: Path): string {
  return p.edges.join(",");
}

const COMPASS16 = [
  "north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast", "south-southeast",
  "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest",
];
const COMPASS8 = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/** The sun at the departure bucket. Buildings on the sun's side of a street shade that side's sidewalk. */
function sunInfo(data: Data, q: Query): SunInfo | null {
  const row = data.manifest.sun?.[data.manifest.dates[q.dateIdx]]?.[q.bucketIdx];
  if (!row || typeof row[0] !== "number" || typeof row[1] !== "number") return null;
  const [altitude, azimuth] = row;
  const az = ((azimuth % 360) + 360) % 360;
  return {
    altitude,
    azimuth,
    compass: COMPASS16[Math.round(az / 22.5) % 16],
    shadySide: isNight(data, q.dateIdx, q.bucketIdx) ? "" : `Shade falls on the ${COMPASS8[Math.round(az / 45) % 8]} side of streets.`,
  };
}

/** Shortest, recommended, and most covered routes for one query. See the Result doc comment for states. */
export function findRoutes(data: Data, q: Query): Result {
  if (!(q.dateIdx >= 0 && q.dateIdx < data.manifest.dates.length)) throw new RangeError(`dateIdx ${q.dateIdx} is not in manifest.dates.`);
  if (!(q.bucketIdx >= 0 && q.bucketIdx < data.manifest.buckets_min.length)) {
    throw new RangeError(`bucketIdx ${q.bucketIdx} is not in manifest.buckets_min.`);
  }
  const notes = [...data.loadNotes];
  const sun = sunInfo(data, q);
  const empty = (state: Result["state"], msg: string): Result => ({ state, routes: [], recommendedIsShortest: false, notes: [...notes, msg], sun });
  if (!validNode(data, q.from)) return empty("outside", "The start point is not on the walking map.");
  if (!validNode(data, q.to)) return empty("outside", "The end point is not on the walking map.");
  if ((q.from_snap_m ?? 0) > MAX_SNAP_M) {
    return empty("outside", `The start point is ${Math.round(q.from_snap_m ?? 0)} m from the nearest mapped path. Routes need a start near a street or path.`);
  }
  if ((q.to_snap_m ?? 0) > MAX_SNAP_M) {
    return empty("outside", `The end point is ${Math.round(q.to_snap_m ?? 0)} m from the nearest mapped path. Routes need an end near a street or path.`);
  }
  if (q.from === q.to) return empty("no_route", "Start and end are the same place.");

  const night = isNight(data, q.dateIdx, q.bucketIdx);
  // A per-date bundle holds only the dates fetched so far. The UI waits for the date; this guards other callers.
  const dayShade = !!data.shade && data.shade.loaded[q.dateIdx] === 1;
  if (data.shade && !dayShade) notes.push("Shade for this date did not load. Only roofs count as cover.");
  const cover: CoverMode = night || q.mode === "rain" || !dayShade ? "roof" : "shade";
  if (q.stepFree) notes.push("Step-free avoids mapped steps only. Lifts and ramps are not checked.");
  const spec = buildSpec(data, q, cover, q.includeUnchecked, q.stepFree);
  const memo = new Map<number, Path | null>();
  const run = (k: number): Path | null => {
    if (!memo.has(k)) memo.set(k, aStar(data, spec, q.from, q.to, k));
    return memo.get(k) ?? null;
  };

  const shortest = run(0);
  if (!shortest) {
    // Name the cause, so the card can give the fix that matches it.
    const reach = (d: Data, unchecked: boolean, stepFree: boolean) => aStar(d, buildSpec(d, q, "roof", unchecked, stepFree), q.from, q.to, 0) !== null;
    if (!q.includeUnchecked && reach(data, true, q.stepFree)) {
      notes.push('A route exists on paths with unchecked access. Turn on "Include paths with unchecked access" to see it.');
    } else if (q.stepFree && reach(data, q.includeUnchecked, false)) {
      notes.push("Every route between these points uses steps.");
    } else if (reach({ ...data, edgeHours: new Int32Array(data.edgeCount).fill(-1) }, q.includeUnchecked, q.stepFree)) {
      notes.push("Every route between these points passes through a place that is closed at this time.");
    } else if (reach({ ...data, edgeHours: new Int32Array(data.edgeCount).fill(-1) }, true, q.stepFree)) {
      // Each limit alone still blocks, but together they open a route: say so, not "no route at any hour".
      notes.push("A route exists only at other hours or on paths with unchecked access. Try another time, or include those paths.");
    } else if (q.stepFree && reach({ ...data, edgeHours: new Int32Array(data.edgeCount).fill(-1) }, true, false)) {
      notes.push("A route exists only with steps, and only at other hours or on paths with unchecked access.");
    } else {
      notes.push("No walking route connects these points at any hour.");
    }
    return { state: "no_route", routes: [], recommendedIsShortest: false, notes, sun };
  }
  const detour = (p: Path) => (shortest.length > 0 ? p.length / shortest.length - 1 : 0);

  let most: Path = shortest;
  for (const k of MOST_KS) {
    const p = run(k);
    if (p && detour(p) <= MOST_MAX_DETOUR + 1e-9) {
      most = p;
      break;
    }
  }

  const mk = (label: Route["label"], p: Path) => makeRoute(data, q, label, p, cover, night, q.stepFree);

  const gains = (p: Path, ref: Path) => key(p) !== key(ref) && rankExposure(data, q, p, cover) < rankExposure(data, q, ref, cover) - MOST_MIN_GAIN_M;

  if (night) {
    notes.push("The sun is down or very low. Shade does not apply.");
    const routes = [mk("shortest", shortest)];
    if (gains(most, shortest)) routes.push(mk("most", most));
    else notes.push("The most sheltered route is the shortest route.");
    return { state: "night", routes, recommendedIsShortest: true, notes, sun };
  }

  // The 15% rule compares the minutes the route card shows, so it uses arrival-time shade.
  const shortExposed = rankExposure(data, q, shortest, cover);
  const meetsRule = (p: Path | null): p is Path =>
    p !== null &&
    key(p) !== key(shortest) &&
    detour(p) <= REC_MAX_DETOUR + 1e-9 &&
    shortExposed > 0 &&
    1 - rankExposure(data, q, p, cover) / shortExposed >= REC_MIN_CUT - 1e-9;
  let rec: Path | null = null;
  for (const k of REC_KS) {
    const p = run(k);
    if (p && detour(p) <= REC_MAX_DETOUR + 1e-9) {
      rec = p;
      break;
    }
  }
  // The card says the shortest is recommended because no shown route meets the rule.
  // So when the k = 2 candidate falls short, a most covered route that meets it takes its place.
  if (!meetsRule(rec)) rec = meetsRule(most) ? most : null;
  const keepRec = rec !== null;

  const routes: Route[] = [];
  if (keepRec && rec) routes.push(mk("recommended", rec));
  else notes.push(q.mode === "rain" ? "No meaningfully more sheltered route." : "No meaningfully shadier route.");
  routes.push(mk("shortest", shortest));
  if (!gains(most, shortest)) {
    notes.push(q.mode === "rain" ? "The most sheltered route is the shortest route." : "The most covered route is the shortest route.");
  } else if (keepRec && rec && !gains(most, rec)) {
    notes.push(q.mode === "rain" ? "The most sheltered route is the recommended route." : "The most covered route is the recommended route.");
  } else {
    routes.push(mk("most", most));
  }
  return { state: "ok", routes, recommendedIsShortest: !keepRec, notes, sun };
}
