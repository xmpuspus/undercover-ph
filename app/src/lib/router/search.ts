import type { Data, Place } from "./types";

/** Lower case, accents removed, punctuation turned into single spaces. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Edit distance between a and b, or max + 1 when it exceeds max. Stops early so a keystroke stays cheap. */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Typo budget for a query word: none under 4 letters, 1 edit under 8, 2 from 8 letters. */
function typoBudget(w: string): number {
  return w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
}

/** Smallest edit distance from query word w to a name token, or its same-length prefix while typing. Infinity when over budget. */
function fuzzyWordDistance(w: string, tokens: string[]): number {
  const max = typoBudget(w);
  if (max === 0) return Infinity;
  let best = Infinity;
  for (const t of tokens) {
    let d = boundedEditDistance(w, t, max);
    if (d > max && t.length > w.length) d = boundedEditDistance(w, t.slice(0, w.length), max);
    if (d <= max && d < best) best = d;
  }
  return best;
}

/**
 * Case-insensitive place search over names and aliases.
 * Order: exact match, name prefix, alias prefix, every query word as a word prefix, then a typo tier.
 * In the typo tier each query word must be a word prefix or within the typo budget of a name or alias token.
 * data can be an area's Data or any place list with its placeKeys, such as the index of every area.
 * prefer puts its places first within a tier, for example the area of the end already picked.
 */
export function searchPlaces(data: Pick<Data, "places" | "placeKeys">, q: string, limit = 8, prefer?: (p: Place) => boolean): Place[] {
  const nq = normalize(q);
  if (!nq) return [];
  const words = nq.split(" ");
  const hits: { place: Place; score: number; typos: number; other: number }[] = [];
  data.placeKeys.forEach((k, i) => {
    let score = -1;
    let typos = 0;
    if (k.name === nq || k.aliases.includes(nq)) score = 0;
    else if (k.name.startsWith(nq)) score = 1;
    else if (k.aliases.some((a) => a.startsWith(nq))) score = 2;
    else if (words.every((w) => k.tokens.some((t) => t.startsWith(w)))) score = 3;
    else {
      // Only reached when no exact or prefix tier matched, so most keystrokes skip this work.
      let total = 0;
      for (const w of words) {
        if (k.tokens.some((t) => t.startsWith(w))) continue;
        const d = fuzzyWordDistance(w, k.tokens);
        if (d === Infinity) {
          total = -1;
          break;
        }
        total += d;
      }
      if (total > 0) {
        score = 4;
        typos = total;
      }
    }
    if (score >= 0) hits.push({ place: data.places[i], score, typos, other: prefer && !prefer(data.places[i]) ? 1 : 0 });
  });
  hits.sort(
    (a, b) =>
      a.score - b.score || a.other - b.other || a.typos - b.typos || a.place.name.length - b.place.name.length || a.place.name.localeCompare(b.place.name),
  );
  return hits.slice(0, limit).map((h) => h.place);
}

/** Nearest node on at least one routable edge, with its distance in metres. */
export function snapToNode(data: Data, lon: number, lat: number): { node: number; dist_m: number } | null {
  const x = lon * data.mPerLon;
  const y = lat * data.mPerLat;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < data.nodeCount; i++) {
    if (!data.routableNode[i]) continue;
    const dx = data.nodeX[i] - x;
    const dy = data.nodeY[i] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? null : { node: best, dist_m: Math.sqrt(bestD) };
}
