import type { Place } from "../types";

// Rank of a place as a suggestion. City halls first, then malls, hospitals and terminals. 0 means never.
function fame(p: Place): number {
  if (/\b(city hall|municipal hall|capitol)\b/i.test(p.name) && !/justice|annex|old /i.test(p.name)) return 7;
  if (p.category === "mall") return 6;
  if (p.category === "hospital") return 5;
  if ((p.category === "bus_station" || p.category === "station") && /terminal|station/i.test(p.name)) return 4;
  if (/cathedral|university/i.test(p.name)) return 4;
  if (["museum", "park", "plaza"].includes(p.category)) return 3;
  return 0;
}

/**
 * Up to n suggested places for an area that has no hand-picked list: well-known kinds, with a name that is
 * not repeated in the area, at most two of one kind. Longer names win a tie ("SM City Batangas" over "BOSS").
 */
export function wellKnown(places: Place[], area: string, n = 4): Place[] {
  const mine = places.filter((p) => p.area === area);
  const count = new Map<string, number>();
  for (const p of mine) count.set(p.name.toLowerCase(), (count.get(p.name.toLowerCase()) ?? 0) + 1);
  const ranked = mine
    .filter((p) => fame(p) > 0 && count.get(p.name.toLowerCase()) === 1 && p.name.length >= 6)
    .sort((a, b) => fame(b) - fame(a) || b.name.length - a.name.length || a.name.localeCompare(b.name));
  const out: Place[] = [];
  const kinds = new Map<number, number>();
  for (const p of ranked) {
    const k = fame(p);
    if ((kinds.get(k) ?? 0) >= 2) continue;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    out.push(p);
    if (out.length === n) break;
  }
  return out;
}
