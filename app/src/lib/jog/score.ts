import type { Data } from "../router/types";
import { isNight } from "../router/route";
import type { JogAttrs } from "./types";

export const JOG_WEIGHTS = {
  // Cost per metre in sun during daylight.
  sun: 1.8,
  // Extra cost per road class on sidewalks, with larger roads costing more.
  road: 0.18,
  // Cost per metre tagged lit=no; unknown light costs one third of this.
  unlit: 1.5,
  // Cost per metre run before, halved after dark.
  history: 6,
  // Discount per park metre, bounded below by the metre's length.
  park: 1.2,
  // Discount per waterfront metre.
  water: 2,
  // Discount per metre beside a named sight in areas with enough mapped sights.
  sight: 0.6,
  // Cost in metres per turn of at least 45 degrees.
  turn: 8,
  // Additional metres for each road class squared at an unmarked side change.
  crossing: 35,
  // Search cost per already-used corridor metre to avoid out and back legs.
  repeat: 18,
  // Search cost per corridor metre in current choices to find different alternatives.
  alternative: 2,
};

export function bucketAt(data: Data, first: number, minute: number): number {
  let b = first;
  while (b + 1 < data.manifest.buckets_min.length && data.manifest.buckets_min[b + 1] <= minute) b++;
  return b;
}

export function darkAt(data: Data, date: number, bucket: number, _minute: number): boolean {
  return isNight(data, date, bucket);
}

export function shadedShare(data: Data, date: number, bucket: number, e: number): number {
  if (data.edgeFlags[e] & 7) return 1;
  const s = data.shade;
  if (!s || !s.loaded[date]) return 0;
  const i = (date * s.nBuckets + bucket) * s.nEdges + e;
  const b = s.building[i], t = s.tree[i];
  return b <= 100 && t <= 100 ? Math.min(100, b + t) / 100 : 0;
}

export function edgeExtra(_data: Data, jog: JogAttrs | null, e: number, dark: boolean, shade: number, seen: boolean, scoreSights: boolean): number {
  const w = JOG_WEIGHTS;
  let cost = dark ? 0 : w.sun * (1 - shade);
  if (jog) {
    const a = jog.edges;
    cost += w.road * a.road[e];
    cost = Math.max(0, cost - w.park * a.park[e] - w.water * a.water[e] - (scoreSights && a.sight[e] >= 0 ? w.sight : 0));
    if (dark && jog.litShare >= 0.3) cost += a.lit[e] === 1 ? 0 : a.lit[e] === 2 ? w.unlit : w.unlit / 3;
  }
  // Familiarity is additive after discounts, so its night weight stays exactly half.
  if (seen) cost += w.history * (dark ? 0.5 : 1);
  return cost;
}

export const crossingExtra = (road: number) => JOG_WEIGHTS.crossing * (road + 1) ** 2;
