import type { Place } from "../types";

/** Coordinates are lossless at the source's seven decimals, relative to each area's first place. */
export interface SearchShard {
  version: 1;
  areas: [string, number, number][];
  categories: string[];
  order: number[];
  name: string[];
  category: number[];
  lon: number[];
  lat: number[];
  node: number[];
  area: number[];
  aliases: Record<number, string[]>;
  detail: Record<number, string>;
  chunks?: string[];
}

export type SearchEntry = { order: number; place: Place };

export function encodeSearch(entries: SearchEntry[]): SearchShard {
  const s: SearchShard = { version: 1, areas: [], categories: [], order: [], name: [], category: [], lon: [], lat: [], node: [], area: [], aliases: {}, detail: {} };
  for (const { order, place: p } of entries) {
    let area = s.areas.findIndex((a) => a[0] === p.area);
    if (area < 0) {
      area = s.areas.length;
      s.areas.push([p.area!, Math.round(p.lon * 1e7), Math.round(p.lat * 1e7)]);
    }
    let category = s.categories.indexOf(p.category);
    if (category < 0) category = s.categories.push(p.category) - 1;
    s.order.push(order);
    s.name.push(p.name);
    s.category.push(category);
    s.lon.push(Math.round(p.lon * 1e7) - s.areas[area][1]);
    s.lat.push(Math.round(p.lat * 1e7) - s.areas[area][2]);
    s.node.push(p.node_id);
    s.area.push(area);
    if (p.aliases?.length) s.aliases[order] = p.aliases;
    if (p.detail !== undefined) s.detail[order] = p.detail;
  }
  return s;
}

export function decodeSearch(value: unknown): { entries: SearchEntry[]; chunks: string[] } {
  const s = value as SearchShard | null;
  const bad = () => { throw new Error("Invalid search file."); };
  if (!s || s.version !== 1 || !Array.isArray(s.order) || s.order.length > 100_000 ||
      !Array.isArray(s.areas) || !Array.isArray(s.categories) || !s.categories.every((c) => typeof c === "string") ||
      !s.areas.every((a) => Array.isArray(a) && typeof a[0] === "string" && Number.isSafeInteger(a[1]) && Number.isSafeInteger(a[2]))) return bad();
  for (const key of ["name", "category", "lon", "lat", "node", "area"] as const) {
    if (!Array.isArray(s[key]) || s[key].length !== s.order.length) return bad();
  }
  const chunks = s.chunks ?? [];
  if (!Array.isArray(chunks) || !chunks.every((c) => typeof c === "string" && /^[a-z0-9-]+\.json$/.test(c))) return bad();
  const seen = new Set<number>();
  const entries = s.order.map((order, i) => {
    if (!Number.isSafeInteger(order) || order < 0 || seen.has(order) || typeof s.name[i] !== "string" ||
        ![s.category[i], s.lon[i], s.lat[i], s.node[i], s.area[i]].every(Number.isSafeInteger)) return bad();
    seen.add(order);
    const a = s.areas[s.area[i]], category = s.categories[s.category[i]];
    if (!a || category === undefined || s.node[i] < 0) return bad();
    const lon = (a[1] + s.lon[i]) / 1e7, lat = (a[2] + s.lat[i]) / 1e7;
    const aliases = s.aliases?.[order] ?? [];
    const detail = s.detail?.[order];
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90 || !Array.isArray(aliases) ||
        !aliases.every((v) => typeof v === "string") || (detail !== undefined && typeof detail !== "string")) return bad();
    return { order, place: { name: s.name[i], category, lon, lat, node_id: s.node[i], area: a[0], aliases, ...(detail !== undefined ? { detail } : {}) } };
  });
  return { entries, chunks };
}

/** Source order preserves stable ties in searchPlaces even when shards arrive out of order. */
export function mergeSearch(entries: Map<number, Place>, more: SearchEntry[]): Place[] {
  for (const { order, place } of more) entries.set(order, place);
  return [...entries.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}
