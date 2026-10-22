// MapLibre loads as a plain script from its own file, so the browser can fetch it early at low priority
// without running it. It runs only when the map starts: on the first pointer, touch, key or focus input,
// or at once with ?now= or ?map=eager so tests and demos stay deterministic.
import scriptUrl from "maplibre-gl/dist/maplibre-gl.js?url";

export type MapLibreGL = typeof import("maplibre-gl");

let loading: Promise<MapLibreGL> | null = null;

export function prefetchMapLibre(): void {
  if (loading || document.querySelector(`link[rel="prefetch"][href="${scriptUrl}"]`)) return;
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "script";
  link.href = scriptUrl;
  document.head.appendChild(link);
}

export function loadMapLibre(): Promise<MapLibreGL> {
  loading ??= new Promise<MapLibreGL>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = scriptUrl;
    s.async = true;
    s.onload = () => resolve((window as unknown as { maplibregl: MapLibreGL }).maplibregl);
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("The map library could not load."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function mapLibre(): MapLibreGL {
  const ml = (window as unknown as { maplibregl?: MapLibreGL }).maplibregl;
  if (!ml) throw new Error("This browser could not load the map.");
  return ml;
}

export function eagerMap(): boolean {
  const q = new URLSearchParams(window.location.search);
  return q.has("now") || q.get("map") === "eager";
}
