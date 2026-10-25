import { useEffect } from "react";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { Loop } from "../lib/jog/types";
import type { Insets } from "./MapView";
import { mapLibre } from "../lib/maplibre";

// Wider screens keep the existing gentle tilt for the loop overview.
const LOOP_PITCH = 25;

const collection = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const line = (coordinates: number[][]): GeoJSON.Feature => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } });

export function jogArrows(loop: Loop | null | undefined): GeoJSON.Feature[] {
  if (!loop) return [];
  const out: GeoJSON.Feature[] = [];
  let walked = 0, next = 150;
  for (let i = 1; i < loop.coords.length; i++) {
    const a = loop.coords[i - 1], b = loop.coords[i];
    const mx = 111_195 * Math.cos(a[1] * Math.PI / 180), my = 111_195;
    const dx = (b[0] - a[0]) * mx, dy = (b[1] - a[1]) * my, len = Math.hypot(dx, dy);
    while (len > 0 && next <= walked + len) {
      const t = (next - walked) / len, x = a[0] + t * (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]);
      const ux = dx / len, uy = dy / len;
      out.push(line([[x + (-10 * ux - 6 * uy) / mx, y + (-10 * uy + 6 * ux) / my], [x, y], [x + (-10 * ux + 6 * uy) / mx, y + (-10 * uy - 6 * ux) / my]]));
      next += 250;
    }
    walked += len;
  }
  return out;
}

export default function JogLayer({ map, loop, styleTick, styleReady, insets, onDrawn }: { map: Map | null; loop: Loop | null; styleTick: number; styleReady: boolean; insets: Insets; onDrawn: (counts: { marks: number; arrows: number }) => void }) {
  useEffect(() => {
    if (!map || !styleReady) { onDrawn({ marks: 0, arrows: 0 }); return; }
    const put = (id: string, data: GeoJSON.FeatureCollection) => {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (source) source.setData(data); else map.addSource(id, { type: "geojson", data });
    };
    put("jog-loop", collection(loop ? [line(loop.coords)] : []));
    const arrows = jogArrows(loop);
    put("jog-arrows", collection(arrows));
    put("jog-km", collection(loop?.kmMarks.map((m) => ({ type: "Feature", properties: { label: `${m.km}` }, geometry: { type: "Point", coordinates: m.at } })) ?? []));
    if (!map.getLayer("jog-halo")) map.addLayer({ id: "jog-halo", type: "line", source: "jog-loop", paint: { "line-color": "#ffffff", "line-width": 9 }, layout: { "line-join": "round", "line-cap": "round" } });
    if (!map.getLayer("jog-line")) map.addLayer({ id: "jog-line", type: "line", source: "jog-loop", paint: { "line-color": "#1d4ed8", "line-width": 5 }, layout: { "line-join": "round", "line-cap": "round" } });
    if (!map.getLayer("jog-direction")) map.addLayer({ id: "jog-direction", type: "line", source: "jog-arrows", paint: { "line-color": "#ffffff", "line-width": 2.5 }, layout: { "line-join": "round", "line-cap": "round" } });
    if (!map.getLayer("jog-km-dot")) map.addLayer({ id: "jog-km-dot", type: "circle", source: "jog-km", paint: { "circle-radius": 11, "circle-color": "#ffffff", "circle-stroke-color": "#1d4ed8", "circle-stroke-width": 2 } });
    onDrawn({ marks: loop?.kmMarks.length ?? 0, arrows: arrows.length });
  }, [map, loop, styleTick, styleReady, onDrawn]);
  useEffect(() => {
    if (!map || !styleReady || !loop) return;
    // HTML labels keep kilometre numbers readable when the basemap's glyph server is unavailable.
    const markers = loop.kmMarks.map(({ km, at }) => {
      const el = document.createElement("span");
      el.className = "jog-km-label";
      el.textContent = String(km);
      el.setAttribute("role", "img"); el.setAttribute("aria-label", `${km} km`);
      Object.assign(el.style, { display: "grid", placeItems: "center", width: "22px", height: "22px", borderRadius: "50%", background: "white", color: "#1e3a8a", border: "2px solid #1d4ed8", font: "600 12px sans-serif", pointerEvents: "none" });
      return new (mapLibre().Marker)({ element: el, anchor: "center" }).setLngLat(at).addTo(map);
    });
    return () => markers.forEach((m) => m.remove());
  }, [map, loop, styleReady]);
  useEffect(() => {
    if (!map || !styleReady || !loop?.coords.length) return;
    const timer = setTimeout(() => {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const [x, y] of loop.coords) { w = Math.min(w, x); s = Math.min(s, y); e = Math.max(e, x); n = Math.max(n, y); }
      // A flat, north-up phone view fits the loop without spare rotated corners or tilt shrinking it.
      // Panel insets already exclude the sheet. The extra margin keeps the kilometre labels inside the map.
      const phone = typeof matchMedia === "function" && matchMedia("(max-width: 767px)").matches;
      map.setPadding(insets);
      map.jumpTo({ pitch: phone ? 0 : Math.min(map.getPitch(), LOOP_PITCH) });
      // Finish phone fits in this update, so a sheet resize cannot leave an interrupted flight.
      map.fitBounds([[w, s], [e, n]], { padding: phone ? 12 : 28, maxZoom: 17, duration: phone ? 0 : 700, bearing: phone ? 0 : map.getBearing() });
    }, 150);
    return () => clearTimeout(timer);
  }, [map, loop, insets.top, insets.bottom, insets.left, insets.right, styleTick, styleReady]);
  return null;
}
