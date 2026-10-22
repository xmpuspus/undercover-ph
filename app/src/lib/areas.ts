import { AREA_LABELS } from "../config";
import type { AreaInfo, Place } from "../types";

type Box = [number, number, number, number];
const inBox = ([w, s, e, n]: Box, lon: number, lat: number) => lon >= w && lon <= e && lat >= s && lat <= n;

/** True when one of the area's graph boxes holds the point. */
export const holdsPoint = (a: AreaInfo, lon: number, lat: number) => a.graph_rects.some((r) => inBox(r, lon, lat));

/**
 * The area whose graph holds both ends of a trip, or null. Areas overlap at their edges (BGC and McKinley Hill,
 * MOA and Aseana), so a trip across that seam still has one graph that routes it. The end's area goes first.
 */
export function sharedArea(areas: AreaInfo[], a: { area: string; lon: number; lat: number }, b: { area: string; lon: number; lat: number }): string | null {
  const order = [b.area, a.area, ...areas.map((x) => x.id)];
  for (const id of order) {
    const x = areas.find((y) => y.id === id);
    if (x && holdsPoint(x, a.lon, a.lat) && holdsPoint(x, b.lon, b.lat)) return x.id;
  }
  return null;
}

/** The short name the landing card uses, or the name from areas.json for an area the card does not list. */
export function areaLabel(id: string, areas: AreaInfo[] | null): string {
  return AREA_LABELS.find((a) => a.id === id)?.label ?? areas?.find((a) => a.id === id)?.name ?? id;
}

/**
 * The area whose graph covers the point, or null outside every area. Graph boxes overlap at some edges
 * (Greenhills and Cubao), so the current area wins, then the area whose core box holds the point.
 */
export function areaAt(areas: AreaInfo[], lon: number, lat: number, current: string | null): AreaInfo | null {
  const hits = areas.filter((a) => a.graph_rects.some((r) => inBox(r, lon, lat)));
  return hits.find((a) => a.id === current) ?? hits.find((a) => inBox(a.bbox, lon, lat)) ?? hits[0] ?? null;
}

/** Where a place is, for the search list: its neighbourhood, or its area when no neighbourhood box holds it. */
export function placeWhere(p: Place, areas: AreaInfo[] | null): string | null {
  const a = p.area ? areas?.find((x) => x.id === p.area) : undefined;
  if (!a) return null;
  return a.neighbourhoods.find((n) => inBox(n.bbox, p.lon, p.lat))?.name ?? areaLabel(a.id, areas);
}

export const NCR = "ncr";
export const regionOf = (a: AreaInfo | undefined) => a?.region?.id ?? NCR;

/** Metro Manila first, then the other regions by name, each with its areas. */
export function areaGroups(areas: AreaInfo[] | null): { region: string; name: string; areas: AreaInfo[] }[] {
  const groups = new Map<string, { region: string; name: string; areas: AreaInfo[] }>();
  for (const a of areas ?? []) {
    const id = regionOf(a);
    if (!groups.has(id)) groups.set(id, { region: id, name: a.region?.name ?? "Metro Manila", areas: [] });
    groups.get(id)!.areas.push(a);
  }
  return [...groups.values()].sort((x, y) => (x.region === NCR ? -1 : y.region === NCR ? 1 : x.name.localeCompare(y.name)));
}

/** The covered areas as one sentence part, in the landing card's order. */
export function areaList(areas: AreaInfo[] | null): string {
  const order = (id: string) => {
    const i = AREA_LABELS.findIndex((a) => a.id === id);
    return i < 0 ? AREA_LABELS.length : i;
  };
  const ids = areas ? areas.map((a) => a.id).sort((a, b) => order(a) - order(b)) : AREA_LABELS.map((a) => a.id);
  return ids.map((id) => areaLabel(id, areas)).join("; ");
}

/** The cities PAGASA may name for an area. With no area picked, every covered city. */
export function areaCities(id: string | null, areas: AreaInfo[] | null): string[] {
  if (!areas) return ["Makati"];
  const a = id ? areas.find((x) => x.id === id) : undefined;
  // A regional advisory can name the whole province, which covers the area too.
  if (a) return [...a.cities, ...(a.region?.provinces ?? [])];
  return [...new Set(areas.filter((x) => regionOf(x) === NCR).flatMap((x) => x.cities))];
}
