import { DATA_BASE } from "../config";
import type { Advisory, Manifest, Markers, Weather } from "../types";

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

export async function readMarkers(): Promise<Markers> {
  const [graph, shade, weather] = await Promise.all([
    exists("READY.graph"),
    exists("READY.shade"),
    exists("READY.weather"),
  ]);
  return { graph, shade, weather };
}

export const loadManifest = () => fetchJSON<Manifest>("manifest.json");
export const loadWeather = () => fetchJSON<Weather>("weather.json");
// An advisory covers 2 hours, so the live function (api/advisory.js on Vercel) comes first.
// The dev server and a failed PAGASA fetch fall back to the copy from the daily build.
export async function loadAdvisory(): Promise<Advisory | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/advisory`, { cache: "no-cache" });
    if (isRealFile(res)) {
      const live = (await res.json()) as Advisory;
      if (live.status === "ok") return live;
    }
  } catch {
    // fall through to the build copy
  }
  return fetchJSON<Advisory>("advisory.json");
}
// The display file holds only buildings near the walk area. The full set is a pipeline input only.
export const loadBuildings = () => fetchJSON<GeoJSON.FeatureCollection>("buildings_display.geojson");
// The map's worker fetches and parses the buildings from this URL, off the main thread.
export const BUILDINGS_URL = new URL(`${DATA_BASE}buildings_display.geojson`, window.location.href).href;
