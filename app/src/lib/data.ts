import { DATA_BASE } from "../config";
import type { Advisory, AreaInfo, Manifest, Markers, Place, Weather } from "../types";

// The dev server answers a missing file with index.html, so a 200 alone does not prove the file exists.
function isRealFile(res: Response): boolean {
  return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
}

export async function fetchJSON<T>(name: string): Promise<T | null> {
  try {
    const res = await fetch(`${DATA_BASE}${name}`, { cache: "no-cache" });
    if (!isRealFile(res)) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function exists(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${DATA_BASE}${name}`, { cache: "no-cache" });
    return isRealFile(res);
  } catch {
    return false;
  }
}

// Each area keeps its routing bundle, weather, and markers under data/areas/<id>/.
export const areaPath = (area: string) => `areas/${area}/`;
export const areaBase = (area: string) => `${DATA_BASE}${areaPath(area)}`;

export async function readMarkers(area: string): Promise<Markers> {
  const [graph, shade, weather] = await Promise.all([
    exists(`${areaPath(area)}READY.graph`),
    exists(`${areaPath(area)}READY.shade`),
    exists(`${areaPath(area)}READY.weather`),
  ]);
  return { graph, shade, weather };
}

// areas.json lists the areas; places_index.json holds every place of every area, so search covers them all.
// Both throw on failure, so the app can show its retry state.
async function mustJSON<T>(name: string): Promise<T> {
  const v = await fetchJSON<T>(name);
  if (v === null) throw new Error(`Cannot load ${name}.`);
  return v;
}
export const loadAreas = async () => (await mustJSON<{ areas: AreaInfo[] }>("areas.json")).areas;
export const loadPlaceIndex = () => mustJSON<Place[]>("places_index.json");

export const loadManifest = (area: string) => fetchJSON<Manifest>(`${areaPath(area)}manifest.json`);
export const loadWeather = (area: string) => fetchJSON<Weather>(`${areaPath(area)}weather.json`);
// An advisory covers 2 hours, so the live function (api/advisory.js on Vercel) comes first.
// The dev server and a failed PAGASA fetch fall back to the copy from the daily build. PAGASA writes one
// advisory for all of Metro Manila, so any area's copy serves.
// prsd: the area region's PAGASA division page. The function answers for Metro Manila without one.
export async function loadAdvisory(area: string, prsd = "ncrprsd"): Promise<Advisory | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/advisory${prsd === "ncrprsd" ? "" : `?prsd=${prsd}`}`, { cache: "no-cache" });
    if (isRealFile(res)) {
      const live = (await res.json()) as Advisory;
      if (live.status === "ok") return live;
    }
  } catch {
    // fall through to the build copy
  }
  return fetchJSON<Advisory>(`${areaPath(area)}advisory.json`);
}
// The display file holds only buildings near the walk area. The full set is a pipeline input only.
export const loadBuildings = () => fetchJSON<GeoJSON.FeatureCollection>("buildings_display.geojson");
// The map's worker fetches and parses the buildings from this URL, off the main thread.
export const BUILDINGS_URL = new URL(`${DATA_BASE}buildings_display.geojson`, window.location.href).href;
