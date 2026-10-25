import { Switch, WALK_M_PER_MIN } from "./astar";
import { clock12, closesAtMinute, hhmm } from "./hours";
import type { Data, Step, StepFlag } from "./types";

/** One edge of a route, oriented in walking order, with its cover in metres under the active mode. */
export interface EdgeTrip {
  e: number;
  coords: [number, number][];
  roof: number;
  shade: number;
  sun: number;
  arriveMin: number;
  /** How the walker moved onto this edge from the previous one. */
  switchIn: Switch;
}

/**
 * Append part to line. Drop part's first point only when it repeats the line's last point.
 * Edge geometries do not always meet at their shared node, so a gap stays as a straight connector.
 */
export function appendLine(line: [number, number][], part: [number, number][]): void {
  const last = line[line.length - 1];
  const first = part[0];
  const skip = last !== undefined && first !== undefined && last[0] === first[0] && last[1] === first[1] ? 1 : 0;
  for (let i = skip; i < part.length; i++) line.push(part[i]);
}

type Kind = "walk" | "covered" | "indoor" | "inbuilding" | "underpass" | "footbridge" | "steps" | "elevator" | "crossing";
type Turn = "straight" | "slight left" | "left" | "sharp left" | "slight right" | "right" | "sharp right";

interface Leg {
  kind: Kind;
  name: string | null;
  dist: number;
  roof: number;
  shade: number;
  sun: number;
  flags: Set<StepFlag>;
  landmarks: Map<string, number>;
  coords: [number, number][];
  /** Start bearing of the leg itself, before any folded lead-in. */
  mainBearing: number;
  /** Some edge has flag 1024: inside a building footprint, cover unverified. */
  inBuilding: boolean;
  hours: { idx: number; min: number }[];
  leadIns: { kind: Kind; name: string | null; stairs: boolean }[];
  /** Metres per 8-wind sidewalk side, from side edges only. */
  sideM: Map<string, number>;
  /** The part of sideM on sidewalks that OSM maps (flag 32). The rest is assumed from the road class. */
  sideMappedM: Map<string, number>;
  /** Per side, metres walked with that side on the left minus metres with it on the right. */
  handM: Map<string, number>;
  /** A change of sidewalk at the start of the leg. */
  switchStart: Switch;
  /** A change of sidewalk without a marked crossing inside the leg, after folding. */
  unmarked: boolean;
}

const UNMARKED_EN = "Cross where there is no marked crossing";
const UNMARKED_TL = "Tumawid kahit walang tawiran";
const SIDE_TL: Record<string, string> = {
  north: "hilagang",
  northeast: "hilagang-silangang",
  east: "silangang",
  southeast: "timog-silangang",
  south: "timog na",
  southwest: "timog-kanlurang",
  west: "kanlurang",
  northwest: "hilagang-kanlurang",
};

const MIN_STEP_M = 25;
const BEARING_WINDOW_M = 20;
const MAX_WORDS = 12;
// Short legs of these kinds fold forward and keep a lead-in phrase, so "Cross the street" survives.
const LEAD_IN: ReadonlySet<Kind> = new Set<Kind>(["crossing", "steps", "elevator", "footbridge", "underpass"]);

function kindOf(flags: number): Kind {
  // A raised kerb sets the steps bit on its crossing edge. It stays a crossing with a stairs flag.
  if (flags & 256 && flags & 16) return "crossing";
  if (flags & 16) return "steps";
  if (flags & 512) return "elevator";
  if (flags & 8) return "footbridge";
  if (flags & 2) return "underpass";
  if (flags & 4) return "indoor";
  if (flags & 1) return "covered";
  if (flags & 1024) return "inbuilding";
  if (flags & 256) return "crossing";
  return "walk";
}

function stepFlags(data: Data, e: number): StepFlag[] {
  const f = data.edgeFlags[e];
  const out: StepFlag[] = [];
  if (f & 16) out.push("stairs");
  if (f & 8) out.push("footbridge");
  if (f & 2) out.push("underpass");
  if (f & 4 || f & 1024) out.push("indoor");
  if (f & 256) out.push("crossing");
  if (data.edgeHours[e] >= 0) out.push("hours");
  if (!data.edgeRoutable[e]) out.push("unchecked");
  return out;
}

function bearing(data: Data, a: [number, number], b: [number, number]): number {
  const dx = (b[0] - a[0]) * data.mPerLon;
  const dy = (b[1] - a[1]) * data.mPerLat;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

function segLen(data: Data, a: [number, number], b: [number, number]): number {
  return Math.hypot((b[0] - a[0]) * data.mPerLon, (b[1] - a[1]) * data.mPerLat);
}

// Bearing over the first or last 20 m of a line, so small kinks do not read as turns.
function startBearing(data: Data, c: [number, number][]): number {
  let d = 0;
  let i = 1;
  for (; i < c.length - 1; i++) {
    d += segLen(data, c[i - 1], c[i]);
    if (d >= BEARING_WINDOW_M) break;
  }
  return bearing(data, c[0], c[Math.min(i, c.length - 1)]);
}

function endBearing(data: Data, c: [number, number][]): number {
  let d = 0;
  let i = c.length - 2;
  for (; i > 0; i--) {
    d += segLen(data, c[i], c[i + 1]);
    if (d >= BEARING_WINDOW_M) break;
  }
  return bearing(data, c[Math.max(i, 0)], c[c.length - 1]);
}

/** Signed change from bearing a to bearing b, -180 to 180. Positive turns right. */
function delta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

function turnOf(d: number): Turn {
  const a = Math.abs(d);
  const side = d < 0 ? "left" : "right";
  if (a < 20) return "straight";
  if (a < 45) return side === "left" ? "slight left" : "slight right";
  if (a < 120) return side;
  return side === "left" ? "sharp left" : "sharp right";
}

const TURN_EN: Record<Turn, string> = {
  straight: "Continue",
  "slight left": "Slight left",
  left: "Turn left",
  "sharp left": "Sharp left",
  "slight right": "Slight right",
  right: "Turn right",
  "sharp right": "Sharp right",
};

const TURN_TL: Record<Turn, string> = {
  straight: "Diretso",
  "slight left": "Mag-slight left",
  left: "Kumaliwa",
  "sharp left": "Mag-sharp left",
  "slight right": "Mag-slight right",
  right: "Kumanan",
  "sharp right": "Mag-sharp right",
};

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

function compass(b: number): string {
  return COMPASS[Math.round(b / 45) % 8];
}

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

function words(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

function structEn(kind: Kind, name: string | null, roofed: boolean, stairs: boolean): string {
  switch (kind) {
    case "covered":
      return "Take the covered walkway";
    case "inbuilding":
      return "Walk through the building (cover not checked)";
    case "underpass":
      return `Go through the underpass${stairs ? " (stairs)" : ""}`;
    case "indoor":
      return name ? `Walk through ${name}` : "Walk through the building";
    case "footbridge":
      return `Cross the ${roofed ? "covered " : ""}footbridge${stairs ? " (stairs)" : ""}`;
    case "steps":
      return "Take the stairs";
    case "elevator":
      return "Take the elevator";
    case "crossing":
      return `${name ? `Cross ${name}` : "Cross the street"}${stairs ? " (curb step)" : ""}`;
    case "walk":
      return name ? `Walk along ${name}` : "Walk ahead";
  }
}

function structTl(kind: Kind, name: string | null, roofed: boolean, stairs: boolean): string {
  switch (kind) {
    case "covered":
      return "Dumaan sa may bubong na daanan";
    case "inbuilding":
      return "Dadaan sa loob ng gusali (hindi pa nasusuri)";
    case "underpass":
      return `Dumaan sa underpass${stairs ? " (may hagdan)" : ""}`;
    case "indoor":
      return name ? `Dumaan sa loob ng ${name}` : "Dumaan sa loob ng gusali";
    case "footbridge":
      return `Tumawid sa ${roofed ? "may bubong na " : ""}footbridge${stairs ? " (may hagdan)" : ""}`;
    case "steps":
      return "Gamitin ang hagdan";
    case "elevator":
      return "Sumakay sa elevator";
    case "crossing":
      return `${name ? `Tumawid sa ${name}` : "Tumawid sa kalsada"}${stairs ? " (may baitang)" : ""}`;
    case "walk":
      return name ? `Maglakad sa ${name}` : "Maglakad nang diretso";
  }
}

function mainText(
  leg: Leg,
  turn: Turn | null,
  heading: string,
  prevName: string | null,
  lm: string | null,
): [string, string] {
  const stairs = leg.flags.has("stairs");
  if (leg.kind === "walk") {
    const name = leg.name;
    const side = legSide(leg);
    if (side) {
      const street = name ?? "the street";
      const streetTl = name ?? "kalsada";
      // The compass word plus the walker's own hand, so nobody needs to know where north is.
      const hand = legHand(leg, side);
      const handEn = hand ? ` (on your ${hand})` : "";
      const handTl = hand ? ` (sa ${hand === "left" ? "kaliwa" : "kanan"} mo)` : "";
      const where = `the ${side} side${handEn} of ${street}${lm ? ` past ${lm}` : ""}`;
      const whereTl = `${SIDE_TL[side]} bahagi${handTl} ng ${streetTl}${lm ? `, lampas sa ${lm}` : ""}`;
      if (leg.switchStart === Switch.Free) return [`Cross to ${where}`, `Tumawid sa ${whereTl}`];
      if (leg.switchStart === Switch.Junction) return [`${UNMARKED_EN}. Walk on ${where}`, `${UNMARKED_TL}. Sa ${whereTl}`];
      if (turn === null) return [`Head ${heading} on ${where}`, `Maglakad pa-${heading} sa ${whereTl}`];
      if (turn === "straight") return [`Walk on ${where}`, `Sa ${whereTl}`];
      return [`${TURN_EN[turn]}, then walk on ${where}`, `${TURN_TL[turn]}, tapos sa ${whereTl}`];
    }
    if (turn === null) {
      return [
        `Head ${heading}${name ? ` on ${name}` : ""}${lm ? ` past ${lm}` : ""}`,
        `Maglakad pa-${heading}${name ? ` sa ${name}` : ""}${lm ? `, lampas sa ${lm}` : ""}`,
      ];
    }
    if (turn === "straight") {
      const en =
        name && name !== prevName
          ? `Continue onto ${name}${lm ? ` past ${lm}` : ""}`
          : `Continue${lm ? ` past ${lm}` : name ? ` on ${name}` : " straight"}`;
      return [en, `Diretso${name ? ` sa ${name}` : ""}${lm ? `, lampas sa ${lm}` : ""}`];
    }
    if (name && name === prevName) {
      return [
        `${TURN_EN[turn]} to stay on ${name}${lm ? ` past ${lm}` : ""}`,
        `${TURN_TL[turn]}, ${name} pa rin${lm ? `, lampas sa ${lm}` : ""}`,
      ];
    }
    return [
      `${TURN_EN[turn]}${name ? ` onto ${name}` : ""}${lm ? ` past ${lm}` : ""}`,
      `${TURN_TL[turn]}${name ? ` sa ${name}` : ""}${lm ? `, lampas sa ${lm}` : ""}`,
    ];
  }
  if (leg.kind === "inbuilding") {
    // A statement, not an instruction, so a turn comes as its own sentence.
    const en = structEn(leg.kind, leg.name, false, false);
    const tl = structTl(leg.kind, leg.name, false, false);
    return turn !== null && turn !== "straight" ? [`${TURN_EN[turn]}. ${en}`, `${TURN_TL[turn]}. ${tl}`] : [en, tl];
  }
  const roofed = leg.dist > 0 && leg.roof / leg.dist >= 0.75;
  let en = structEn(leg.kind, leg.name, roofed, stairs);
  let tl = structTl(leg.kind, leg.name, roofed, stairs);
  if (lm) {
    en += ` past ${lm}`;
    tl += `, lampas sa ${lm}`;
  }
  if (turn !== null && turn !== "straight") {
    en = `${TURN_EN[turn]}, then ${lowerFirst(en)}`;
    tl = `${TURN_TL[turn]}, tapos ${lowerFirst(tl)}`;
  }
  return [en, tl];
}

function compose(
  leg: Leg,
  prevEnd: number | null,
  leadStart: number,
  prevName: string | null,
  lm: string | null,
): [string, string] {
  const heading = compass(leg.mainBearing);
  const net = prevEnd === null ? null : turnOf(delta(prevEnd, leg.mainBearing));
  if (leg.leadIns.length === 0) return mainText(leg, net, heading, prevName, lm);
  const leadEn = leg.leadIns.map((l) => structEn(l.kind, l.name, false, l.stairs && l.kind === "crossing"));
  const leadTl = leg.leadIns.map((l) => structTl(l.kind, l.name, false, l.stairs && l.kind === "crossing"));
  if (leg.kind === "inbuilding") {
    const [en, tl] = mainText(leg, net, heading, prevName, lm);
    return [`${leadEn.join(", then ")}. ${en}`, `${leadTl.join(", tapos ")}. ${tl}`];
  }
  if (net !== null && net !== "straight" && Math.abs(delta(leadStart, leg.mainBearing)) < 45) {
    // The crossing runs the way the walker leaves, so the turn comes first:
    // "Turn right, cross the street, then continue onto Paseo de Roxas".
    const [en, tl] = mainText(leg, "straight", heading, prevName, lm);
    return [
      `${TURN_EN[net]}, ${leadEn.map(lowerFirst).join(", ")}, then ${lowerFirst(en)}`,
      `${TURN_TL[net]}, ${leadTl.map(lowerFirst).join(", ")}, tapos ${lowerFirst(tl)}`,
    ];
  }
  // A side change: "Cross the street, then continue on Ayala Avenue".
  const [en, tl] = mainText(leg, net, heading, prevName, lm);
  return [[...leadEn, lowerFirst(en)].join(", then "), [...leadTl, lowerFirst(tl)].join(", tapos ")];
}

function newLeg(data: Data, t: EdgeTrip): Leg {
  const e = t.e;
  const lmName = data.edgeLandmark[e];
  const landmarks = new Map<string, number>();
  if (lmName) landmarks.set(lmName, data.edgeLen[e]);
  const side = data.edgeSide[e] ? sideWord(data, e) : null;
  return {
    kind: kindOf(data.edgeFlags[e]),
    name: data.edgeName[e],
    dist: data.edgeLen[e],
    roof: t.roof,
    shade: t.shade,
    sun: t.sun,
    flags: new Set(stepFlags(data, e)),
    landmarks,
    coords: t.coords.slice(),
    mainBearing: startBearing(data, t.coords),
    inBuilding: (data.edgeFlags[e] & 1024) !== 0,
    sideM: side ? new Map([[side, data.edgeLen[e]]]) : new Map<string, number>(),
    sideMappedM: side && data.edgeFlags[e] & 32 ? new Map([[side, data.edgeLen[e]]]) : new Map<string, number>(),
    handM: side ? new Map([[side, handOf(data, e, t.coords)]]) : new Map<string, number>(),
    switchStart: t.switchIn,
    unmarked: false,
    hours: data.edgeHours[e] >= 0 ? [{ idx: data.edgeHours[e], min: t.arriveMin }] : [],
    leadIns: [],
  };
}

// Append leg b to leg a. a keeps its kind and name.
function absorb(a: Leg, b: Leg): void {
  a.dist += b.dist;
  a.roof += b.roof;
  a.shade += b.shade;
  a.sun += b.sun;
  a.inBuilding = a.inBuilding || b.inBuilding;
  a.unmarked = a.unmarked || b.unmarked || b.switchStart === Switch.Junction;
  if (b.switchStart !== Switch.None) a.flags.add("crossing");
  for (const [k, v] of b.sideM) a.sideM.set(k, (a.sideM.get(k) ?? 0) + v);
  for (const [k, v] of b.sideMappedM) a.sideMappedM.set(k, (a.sideMappedM.get(k) ?? 0) + v);
  for (const [k, v] of b.handM) a.handM.set(k, (a.handM.get(k) ?? 0) + v);
  for (const f of b.flags) a.flags.add(f);
  for (const [k, v] of b.landmarks) a.landmarks.set(k, (a.landmarks.get(k) ?? 0) + v);
  appendLine(a.coords, b.coords);
  a.hours.push(...b.hours);
}

// Prepend leg a to leg b. b keeps its kind and name. withLeadIn keeps a's phrase in b's text.
function prepend(a: Leg, b: Leg, withLeadIn: boolean): void {
  b.dist += a.dist;
  b.roof += a.roof;
  b.shade += a.shade;
  b.sun += a.sun;
  b.inBuilding = b.inBuilding || a.inBuilding;
  // b's own start is now inside the leg. The leg starts where a starts.
  b.unmarked = b.unmarked || a.unmarked || b.switchStart === Switch.Junction;
  if (b.switchStart !== Switch.None) b.flags.add("crossing");
  b.switchStart = a.switchStart;
  for (const [k, v] of a.sideM) b.sideM.set(k, (b.sideM.get(k) ?? 0) + v);
  for (const [k, v] of a.sideMappedM) b.sideMappedM.set(k, (b.sideMappedM.get(k) ?? 0) + v);
  for (const [k, v] of a.handM) b.handM.set(k, (b.handM.get(k) ?? 0) + v);
  for (const f of a.flags) b.flags.add(f);
  for (const [k, v] of a.landmarks) b.landmarks.set(k, (b.landmarks.get(k) ?? 0) + v);
  const joined = a.coords.slice();
  appendLine(joined, b.coords);
  b.coords = joined;
  b.hours = [...a.hours, ...b.hours];
  const phrase = withLeadIn && a.kind !== b.kind;
  b.leadIns = [...a.leadIns, ...(phrase ? [{ kind: a.kind, name: a.name, stairs: a.flags.has("stairs") }] : []), ...b.leadIns];
  if (!phrase) b.mainBearing = a.mainBearing;
}

const COMPASS8 = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/**
 * 8-wind side of a sidewalk edge. Its side, left or right, is relative to the u-to-v direction (the OSM way
 * direction), so the side lies 90 degrees from the u-to-v chord. The mean offset of the line (sideX, sideY)
 * points the wrong way on bent pieces, the same fault the router's side test had.
 */
function sideWord(data: Data, e: number): string {
  const u = data.edgeU[e];
  const v = data.edgeV[e];
  const chord = (Math.atan2(data.nodeX[v] - data.nodeX[u], data.nodeY[v] - data.nodeY[u]) * 180) / Math.PI;
  const b = (chord + (data.edgeSide[e] === 1 ? -90 : 90) + 720) % 360;
  return COMPASS8[Math.round(b / 45) % 8];
}

/** Signed length of sidewalk edge e as walked: positive when its side is on the walker's left. */
function handOf(data: Data, e: number, c: [number, number][]): number {
  const u = data.edgeU[e];
  const v = data.edgeV[e];
  const walk = (c[c.length - 1][0] - c[0][0]) * (data.nodeLon[v] - data.nodeLon[u]) * data.mPerLon ** 2 +
    (c[c.length - 1][1] - c[0][1]) * (data.nodeLat[v] - data.nodeLat[u]) * data.mPerLat ** 2;
  // Walking u to v keeps the edge's own side. Walking v to u swaps left and right.
  const left = (data.edgeSide[e] === 1) === walk >= 0;
  return (left ? 1 : -1) * data.edgeLen[e];
}

/** "left" or "right" for the walker on the leg's side, or null when the leg's edges disagree evenly. */
function legHand(leg: Leg, side: string): "left" | "right" | null {
  const h = leg.handM.get(side) ?? 0;
  return h > 0 ? "left" : h < 0 ? "right" : null;
}

/** The side that carries more than half of the leg's length, or null. */
function legSide(leg: Leg): string | null {
  let best: string | null = null;
  let bestM = 0;
  for (const [k, v] of leg.sideM) {
    if (v > bestM) {
      best = k;
      bestM = v;
    }
  }
  return best && bestM > leg.dist / 2 ? best : null;
}

/** The step's side, and whether OSM maps a sidewalk on at least half of the leg's metres on that side. */
function sideFields(leg: Leg): { side?: string; sideMapped?: boolean } {
  const side = legSide(leg);
  if (!side) return {};
  return { side, sideMapped: (leg.sideMappedM.get(side) ?? 0) >= (leg.sideM.get(side) ?? 0) / 2 };
}

function cover(leg: Leg): Step["cover"] {
  const total = leg.roof + leg.shade + leg.sun;
  if (total <= 0) return "mixed";
  if (leg.roof / total >= 0.75) return "roof";
  if ((leg.roof + leg.shade) / total >= 0.75) return "shade";
  if (leg.sun / total >= 0.75) return "sun";
  return "mixed";
}

function bestLandmark(leg: Leg): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const [k, v] of leg.landmarks) {
    if (leg.name && k.toLowerCase() === leg.name.toLowerCase()) continue;
    if (v > bestLen) {
      best = k;
      bestLen = v;
    }
  }
  return best;
}

/**
 * Turn a route into landmark steps.
 * 1. Merge consecutive edges with the same name and cover kind, unless the path turns 45 degrees or more.
 * 2. Fold steps under 25 m into a neighbour. Stairs, crossings, and bridges fold forward and keep their phrase.
 * 3. Word the turn from the bearing change, then add the landmark, cover words, and closing time.
 */
export function buildSteps(data: Data, trips: EdgeTrip[], dateIdx: number, mPerMin = WALK_M_PER_MIN): Step[] {
  if (trips.length === 0) return [];
  const legs: Leg[] = [];
  let prevTrip: EdgeTrip | null = null;
  for (const t of trips) {
    const last = legs[legs.length - 1];
    const kind = kindOf(data.edgeFlags[t.e]);
    const sameGroup =
      last !== undefined &&
      prevTrip !== null &&
      last.kind === kind &&
      last.name === data.edgeName[t.e] &&
      t.switchIn === Switch.None &&
      (kind !== "walk" || Math.abs(delta(endBearing(data, prevTrip.coords), startBearing(data, t.coords))) < 45);
    if (sameGroup) absorb(last, newLeg(data, t));
    else legs.push(newLeg(data, t));
    prevTrip = t;
  }

  // Stairs belong to the bridge or underpass they lead to, at any length: "Cross the footbridge (stairs)".
  // Two touching legs of the same structure become one, even when their names differ.
  const structural = (l: Leg | null | undefined) => !!l && (l.kind === "footbridge" || l.kind === "underpass");
  for (let i = 0; i < legs.length - 1; ) {
    const a = legs[i];
    const b = legs[i + 1];
    if (structural(a) && (b.kind === "steps" || b.kind === a.kind)) {
      absorb(a, b);
      legs.splice(i + 1, 1);
    } else if (a.kind === "steps" && structural(b)) {
      prepend(a, b, false);
      legs.splice(i, 1);
    } else {
      i++;
    }
  }

  // Rejoin a street before folding short walking links changes its end bearing or compass side.
  const ordinary = (l: Leg) => l.kind === "walk" || l.kind === "covered";
  for (let i = 0; i < legs.length - 2; i++) {
    const a = legs[i];
    if (!ordinary(a) || a.name === null) continue;
    let linkM = 0;
    for (let j = i + 1; j < legs.length; j++) {
      const b = legs[j];
      if (!ordinary(b) || b.switchStart !== Switch.None || b.flags.has("crossing")) break;
      if (j > i + 1 && b.name === a.name) {
        const sideA = legSide(a);
        const sideB = legSide(b);
        const handA = sideA ? legHand(a, sideA) : null;
        const handB = sideB ? legHand(b, sideB) : null;
        const sameSide = (!sideA && !sideB) || (handA !== null && handA === handB);
        if (sameSide && Math.abs(delta(endBearing(data, a.coords), b.mainBearing)) < 45) {
          // A cover change does not end the street. Use street wording for a mixed leg;
          // absorb retains the measured cover instead of describing the whole leg as roofed.
          if (a.kind !== b.kind) a.kind = "walk";
          for (let k = i + 1; k <= j; k++) absorb(a, legs[k]);
          legs.splice(i + 1, j - i);
          j = i;
          linkM = 0;
          continue;
        }
        break;
      }
      linkM += b.dist;
      if (linkM >= MIN_STEP_M) break;
    }
  }

  for (;;) {
    if (legs.length < 2) break;
    const i = legs.findIndex((l) => l.dist < MIN_STEP_M);
    if (i < 0) break;
    const leg = legs[i];
    const prev = i > 0 ? legs[i - 1] : null;
    const next = i < legs.length - 1 ? legs[i + 1] : null;
    if (leg.kind === "steps" && next && structural(next)) {
      prepend(leg, next, false); // stairs up to a bridge: "Cross the footbridge (stairs)"
    } else if (leg.kind === "steps" && prev && structural(prev)) {
      absorb(prev, leg); // stairs down from a bridge
    } else if (next && (LEAD_IN.has(leg.kind) || !prev)) {
      prepend(leg, next, LEAD_IN.has(leg.kind));
    } else if (prev) {
      absorb(prev, leg);
    }
    legs.splice(i, 1);
  }

  // Folding can leave two touching legs of the same street and kind. Join them again.
  for (let i = 0; i < legs.length - 1; ) {
    const a = legs[i];
    const b = legs[i + 1];
    const same =
      a.kind === b.kind &&
      a.name === b.name &&
      b.leadIns.length === 0 &&
      b.switchStart === Switch.None &&
      legSide(a) === legSide(b) &&
      (a.kind !== "walk" || Math.abs(delta(endBearing(data, a.coords), b.mainBearing)) < 45);
    if (same) {
      absorb(a, b);
      legs.splice(i + 1, 1);
    } else {
      i++;
    }
  }

  const steps: Step[] = [];
  let prevName: string | null = null;
  legs.forEach((leg, i) => {
    const prevEnd = i === 0 ? null : endBearing(data, legs[i - 1].coords);
    const leadStart = startBearing(data, leg.coords);
    const lm = bestLandmark(leg);
    // Drop the landmark from a string that would run past 12 words. step.landmark keeps it.
    let [en, tl] = compose(leg, prevEnd, leadStart, prevName, lm);
    if (lm && (words(en) > MAX_WORDS || words(tl) > MAX_WORDS)) {
      const [en0, tl0] = compose(leg, prevEnd, leadStart, prevName, null);
      if (words(en) > MAX_WORDS) en = en0;
      if (words(tl) > MAX_WORDS) tl = tl0;
    }
    const sideText = leg.kind === "walk" && legSide(leg) !== null;
    if (leg.switchStart === Switch.Junction && !sideText) {
      en = `${UNMARKED_EN}. ${en}`;
      tl = `${UNMARKED_TL}. ${tl}`;
    }
    if (leg.unmarked) {
      en += `. ${UNMARKED_EN}`;
      tl += `. ${UNMARKED_TL}`;
    }
    if (leg.switchStart !== Switch.None) leg.flags.add("crossing");
    if (leg.inBuilding && leg.kind !== "inbuilding") {
      en += `. ${structEn("inbuilding", null, false, false)}`;
      tl += `. ${structTl("inbuilding", null, false, false)}`;
    }
    let closesAt: string | null = null;
    const h = leg.hours[0];
    if (h) {
      const close = closesAtMinute(data, h.idx, dateIdx, h.min);
      if (close !== null) {
        closesAt = hhmm(close);
        const place = data.hours[h.idx]?.name ?? "This passage";
        en += `. ${place} closes at ${clock12(close)}`;
        tl += `. Sarado ang ${place} ng ${clock12(close)}`;
      }
    }
    steps.push({
      text: en,
      textTl: tl,
      distance_m: Math.round(leg.dist),
      minutes: leg.dist > 0 ? Math.max(1, Math.ceil(leg.dist / mPerMin - 1e-9)) : 0,
      cover: cover(leg),
      landmark: lm,
      flags: [...leg.flags],
      closesAt,
      at: leg.coords[0],
      ...sideFields(leg),
    });
    prevName = leg.name;
  });
  return steps;
}
