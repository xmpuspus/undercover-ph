import { advanceSide, aStar, JUNCTION_PENALTY_M, Switch, type SearchSpec } from "../router/astar";
import { clock12, openAt } from "../router/hours";
import { appendLine, buildSteps, type EdgeTrip } from "../router/steps";
import type { Data } from "../router/types";
import { sightGrade } from "./attrs";
import { JOG_COPY } from "./copy";
import { edgeLine, lineLength, pointAlong } from "./geometry";
import { historyMask } from "./history";
import { networkOf } from "./network";
import { distancePotential } from "./potential";
import { bucketAt, crossingExtra, darkAt, edgeExtra, JOG_WEIGHTS, shadedShare } from "./score";
import type { JogAttrs, JogQuery, JogResult, Loop } from "./types";

interface LoopPath { edges: number[]; nodes: number[] }
interface Topology { corridor: Int32Array; members: number[][]; allowed: Uint8Array; component: Int32Array; cycles: boolean[] }
const topologyCache = new WeakMap<Data, Topology>();
function topology(data: Data): Topology {
  let cached = topologyCache.get(data);
  if (cached) return cached;
  const keys = new Map<string, number>();
  const corridor = new Int32Array(data.edgeCount), members: number[][] = [];
  const allowed = new Uint8Array(data.edgeCount);
  for (let e = 0; e < data.edgeCount; e++) {
    const u = data.edgeU[e], v = data.edgeV[e];
    const key = u < v ? `${u}/${v}` : `${v}/${u}`;
    let id = keys.get(key);
    if (id === undefined) { id = members.length; keys.set(key, id); members.push([]); }
    corridor[e] = id;
    members[id].push(e);
    allowed[e] = data.edgeRoutable[e] && data.edgeLen[e] > 0 ? 1 : 0;
  }
  const { comp: component, cycles } = networkOf(data);
  cached = { corridor, members, allowed, component, cycles };
  topologyCache.set(data, cached);
  return cached;
}

function parkHoursIndex(data: Data, jog: JogAttrs | null, e: number): number {
  const hi = jog?.edges.hours[e] ?? -1;
  return hi >= 0 && data.hours[hi] ? hi : -1;
}

function parkName(data: Data, hi: number): string {
  const name = data.hours[hi]?.name;
  return typeof name === "string" && name.trim() ? name.trim() : "This park";
}

const parkHoursCache = new WeakMap<Data, WeakMap<JogAttrs, Data>>();
/** Give A* park hours without changing the data used by walking routes. */
function withParkHours(data: Data, jog: JogAttrs | null): Data {
  if (!jog) return data;
  let cache = parkHoursCache.get(data);
  if (!cache) { cache = new WeakMap(); parkHoursCache.set(data, cache); }
  const cached = cache.get(jog);
  if (cached) return cached;
  const edgeHours = data.edgeHours.slice(), hoursOpen = data.hoursOpen.slice();
  const combined = new Map<string, number>();
  let changed = false;
  for (let e = 0; e < data.edgeCount; e++) {
    const park = parkHoursIndex(data, jog, e), graph = data.edgeHours[e];
    if (park < 0 || park === graph) continue;
    changed = true;
    if (graph < 0) { edgeHours[e] = park; continue; }
    // A passage inside a park must satisfy both schedules. Reuse each intersection.
    const key = `${graph}/${park}`;
    let hi = combined.get(key);
    if (hi === undefined) {
      hi = hoursOpen.length;
      hoursOpen.push(Array.from({ length: 7 }, (_, day) => {
        const a = data.hoursOpen[graph]?.[day] ?? [], b = data.hoursOpen[park]?.[day] ?? [];
        const intervals: number[] = [];
        for (let i = 0; i < a.length; i += 2) for (let j = 0; j < b.length; j += 2) {
          const start = Math.max(a[i], b[j]), end = Math.min(a[i + 1], b[j + 1]);
          if (start < end) intervals.push(start, end);
        }
        return intervals;
      }));
      combined.set(key, hi);
    }
    edgeHours[e] = hi;
  }
  const view = changed ? { ...data, edgeHours, hoursOpen } : data;
  cache.set(jog, view);
  return view;
}

function closedStartNotes(data: Data, jog: JogAttrs | null, q: JogQuery, allowed: Uint8Array): string[] {
  const parks = new Set<number>();
  for (let j = data.adjOff[q.start]; j < data.adjOff[q.start + 1]; j++) {
    const e = data.adjEdge[j];
    if (!allowed[e]) continue;
    const hi = parkHoursIndex(data, jog, e);
    if (hi < 0 || openAt(data, hi, q.dateIdx, q.departMin)) return [];
    parks.add(hi);
  }
  return [...parks].map((hi) => {
    let next = Infinity;
    // Include next week's opening when today's only interval has already ended.
    for (let shift = 0; shift <= 7; shift++) {
      const intervals = data.hoursOpen[hi]?.[(data.dateDow[q.dateIdx] + shift) % 7] ?? [];
      for (let i = 0; i < intervals.length; i += 2) {
        const minute = shift * 1440 + intervals[i];
        if (minute > q.departMin) next = Math.min(next, minute);
      }
    }
    return `${parkName(data, hi)} is closed now.${Number.isFinite(next) ? ` It opens at ${clock12(next)}.` : ""}`;
  });
}

/** Measure arrival-time facts. A known sight can be scored on its own; findLoops applies the area's sight policy. */
export function measureLoop(data: Data, jog: JogAttrs | null, path: LoopPath, q: JogQuery, mask = historyMask(data, q.history ?? []), scoreSights = true): Loop {
  const speed = 1000 / q.paceMinPerKm;
  const coords: [number, number][] = [], trips: EdgeTrip[] = [], kmMarks: Loop["kmMarks"] = [];
  const crossings = { signals: 0, marked: 0, unmarked: 0, unmarkedBig: 0 };
  const sights = new Set<string>(), used = new Set<number>();
  const { corridor } = topology(data);
  let length = 0, shadeM = 0, lit = 0, unlit = 0, unknown = 0, shared = 0, repeat = 0, score = 0, turns = 0, context = 0;
  let dark = false, nextKm = 1000, previousAngle: number | null = null, previousCrossing = false;
  const warnings = new Set<string>();
  const hasHistory = Array.isArray(q.history) && q.history.length > 0;
  for (let i = 0; i < path.edges.length; i++) {
    const e = path.edges[i], len = data.edgeLen[e];
    const arriveMin = q.departMin + length / speed;
    const b = bucketAt(data, q.bucketIdx, arriveMin);
    const edgeDark = darkAt(data, q.dateIdx, b, arriveMin);
    dark ||= edgeDark || darkAt(data, q.dateIdx, bucketAt(data, b, arriveMin + len / speed), arriveMin + len / speed);
    const shade = edgeDark ? 0 : shadedShare(data, q.dateIdx, b, e);
    shadeM += len * shade;
    const seen = !!mask[e];
    if (seen) shared += len;
    score += len * (1 + edgeExtra(data, jog, e, edgeDark, shade, seen && q.preferNew !== false, scoreSights));
    if (jog?.edges.lit[e] === 1) lit += len;
    else if (jog?.edges.lit[e] === 2) unlit += len;
    else unknown += len;
    const si = jog?.edges.sight[e] ?? -1;
    if (si >= 0 && jog?.sights[si]) sights.add(jog.sights[si].name);
    const move = advanceSide(data, i ? path.edges[i - 1] : -1, e, path.nodes[i], context);
    context = move.context;
    if (move.switchIn === Switch.Forbidden) warnings.add("This path includes a sidewalk change that is not allowed.");
    const isCrossing = !!(data.edgeFlags[e] & 256);
    if (move.switchIn !== Switch.None || (isCrossing && !previousCrossing)) {
      const flag = data.nodeFlags?.[path.nodes[i]] ?? 0;
      if (move.switchIn === Switch.Junction) {
        crossings.unmarked++;
        const road = jog?.edges.road[e] ?? 0;
        if (road >= 4) crossings.unmarkedBig++;
        score += JUNCTION_PENALTY_M + crossingExtra(road);
        warnings.add("Crosses a road where there is no marked crossing.");
      } else if (flag & 2) crossings.signals++;
      else crossings.marked++;
    }
    previousCrossing = isCrossing;
    const line = edgeLine(data, e, data.edgeU[e] === path.nodes[i]);
    appendLine(coords, line);
    const roof = data.edgeFlags[e] & 7 ? len : 0;
    trips.push({ e, coords: line, roof, shade: Math.max(0, len * shade - roof), sun: len * (1 - shade), arriveMin, switchIn: move.switchIn });
    if (data.edgeFlags[e] & 16) warnings.add("Uses stairs or raised curbs.");
    if (data.edgeFlags[e] & 1024) warnings.add("Passes through a building. Its cover is not checked.");
    const hi = data.edgeHours[e];
    if (hi >= 0 && !(openAt(data, hi, q.dateIdx, arriveMin) && openAt(data, hi, q.dateIdx, arriveMin + len / speed))) warnings.add("A passage may be closed when you reach it.");
    const park = parkHoursIndex(data, jog, e);
    if (park >= 0 && !(openAt(data, park, q.dateIdx, arriveMin) && openAt(data, park, q.dateIdx, arriveMin + len / speed))) warnings.add(`${parkName(data, park)} may be closed when you reach it.`);
    while (nextKm < length + len - 1e-6) {
      kmMarks.push({ km: nextKm / 1000, at: pointAlong(data, line, lineLength(data, line) * (nextKm - length) / len) });
      nextKm += 1000;
    }
    // A boundary exactly at this edge's end belongs to the next edge, if the run continues.
    if (Math.abs(nextKm - length - len) < 1e-6 && i + 1 < path.edges.length) {
      kmMarks.push({ km: nextKm / 1000, at: line[line.length - 1] }); nextKm += 1000;
    }
    const u = path.nodes[i], v = path.nodes[i + 1];
    const angle = Math.atan2(data.nodeY[v] - data.nodeY[u], data.nodeX[v] - data.nodeX[u]);
    if (previousAngle !== null && Math.abs(Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle))) >= Math.PI / 4) turns++;
    previousAngle = angle;
    if (used.has(corridor[e])) repeat += len;
    used.add(corridor[e]);
    length += len;
  }
  score += turns * JOG_WEIGHTS.turn;
  return {
    edgeIds: path.edges.map((e) => data.edgeId[e]), nodes: path.nodes, coords,
    length_m: Math.round(length), minutes: Math.ceil(length / speed - 1e-9), dark,
    shade_pct: dark ? null : length ? Math.floor(100 * shadeM / length + 1e-9) : 0, crossings,
    lit_m: Math.round(lit), unlit_m: Math.round(unlit), unknownLit_m: Math.round(unknown), sights: [...sights],
    new_pct: hasHistory ? Math.max(0, Math.floor(100 * (1 - shared / (length || 1)) + 1e-9)) : null,
    shared_m: Math.round(shared), repeat_pct: length ? 100 * repeat / length : 0, turnsPerKm: length ? turns * 1000 / length : 0,
    score, steps: buildSteps(data, trips, q.dateIdx, speed), kmMarks, warnings: [...warnings],
  };
}

interface Candidate { loop: Loop; corridors: Map<number, number>; quality: number }
function overlap(a: Candidate, b: Candidate): number {
  let shared = 0;
  for (const [c, m] of a.corridors) if (b.corridors.has(c)) shared += m;
  return shared;
}
function choose(candidates: Candidate[]): Candidate[] {
  const sorted = [...candidates].sort((a, b) => a.quality - b.quality);
  let best: Candidate[] = [];
  const fits = (a: Candidate, b: Candidate) => overlap(a, b) <= 0.3 * Math.min(a.loop.length_m, b.loop.length_m);
  // Try more than the cheapest first loop: it can otherwise block two useful alternatives.
  for (let i = 0; i < Math.min(sorted.length, 16); i++) {
    const group = [sorted[i]];
    for (let j = 0; j < sorted.length && group.length < 3; j++) if (j !== i && group.every((a) => fits(a, sorted[j]))) group.push(sorted[j]);
    if (group.length > best.length) best = group;
    if (best.length === 3) break;
  }
  return best.sort((a, b) => a.quality - b.quality);
}

export function findLoops(data: Data, jog: JogAttrs | null, q: JogQuery): JogResult {
  const now = q.now ?? (() => performance.now()), started = now();
  let searches = 0, budgetHit = false;
  const notes = jog ? [] : [JOG_COPY.missing];
  const initialDark = darkAt(data, q.dateIdx, q.bucketIdx, q.departMin);
  const result = (state: JogResult["state"], loops: Loop[] = []): JogResult => ({ state, loops, notes, searches, budgetHit, elapsedMs: now() - started, dark: loops.some((l) => l.dark) || initialDark });
  if (!Number.isInteger(q.start) || q.start < 0 || q.start >= data.nodeCount || !data.routableNode[q.start]) {
    notes.push("Choose a start near a mapped street or path."); return result("outside");
  }
  if (!Number.isFinite(q.targetM) || q.targetM < 500 || q.targetM > 42_000 || !Number.isFinite(q.paceMinPerKm) || q.paceMinPerKm < 2 || q.paceMinPerKm > 20 ||
    !Number.isInteger(q.dateIdx) || q.dateIdx < 0 || q.dateIdx >= data.manifest.dates.length || !Number.isInteger(q.bucketIdx) || q.bucketIdx < 0 || q.bucketIdx >= data.manifest.buckets_min.length || !Number.isFinite(q.departMin) || q.departMin < 0 || q.departMin >= 1440) {
    notes.push("Choose 0.5 to 42 km, a pace of 2 to 20 min/km, and an available time."); return result("no_loop");
  }
  const budget = Number.isFinite(q.budgetMs) ? Math.max(1, Math.min(5000, q.budgetMs!)) : 1500;
  const expired = () => { if (now() - started >= budget) budgetHit = true; return budgetHit; };
  const top = topology(data), mask = historyMask(data, q.history ?? []), speed = 1000 / q.paceMinPerKm;
  const closed = closedStartNotes(data, jog, q, top.allowed);
  if (closed.length) { notes.push(...closed); return result("no_loop"); }
  const searchData = withParkHours(data, jog);
  if (!top.cycles[top.component[q.start]]) {
    notes.push("This start is on an isolated path with no loop. Choose a nearby street.");
    return result("no_loop");
  }
  const scoreSights = !!jog && sightGrade(jog, data) !== "thin";
  const costs = new Map<number, Float32Array>();
  const junctionExtra = new Float32Array(data.edgeCount);
  for (let e = 0; e < data.edgeCount; e++) junctionExtra[e] = crossingExtra(jog?.edges.road[e] ?? 0);
  const baseAt = (minute: number) => {
    const b = bucketAt(data, q.bucketIdx, minute), dark = darkAt(data, q.dateIdx, b, minute);
    const key = b * 2 + Number(dark);
    let extra = costs.get(key);
    if (!extra) {
      extra = new Float32Array(data.edgeCount);
      for (let e = 0; e < data.edgeCount; e++) extra[e] = edgeExtra(data, jog, e, dark, dark ? 0 : shadedShare(data, q.dateIdx, b, e), !!mask[e] && q.preferNew !== false, scoreSights);
      costs.set(key, extra);
    }
    return extra;
  };
  const exposure = new Float32Array(data.edgeCount);
  const fromStart = distancePotential(data, exposure, q.start);
  const allowed = top.allowed.slice();
  // Even without hours or sidewalk restrictions, reaching either end, using this edge and
  // returning must fit the longest accepted loop. Weighted preferences cannot tighten this bound.
  for (let e = 0; e < data.edgeCount; e++) {
    if (fromStart[data.edgeU[e]] + data.edgeLen[e] + fromStart[data.edgeV[e]] > q.targetM * 1.1 + 1e-6) allowed[e] = 0;
  }
  const spec: SearchSpec = { allowed, exposure, departMin: q.departMin, dateIdx: q.dateIdx };
  const sx = data.nodeX[q.start], sy = data.nodeY[q.start];
  const nearest = (x: number, y: number) => {
    let best = -1, distance = Infinity;
    for (let n = 0; n < data.nodeCount; n++) {
      if (top.component[n] !== top.component[q.start]) continue;
      const d = (data.nodeX[n] - x) ** 2 + (data.nodeY[n] - y) ** 2;
      if (d < distance) { distance = d; best = n; }
    }
    return best;
  };
  // Only a degree-one start earns a repeated stem. Count neighbours, not parallel sidewalks.
  let stemM = 0, prev = -1, node = q.start;
  const stemNodes = new Set<number>();
  while (!stemNodes.has(node)) {
    stemNodes.add(node);
    const neighbours = new Map<number, number>();
    for (let j = data.adjOff[node]; j < data.adjOff[node + 1]; j++) if (top.allowed[data.adjEdge[j]] && data.adjNode[j] !== prev) neighbours.set(data.adjNode[j], data.adjEdge[j]);
    if (neighbours.size !== 1 || (prev < 0 && stemNodes.size > 1)) break;
    const [n, e] = [...neighbours][0];
    stemM += data.edgeLen[e]; prev = node; node = n;
  }
  const candidates: Candidate[] = [], keys = new Set<string>();
  let best: Candidate[] = [], closest = 0, closestGap = Infinity;
  let lastProgress = 0;
  let random = ((q.seed ?? 1) >>> 0) || 1;
  const rnd = () => { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; return (random >>> 0) / 4294967296; };
  const rotation = rnd() * Math.PI * 2 + (q.seed ?? 1) * 0.71;
  const extra = new Float32Array(data.edgeCount);
  for (let attempt = 0; attempt < 150 && !expired(); attempt++) {
    const angle = rotation + attempt * 2.3999632297;
    const span = [Math.PI / 2, Math.PI * 2 / 3, Math.PI, Math.PI / 3, Math.PI * 5 / 6][attempt % 5];
    let radius = (q.targetM - 2 * stemM) / (2 + 2 * Math.sin(span / 2)) * (0.72 + rnd() * 0.2);
    for (let adjust = 0; adjust < 2 && !expired(); adjust++) {
      const a = nearest(sx + radius * Math.cos(angle), sy + radius * Math.sin(angle));
      const b = nearest(sx + radius * Math.cos(angle + span), sy + radius * Math.sin(angle + span));
      if (a === q.start || b === q.start || a === b || a < 0 || b < 0) break;
      const edges: number[] = [], nodes = [q.start], used = new Set<number>();
      let length = 0, context = 0, incoming = -1, valid = true;
      for (const target of [a, b, q.start]) {
        if (expired()) { valid = false; break; }
        const start = nodes[nodes.length - 1];
        spec.departMin = q.departMin + length / speed;
        const base = baseAt(spec.departMin);
        extra.set(base);
        for (const c of used) for (const e of top.members[c]) extra[e] += JOG_WEIGHTS.repeat;
        for (const candidate of best) for (const c of candidate.corridors.keys()) for (const e of top.members[c]) extra[e] += JOG_WEIGHTS.alternative;
        const potential = distancePotential(data, extra, target, { allowed, stopAt: start });
        searches++;
        const leg = aStar(searchData, spec, start, target, 0, { extra, junctionExtra, mPerMin: speed, potential, entry: incoming >= 0 ? { edge: incoming, context } : undefined });
        if (!leg || !leg.edges.length) { valid = false; break; }
        for (let i = 0; i < leg.edges.length; i++) {
          const e = leg.edges[i];
          const move = advanceSide(data, incoming, e, leg.nodes[i], context);
          if (move.switchIn === Switch.Forbidden) valid = false;
          context = move.context; incoming = e; used.add(top.corridor[e]);
          edges.push(e); nodes.push(leg.nodes[i + 1]);
        }
        length += leg.length;
      }
      if (!valid) break;
      const gap = Math.abs(length - q.targetM);
      if (gap < closestGap) { closest = length; closestGap = gap; }
      if (gap > q.targetM * 0.1) { radius *= Math.max(0.55, Math.min(1.5, q.targetM / length)); continue; }
      const key = edges.join(",");
      if (keys.has(key)) break;
      keys.add(key);
      let repeats = 0;
      const corridors = new Map<number, number>();
      for (const e of edges) {
        const c = top.corridor[e];
        if (corridors.has(c)) repeats += data.edgeLen[e];
        else corridors.set(c, data.edgeLen[e]);
      }
      if (Math.max(0, repeats - stemM) > length * 0.1) break;
      const loop = measureLoop(data, jog, { edges, nodes }, q, mask, scoreSights);
      if (loop.warnings.some((w) => /not allowed|may be closed/.test(w))) break;
      loop.repeat_pct = 100 * Math.max(0, repeats - stemM) / length;
      candidates.push({ loop, corridors, quality: loop.score / length + gap / q.targetM });
      const picked = choose(candidates);
      const quality = (set: Candidate[]) => set.reduce((sum, c) => sum + c.quality, 0) / (set.length || 1);
      if (picked.length > best.length || quality(picked) < quality(best) - 0.005) lastProgress = searches;
      best = picked;
      break;
    }
    if (best.length === 3 && candidates.length >= 12) break;
    if (best.length && searches - lastProgress >= 90) break;
  }
  if (!best.length) notes.push(`No loop near this distance was found. The closest was ${(closest / 1000).toFixed(1)} km. Try a shorter distance or another start.`);
  else if (best.length < 3) notes.push(`Only ${best.length} ${best.length === 1 ? "loop fits" : "loops fit"} this distance without sharing too many streets. Try another start for more choices.`);
  if (budgetHit) notes.push("The search reached its time limit. These are the loops found so far.");
  return result(best.length ? "ok" : "no_loop", best.map((c) => c.loop));
}
