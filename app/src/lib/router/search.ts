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

/**
 * Case-insensitive place search over names and aliases.
 * Order: exact match, name prefix, alias prefix, then every query word as a word prefix.
 */
export function searchPlaces(data: Data, q: string, limit = 8): Place[] {
  const nq = normalize(q);
  if (!nq) return [];
  const words = nq.split(" ");
  const hits: { place: Place; score: number }[] = [];
  data.placeKeys.forEach((k, i) => {
    let score = -1;
    if (k.name === nq || k.aliases.includes(nq)) score = 0;
    else if (k.name.startsWith(nq)) score = 1;
    else if (k.aliases.some((a) => a.startsWith(nq))) score = 2;
    else if (words.every((w) => k.tokens.some((t) => t.startsWith(w)))) score = 3;
    if (score >= 0) hits.push({ place: data.places[i], score });
  });
  hits.sort((a, b) => a.score - b.score || a.place.name.length - b.place.name.length || a.place.name.localeCompare(b.place.name));
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
