import { useEffect, useMemo, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CBD_CENTER, COLORS, DATA_BASE, NIGHT_ALT_DEG, STYLE_DAY, STYLE_NIGHT } from "../config";
import type { Endpoint, Mode, ShadowOverlay } from "../types";
import { segColor, type DisplayRoute } from "../lib/display";
import { anchorCandidates, nearestOnRect, placeBubbles, type Rect } from "../lib/callouts";
import { mixTheme, rgba, type SkyTheme } from "../lib/skyTheme";
import { animate, prefersReducedMotion } from "../lib/motion";
import { lengthM, sliceAlong } from "../lib/ribbon";
import { mapLibre } from "../lib/maplibre";
import { addPmtilesProtocol } from "../lib/pmtiles";
import { BUILDINGS_SOURCE, GroundShadows, TREES_SOURCE } from "../lib/groundShadows";
import { rectsOutline, type Rect as AreaRect } from "../lib/areaOutline";
import { MoonIcon, SunIcon, UmbrellaIcon } from "./Icons";

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Focus {
  at: [number, number];
  bearing: number | null;
  zoom: number;
}

interface Props {
  // Sky, light and building colours for the chosen hour. theme.dark picks the night basemap.
  theme: SkyTheme;
  // Replaced by buildingTiles. Kept so older callers compile; a GeoJSON URL here is ignored.
  buildingsUrl?: string;
  // PMTiles of the 3D buildings (layer "buildings") and of the tree crowns (layer "trees") for every area.
  // Defaults: data/buildings.pmtiles and data/trees.pmtiles.
  buildingTiles?: string;
  treeTiles?: string;
  // Called when the building tiles for the view have loaded.
  onBuildings: () => void;
  // onLoaded: the style is in. onReady: the map is worth showing (basemap drawn, first idle, or once it has
  // loaded and the camera leaves the landing view). The landing poster fades out on onReady.
  onLoaded: () => void;
  onReady: () => void;
  // Routing and data cover graph_bbox (the pilot box plus 500 m). A solid blue outline shows it.
  coverBbox: [number, number, number, number] | null;
  // Routing areas from areas.json. Each gets the solid blue outline round its graph boxes; without them, coverBbox does.
  areas?: { graph_rects: AreaRect[] }[] | null;
  routes: DisplayRoute[];
  selected: number;
  mode: Mode;
  nightState: boolean;
  from: Endpoint | null;
  to: Endpoint | null;
  insets: Insets;
  stage: "landing" | "plan" | "navigate";
  focus: Focus | null;
  showCallouts: boolean;
  fitKey: string;
  onMapClick: (lon: number, lat: number) => void;
  onSelect: (i: number) => void;
  onBearing: (deg: number) => void;
  // The chosen hour's sun as [altitude, azimuth] in degrees, for the ground shadows. Default: the sun in theme.light.
  sun?: [number, number] | null;
  // The Shadows switch. Shadows also hide when the sun is at or below NIGHT_ALT_DEG.
  shadowsOn?: boolean;
  // Replaced by shadowsOn and sun: the pipeline's shadow PNG. Only shadow={null}, which meant off, still counts.
  shadow?: { url: string; coords: ShadowOverlay["coords"] } | null;
  // A stretch of the selected route to light up, from the route ribbon.
  highlight: { coords: [number, number][]; color: string } | null;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
// Motion timings. Reduced motion makes all of them instant.
const DRAW_MS = 700;
const FADE_MS = 400;
const NO_TRANSITION = { duration: 0, delay: 0 };
const BUBBLE_W = 150;
const BUBBLE_H = 46;
// Tilted far enough that a band of sky shows above the skyline.
const LANDING = { center: CBD_CENTER, zoom: 15.6, pitch: 74, bearing: -28 };

type Src = maplibregl.GeoJSONSource;

function line(coords: [number, number][], props: Record<string, unknown>): GeoJSON.Feature {
  return { type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } };
}

function tilesUrl(url: string | undefined, file: string): string {
  return `pmtiles://${url ?? new URL(`${DATA_BASE}${file}`, window.location.href).href}`;
}

// The sun for the shadows: the sun prop, else the light direction of the theme, which follows the same sun.
function sunOf(p: Props): [number, number] | null {
  if (p.sun !== undefined) return p.sun;
  const l = p.theme.light;
  return l.anchor === "map" ? [90 - l.position[2], l.position[1]] : null;
}

// Older callers switch shadows off with shadow={null}.
function shadowsOn(p: Props): boolean {
  return p.shadowsOn ?? p.shadow !== null;
}

function shadowsShown(p: Props): boolean {
  const sun = sunOf(p);
  return shadowsOn(p) && !!sun && sun[0] > NIGHT_ALT_DEG;
}

// The dark basemap draws its labels in dim grey (about 2:1 on its ground) and has no place labels,
// but night steps still name landmarks ("past SM Makati"). Lighten its labels and add place names
// with the day style's rank and zoom steps. They sit under the route lines, which are added later.
const NIGHT_TEXT = { "text-color": "#CBD5E1", "text-halo-color": "rgba(15,23,42,0.9)", "text-halo-width": 1.2 } as const;
function nightLabels(map: maplibregl.Map, layers: maplibregl.LayerSpecification[]) {
  for (const l of layers) {
    if (l.type !== "symbol") continue;
    for (const [k, v] of Object.entries(NIGHT_TEXT)) map.setPaintProperty(l.id, k, v);
  }
  const point: maplibregl.ExpressionSpecification = ["match", ["geometry-type"], ["MultiPoint", "Point"], true, false];
  const ranks: [string, number, maplibregl.ExpressionSpecification][] = [
    ["hb-night-poi-r1", 15, ["all", point, [">=", ["get", "rank"], 1], ["<", ["get", "rank"], 7]]],
    ["hb-night-poi-r7", 16, ["all", point, [">=", ["get", "rank"], 7], ["<", ["get", "rank"], 20]]],
    ["hb-night-poi-r20", 17, ["all", point, [">=", ["get", "rank"], 20]]],
  ];
  for (const [id, minzoom, filter] of ranks) {
    if (map.getLayer(id)) continue;
    map.addLayer({
      id,
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      minzoom,
      filter,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-max-width": 9 },
      paint: { ...NIGHT_TEXT, "text-color": "#E2E8F0" },
    });
  }
}

// The ground when OpenFreeMap cannot serve its style: no streets or labels, but the walking areas, buildings,
// trees and routes still draw, since they come from this site. PLAN.md item 17 (2026-10-23).
const FALLBACK_STYLE = "fallback";
const FALLBACK_GROUND = { day: "#E2E8F0", night: "#0F172A" };
function fallbackStyle(dark: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "hb-ground", type: "background", paint: { "background-color": dark ? FALLBACK_GROUND.night : FALLBACK_GROUND.day } }],
  };
}

export default function MapView(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const styleUrl = useRef("");
  const fallback = useRef(false);
  const props = useRef(p);
  props.current = p;
  const markers = useRef<{ from?: maplibregl.Marker; to?: maplibregl.Marker }>({});
  // Plan views open at this pitch; a pitch the user sets by hand replaces it for later fits.
  const planPitch = useRef(35);
  const [failed, setFailed] = useState<string | null>(null);
  const shownOnce = useRef({ loaded: false, ready: false });
  const announceReady = () => {
    if (shownOnce.current.ready) return;
    shownOnce.current.ready = true;
    props.current.onReady();
  };
  const toneRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  // The theme now on screen. It differs from props.theme while a change of hour eases in.
  const shown = useRef(p.theme);
  // How much of the selected route is drawn, 0 to 1. A newly selected route draws itself in.
  const drawn = useRef(1);
  // Ground shadows of the buildings and trees in view, drawn for the chosen sun.
  const groundShadows = useRef<GroundShadows | null>(null);
  const [tick, setTick] = useState(0);
  const [styleTick, setStyleTick] = useState(0);

  const routeData = useMemo(() => {
    const alt: GeoJSON.Feature[] = [];
    const sel: GeoJSON.Feature[] = [];
    let selFull: GeoJSON.Feature[] = [];
    p.routes.forEach((d, i) => {
      if (i === p.selected) {
        selFull = [line(d.route.coords, {})];
        for (const s of d.route.segments) {
          sel.push(line(s.coords, { kind: s.kind, color: segColor(s.kind, p.mode, p.nightState) }));
        }
        if (!d.route.segments.length) sel.push(line(d.route.coords, { kind: "roof", color: COLORS.blue }));
      } else {
        const segs = d.route.segments.length ? d.route.segments : [{ coords: d.route.coords, kind: "sun" }];
        for (const s of segs) alt.push(line(s.coords, { idx: i, kind: s.kind }));
      }
    });
    return {
      alt: { type: "FeatureCollection", features: alt } as GeoJSON.FeatureCollection,
      sel: { type: "FeatureCollection", features: sel } as GeoJSON.FeatureCollection,
      selFull: { type: "FeatureCollection", features: selFull } as GeoJSON.FeatureCollection,
      key: p.routes[p.selected]?.key ?? "",
    };
  }, [p.routes, p.selected, p.mode, p.nightState]);
  const routeRef = useRef(routeData);
  routeRef.current = routeData;

  // Where routing works: each area's graph boxes joined into one outline, or the single cover box.
  const outline = useMemo((): GeoJSON.Feature | null => {
    const groups: AreaRect[][] = p.areas?.length ? p.areas.map((a) => a.graph_rects) : p.coverBbox ? [[p.coverBbox]] : [];
    const rings = groups.flatMap((rects) => rectsOutline(rects));
    return rings.length ? { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: rings } } : null;
  }, [p.areas, p.coverBbox]);
  const outlineRef = useRef(outline);
  outlineRef.current = outline;
  const sun = sunOf(p);
  const shadows = shadowsOn(p);
  const shadowsVisible = shadowsShown(p);

  // The selected route, drawn up to the current progress.
  function syncSelected() {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const r = routeRef.current;
    const [sel, full] = drawn.current >= 1 ? [r.sel, r.selFull] : partRoute(r.sel, r.selFull, drawn.current);
    (map.getSource("hb-sel") as Src | undefined)?.setData(sel);
    (map.getSource("hb-sel-full") as Src | undefined)?.setData(full);
    const h = props.current.highlight;
    (map.getSource("hb-hl") as Src | undefined)?.setData(h && drawn.current >= 1 ? { type: "FeatureCollection", features: [line(h.coords, { color: h.color })] } : EMPTY);
  }

  // Push current data into the map sources. Safe to call before the style loads; it waits.
  function sync() {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const q = props.current;
    (map.getSource("hb-alt") as Src | undefined)?.setData(routeRef.current.alt);
    syncSelected();
    const o = outlineRef.current;
    (map.getSource("hb-pilot") as Src | undefined)?.setData(o && q.stage === "plan" ? o : EMPTY);
    groundShadows.current?.set(sunOf(q), shadowsOn(q));
    paint(shown.current);
  }

  // Sky, light, building colour and the haze over the map, for one theme.
  function paint(th: SkyTheme) {
    const tone = toneRef.current;
    const wash = washRef.current;
    if (tone) tone.style.background = rgba(th.tone, th.toneAlpha);
    if (wash) {
      wash.style.background = `linear-gradient(to bottom, ${rgba(th.wash, th.washAlpha)} 0%, ${rgba(th.wash, th.washAlpha * 0.45)} 22%, ${rgba(th.wash, 0)} 50%)`;
    }
    const map = mapRef.current;
    if (!map || !ready.current) return;
    // The hour change eases frame by frame here, so MapLibre's own transitions are off.
    map.setSky({
      "sky-color": th.sky,
      "horizon-color": th.horizon,
      "fog-color": th.fog,
      "sky-horizon-blend": th.skyHorizonBlend,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.8,
      "atmosphere-blend": 0,
      "sky-color-transition": NO_TRANSITION,
      "horizon-color-transition": NO_TRANSITION,
      "sky-horizon-blend-transition": NO_TRANSITION,
      // The validator rejects these transition keys although MapLibre honours them, so skip validation.
    }, { validate: false });
    map.setLight({ ...th.light, "color-transition": NO_TRANSITION, "intensity-transition": NO_TRANSITION, "position-transition": NO_TRANSITION });
    if (map.getLayer("hb-buildings-3d")) {
      const look = buildingLook(th, shadowsShown(props.current));
      map.setPaintProperty("hb-buildings-3d", "fill-extrusion-color", look["fill-extrusion-color"]);
      map.setPaintProperty("hb-buildings-3d", "fill-extrusion-opacity", look["fill-extrusion-opacity"]);
    }
  }

  function install(map: maplibregl.Map, dark: boolean) {
    const layers = map.getStyle().layers ?? [];
    // The basemap's flat or generic 3D buildings would draw under ours; hide them.
    for (const l of layers) {
      if ("source-layer" in l && l["source-layer"] === "building") map.setLayoutProperty(l.id, "visibility", "none");
    }
    const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
    // One tile set for every area: the map fetches only the tiles in view, by range request.
    if (!map.getSource(BUILDINGS_SOURCE)) map.addSource(BUILDINGS_SOURCE, { type: "vector", url: tilesUrl(props.current.buildingTiles, "buildings.pmtiles") });
    if (!map.getSource(TREES_SOURCE)) map.addSource(TREES_SOURCE, { type: "vector", url: tilesUrl(props.current.treeTiles, "trees.pmtiles") });
    for (const id of ["hb-pilot", "hb-alt", "hb-sel", "hb-sel-full", "hb-hl"]) {
      if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY });
    }
    map.addLayer(
      {
        id: "hb-buildings-3d",
        type: "fill-extrusion",
        source: BUILDINGS_SOURCE,
        "source-layer": "buildings",
        // Footprints without a height are left out rather than drawn at a guessed height.
        filter: ["to-boolean", ["get", "height_m"]],
        paint: {
          ...buildingLook(shown.current, shadowsShown(props.current)),
          "fill-extrusion-height": ["get", "height_m"],
          "fill-extrusion-base": ["coalesce", ["get", "min_height_m"], 0],
          "fill-extrusion-vertical-gradient": true,
          "fill-extrusion-color-transition": NO_TRANSITION,
        },
      },
      firstSymbol,
    );
    // MapLibre loads a source's tiles only for a layer that uses it. The crowns show only as shadows, so this
    // layer matches no crown: no crown has a negative radius. The shadows read the crowns from the loaded tiles.
    map.addLayer(
      { id: "hb-trees-load", type: "circle", source: TREES_SOURCE, "source-layer": "trees", filter: ["<", ["get", "r_m"], 0], paint: { "circle-radius": 0 } },
      "hb-buildings-3d",
    );
    groundShadows.current?.install("hb-buildings-3d");
    map.addLayer(
      {
        id: "hb-pilot-line",
        type: "line",
        source: "hb-pilot",
        // Solid, so it does not read as a basemap path or as the dashed lines of unchecked paths.
        paint: { "line-color": COLORS.blue, "line-opacity": 0.8, "line-width": 2.5 },
      },
      firstSymbol,
    );
    if (dark) nightLabels(map, layers);
    const round = { "line-join": "round", "line-cap": "round" } as const;
    // Alternate routes sit 3 px to one side, so a shared stretch shows both lines.
    const off = { "line-offset": 3 } as const;
    map.addLayer({ id: "hb-alt-casing", type: "line", source: "hb-alt", layout: round, paint: { "line-color": "#ffffff", "line-width": zw(11), "line-opacity": 0.95, ...off } });
    map.addLayer({
      id: "hb-alt",
      type: "line",
      source: "hb-alt",
      layout: round,
      filter: ["!=", ["get", "kind"], "unchecked"],
      paint: { "line-color": dark ? "#94A3B8" : COLORS.alt, "line-width": zw(7), ...off },
    });
    map.addLayer({
      id: "hb-alt-dash",
      type: "line",
      source: "hb-alt",
      filter: ["==", ["get", "kind"], "unchecked"],
      paint: { "line-color": dark ? "#94A3B8" : COLORS.alt, "line-width": zw(6), "line-dasharray": [1, 1.4], ...off },
    });
    map.addLayer({ id: "hb-sel-casing", type: "line", source: "hb-sel-full", layout: round, paint: { "line-color": "#ffffff", "line-width": zw(13) } });
    map.addLayer({
      id: "hb-sel",
      type: "line",
      source: "hb-sel",
      layout: round,
      filter: ["!=", ["get", "kind"], "unchecked"],
      paint: { "line-color": ["get", "color"], "line-width": zw(8) },
    });
    map.addLayer({
      id: "hb-sel-dash",
      type: "line",
      source: "hb-sel",
      filter: ["==", ["get", "kind"], "unchecked"],
      paint: { "line-color": ["get", "color"], "line-width": zw(7), "line-dasharray": [1, 1.2] },
    });
    // A stretch picked on the route ribbon: a wide halo with the stretch's colour on top.
    map.addLayer({ id: "hb-hl-halo", type: "line", source: "hb-hl", layout: round, paint: { "line-color": COLORS.ink, "line-width": zw(17), "line-opacity": 0.85 } });
    map.addLayer({ id: "hb-hl-line", type: "line", source: "hb-hl", layout: round, paint: { "line-color": ["get", "color"], "line-width": zw(10) } });
  }

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    let map: maplibregl.Map;
    const url = props.current.theme.dark ? STYLE_NIGHT : STYLE_DAY;
    try {
      addPmtilesProtocol();
      map = new (mapLibre().Map)({
        container: box.current,
        style: url,
        ...LANDING,
        attributionControl: false,
        maxPitch: 76,
        minZoom: 12,
        maxZoom: 19.5,
      });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "The map could not start.");
      announceReady();
      return;
    }
    styleUrl.current = url;
    mapRef.current = map;
    groundShadows.current = new GroundShadows(map, prefersReducedMotion() ? 0 : FADE_MS);
    if (import.meta.env.DEV) Object.assign(window, { __hbMap: map, __hbShadows: groundShadows.current });
    // A tile event with the source fully loaded: the buildings for the view are in. The first event after the
    // TileJSON loads can report "loaded" before any tile is asked for, so it does not count.
    map.on("sourcedata", (e) => {
      if (e.sourceId === BUILDINGS_SOURCE && e.tile && e.isSourceLoaded) props.current.onBuildings();
    });
    // The basemap asks for sprite icons it does not ship; a transparent pixel keeps the console clean.
    map.on("styleimagemissing", (e) => {
      if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    // The poster can go once the basemap under the landing view has drawn. The first idle also waits for
    // the building tiles, later on a phone; the "Loading 3D buildings..." note covers that wait.
    let basemap: string[] = [];
    const onRender = () => {
      if (!basemap.length || !basemap.every((id) => map.getSource(id) && map.isSourceLoaded(id))) return;
      map.off("render", onRender);
      announceReady();
    };
    map.on("render", onRender);
    map.on("style.load", () => {
      ready.current = true;
      guardNumericFilters(map);
      basemap = Object.keys(map.getStyle().sources ?? {});
      install(map, styleUrl.current === STYLE_NIGHT);
      sync();
      setStyleTick((t) => t + 1);
    });
    // Tests and the screenshot script wait for data-idle="1" before capturing.
    const el = box.current;
    // MapLibre logs every failed tile fetch with console.error. A dropped basemap or 3D tile on a weak phone
    // signal is routine: the map retries on the next move, and routing does not use these tiles.
    map.on("error", (e) => {
      // An error before any style loaded that names no source is the basemap style itself failing.
      if (!ready.current && !fallback.current && !(e as { sourceId?: string }).sourceId) {
        console.warn("basemap style failed, so the map uses a plain ground:", e.error?.message ?? e);
        fallback.current = true;
        styleUrl.current = FALLBACK_STYLE;
        el.dataset.basemap = "fallback";
        map.setStyle(fallbackStyle(props.current.theme.dark), { diff: false });
        return;
      }
      const msg = e.error?.message ?? "";
      if (/Failed to fetch|NetworkError|Load failed|AbortError/i.test(msg)) console.warn("map tile:", msg);
      else console.error(e.error ?? e);
    });
    map.on("load", () => {
      shownOnce.current.loaded = true;
      props.current.onLoaded();
      if (props.current.stage !== "landing") announceReady();
    });
    map.on("idle", () => {
      if (map.loaded()) el.dataset.idle = "1";
      announceReady();
    });
    map.on("movestart", (e) => {
      el.dataset.idle = "0";
      if ((e as { originalEvent?: Event }).originalEvent && shownOnce.current.loaded) announceReady();
    });
    map.on("dataloading", () => (el.dataset.idle = "0"));
    let raf = 0;
    map.on("move", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick((t) => t + 1);
        props.current.onBearing(map.getBearing());
      });
    });
    map.on("click", (e) => {
      const ids = ["hb-alt", "hb-alt-dash"].filter((id) => map.getLayer(id));
      const hits = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
      const idx = hits[0]?.properties?.idx;
      if (typeof idx === "number") props.current.onSelect(idx);
      else props.current.onMapClick(e.lngLat.lng, e.lngLat.lat);
    });
    map.on("pitchend", (e) => {
      if ((e as { originalEvent?: Event }).originalEvent && props.current.stage === "plan") planPitch.current = map.getPitch();
    });
    map.on("mousemove", (e) => {
      const ids = ["hb-alt", "hb-alt-dash"].filter((id) => map.getLayer(id));
      const hit = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }).length > 0 : false;
      map.getCanvas().style.cursor = hit || props.current.stage === "plan" ? "pointer" : "";
    });
    return () => {
      groundShadows.current?.remove();
      groundShadows.current = null;
      map.remove();
      mapRef.current = null;
      ready.current = false;
    };
  }, []);

  // Switch between the light and dark basemap. Only night uses the dark one.
  useEffect(() => {
    const map = mapRef.current;
    if (map && fallback.current) {
      if (map.getLayer("hb-ground")) map.setPaintProperty("hb-ground", "background-color", p.theme.dark ? FALLBACK_GROUND.night : FALLBACK_GROUND.day);
      return;
    }
    const url = p.theme.dark ? STYLE_NIGHT : STYLE_DAY;
    if (!map || styleUrl.current === url) return;
    styleUrl.current = url;
    ready.current = false;
    groundShadows.current?.uninstall();
    map.setStyle(url, { diff: false });
  }, [p.theme.dark]);

  // Runs before sync below, so a new route never shows in full for a frame before it draws in.
  // A newly selected route draws itself from start to end, then holds.
  useEffect(() => {
    if (!routeData.key || prefersReducedMotion()) {
      drawn.current = 1;
      syncSelected();
      return;
    }
    drawn.current = 0;
    syncSelected();
    const stop = animate(DRAW_MS, (t) => {
      drawn.current = 1 - (1 - t) * (1 - t);
      syncSelected();
    });
    return () => {
      stop();
      drawn.current = 1;
    };
  }, [routeData.key]);

  useEffect(sync, [routeData, outline, p.stage]);
  // A new hour or the Shadows switch: redraw the ground shadows.
  useEffect(() => groundShadows.current?.set(sun, shadows), [sun?.[0], sun?.[1], shadows]);
  useEffect(syncSelected, [p.highlight]);

  // A new hour: the sky, light and buildings ease to its theme.
  useEffect(() => {
    const from = shown.current;
    const to = p.theme;
    if (from === to || prefersReducedMotion() || !ready.current) {
      shown.current = to;
      paint(to);
      return;
    }
    return animate(FADE_MS, (t) => {
      shown.current = mixTheme(from, to, t * t * (3 - 2 * t));
      paint(shown.current);
    });
  }, [p.theme]);
  useEffect(() => paint(shown.current), [shadowsVisible, styleTick]);

  // Start and end pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const key of ["from", "to"] as const) {
      const ep = p[key];
      const existing = markers.current[key];
      if (!ep) {
        existing?.remove();
        markers.current[key] = undefined;
        continue;
      }
      if (existing) {
        existing.setLngLat([ep.lon, ep.lat]);
        continue;
      }
      const el = document.createElement("div");
      el.className = key === "from" ? "hb-pin-start" : "hb-pin-end";
      el.setAttribute("aria-label", key === "from" ? "Start" : "End");
      markers.current[key] = new (mapLibre().Marker)({ element: el, anchor: key === "from" ? "center" : "bottom" })
        .setLngLat([ep.lon, ep.lat])
        .addTo(map);
      // MapLibre marks markers as buttons, but these pins do nothing on a tap and take no focus.
      el.setAttribute("role", "img");
    }
  }, [p.from, p.to]);

  // Camera: frame new routes, and frame them again when the panels change size.
  // The short delay lets the panel finish its layout before the fit reads the insets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !p.fitKey || !p.routes.length || p.stage !== "plan" || p.focus) return;
    const t = setTimeout(() => {
      const b = new (mapLibre().LngLatBounds)();
      for (const d of props.current.routes) for (const c of d.route.coords) b.extend(c);
      if (b.isEmpty()) return;
      map.fitBounds(b, { padding: 28, maxZoom: 17.4, pitch: planPitch.current, bearing: map.getBearing(), duration: 700 });
    }, 120);
    return () => clearTimeout(t);
  }, [p.fitKey, p.insets.top, p.insets.bottom, p.insets.left, p.focus]);

  // Camera: go to a picked destination before routes exist.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || p.stage !== "plan" || p.routes.length) return;
    const ep = p.to ?? p.from;
    // No point yet: pull back so the outline of the covered area is in view.
    if (!ep) map.easeTo({ center: CBD_CENTER, zoom: 15.1, pitch: planPitch.current, bearing: -18, duration: 900 });
    else map.easeTo({ center: [ep.lon, ep.lat], zoom: 16.4, pitch: planPitch.current, duration: 900 });
  }, [p.to, p.from, p.stage]);

  // Camera: follow a step in navigate mode, or a tapped step.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !p.focus) return;
    moveToFocus(map, p.focus, p.stage, p.insets, planPitch.current);
  }, [p.focus]);

  // Leaving the landing view moves the camera, so the poster of that view has to go.
  useEffect(() => {
    if (p.stage !== "landing" && shownOnce.current.loaded) announceReady();
  }, [p.stage]);

  // Camera: back to the landing view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || p.stage !== "landing") return;
    map.easeTo({ ...LANDING, duration: 800 });
  }, [p.stage]);

  // The map keeps the panel insets as its own padding, so centring and fitting use the visible area.
  // fitBounds subtracts this padding and its own, so the fit passes only a small margin.
  // An instant setPadding would cancel a running move to a step, so with a focus the padding rides on that move.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.resize();
    if (props.current.focus) moveToFocus(map, props.current.focus, props.current.stage, p.insets, planPitch.current);
    else map.setPadding(p.insets);
  }, [p.insets.top, p.insets.bottom, p.insets.left, p.insets.right]);

  const candidates = useMemo(() => anchorCandidates(p.routes.map((d) => d.route.coords)), [p.routes]);

  const bubbles = useMemo(() => {
    const map = mapRef.current;
    if (!map || !p.showCallouts || !p.routes.length) return [];
    const c = map.getContainer();
    const W = c.clientWidth;
    const H = c.clientHeight;
    const safe: Rect = {
      left: Math.max(8, p.insets.left - 12),
      top: Math.max(8, p.insets.top - 12),
      right: W - Math.max(8, p.insets.right - 12),
      bottom: H - Math.max(8, p.insets.bottom - 12),
    };
    const anchors = candidates.map((list) => {
      for (const ll of list) {
        const pt = map.project(ll);
        if (pt.x > safe.left + 4 && pt.x < safe.right - 4 && pt.y > safe.top + 4 && pt.y < safe.bottom - 4) return { x: pt.x, y: pt.y };
      }
      return null;
    });
    const order = p.routes.map((_, i) => i).sort((a, b) => (a === p.selected ? -1 : b === p.selected ? 1 : a - b));
    // Keep bubbles off the start and end pins (end pin is 28 x 36, anchored at its tip).
    const pins: Rect[] = [];
    for (const ep of [p.from, p.to]) {
      if (!ep) continue;
      const q = map.project([ep.lon, ep.lat]);
      pins.push(ep === p.to ? { left: q.x - 16, top: q.y - 38, right: q.x + 16, bottom: q.y + 2 } : { left: q.x - 11, top: q.y - 11, right: q.x + 11, bottom: q.y + 11 });
    }
    const rects = placeBubbles(anchors, safe, BUBBLE_W, BUBBLE_H, order, pins);
    return p.routes.map((d, i) => ({ d, i, a: anchors[i], r: rects[i] }));
  }, [tick, styleTick, candidates, p.routes, p.selected, p.showCallouts, p.insets, p.from, p.to]);

  const Icon = p.nightState ? MoonIcon : p.mode === "shade" ? SunIcon : UmbrellaIcon;

  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" data-testid="map" />
      <div ref={toneRef} className="pointer-events-none absolute inset-0 mix-blend-multiply" aria-hidden="true" data-testid="map-tone" />
      <div ref={washRef} className="pointer-events-none absolute inset-0" aria-hidden="true" />
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-slate-100 p-6 text-center text-sm text-slate-600" data-testid="map-failed">
          This browser could not start the map, which needs WebGL. Try another browser.
        </div>
      )}
      {bubbles.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {bubbles.map(({ a, r, i }) =>
            a && r ? (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={nearestOnRect(a, r).x}
                y2={nearestOnRect(a, r).y}
                stroke={i === p.selected ? COLORS.blue : "#ffffff"}
                strokeWidth={1.5}
              />
            ) : null,
          )}
          {bubbles.map(({ a, i }) =>
            a ? <circle key={`c${i}`} cx={a.x} cy={a.y} r={3} fill={i === p.selected ? COLORS.blue : "#64748B"} stroke="#fff" strokeWidth={1.5} /> : null,
          )}
        </svg>
      )}
      {[...bubbles]
        .sort((x, y) => (x.i === p.selected ? 1 : y.i === p.selected ? -1 : 0))
        .map(({ d, i, r }) =>
          r ? (
            <button
              key={d.key}
              type="button"
              data-testid="route-callout"
              aria-pressed={i === p.selected}
              onClick={() => p.onSelect(i)}
              className={`absolute flex flex-col justify-center rounded-xl px-3 text-left shadow-card transition-colors ${
                i === p.selected ? "bg-brand text-white" : "bg-white text-ink hover:bg-slate-50"
              }`}
              // A transform moves the bubble without a layout shift as the camera or the hour changes.
              style={{ left: 0, top: 0, transform: `translate(${r.left}px, ${r.top}px)`, width: BUBBLE_W, height: BUBBLE_H }}
            >
              <span className="flex items-center gap-1 text-[13px] font-semibold leading-tight">
                <Icon size={13} />
                {d.pct}% {d.pctWord}
              </span>
              <span className={`truncate text-[12px] leading-tight ${i === p.selected ? "text-white" : "text-slate-600"}`}>{d.short}</span>
            </button>
          ) : null,
        )}
    </div>
  );
}

// Building colour follows the light. With ground shadows on, towers stay opaque so the shadows read between them.
function buildingLook(th: SkyTheme, shadows: boolean) {
  return { "fill-extrusion-color": th.building, "fill-extrusion-opacity": th.dark ? 0.9 : shadows ? 1 : 0.9 };
}

// Basemap filters compare fields such as rank or ref_length with numbers. A tile feature without the
// field makes MapLibre log "Expected value to be of type number, but found null". Checking ["has", field]
// first drops the same features without the warning.
function guardNumericFilters(map: maplibregl.Map) {
  const guard = (e: unknown): unknown => {
    if (!Array.isArray(e)) return e;
    const [op, a] = e;
    if (["<", "<=", ">", ">="].includes(op as string) && Array.isArray(a) && a[0] === "get" && typeof a[1] === "string" && a.length === 2) {
      return ["all", ["has", a[1]], e];
    }
    return e.map(guard);
  };
  for (const l of map.getStyle().layers ?? []) {
    if (!("filter" in l) || !l.filter || l.id.startsWith("hb-")) continue;
    const next = guard(l.filter);
    if (JSON.stringify(next) !== JSON.stringify(l.filter)) map.setFilter(l.id, next as maplibregl.FilterSpecification);
  }
}

// The first share of the selected route: whole segments up to the cut, and the cut segment trimmed.
function partRoute(sel: GeoJSON.FeatureCollection, full: GeoJSON.FeatureCollection, share: number): [GeoJSON.FeatureCollection, GeoJSON.FeatureCollection] {
  const coordsOf = (f: GeoJSON.Feature) => (f.geometry as GeoJSON.LineString).coordinates as [number, number][];
  const fullCoords = full.features[0] ? coordsOf(full.features[0]) : [];
  let left = lengthM(fullCoords) * share;
  const features: GeoJSON.Feature[] = [];
  for (const f of sel.features) {
    if (left <= 0) break;
    const c = coordsOf(f);
    const m = lengthM(c);
    features.push(m <= left ? f : { ...f, geometry: { type: "LineString", coordinates: sliceAlong(c, left) } });
    left -= m;
  }
  const fullPart = full.features[0] ? [{ ...full.features[0], geometry: { type: "LineString", coordinates: sliceAlong(fullCoords, lengthM(fullCoords) * share) } } as GeoJSON.Feature] : [];
  return [
    { type: "FeatureCollection", features },
    { type: "FeatureCollection", features: fullPart },
  ];
}

function moveToFocus(map: maplibregl.Map, f: Focus, stage: Props["stage"], insets: Insets, planPitch: number) {
  map.easeTo({
    center: f.at,
    zoom: f.zoom,
    pitch: stage === "navigate" ? 60 : planPitch,
    bearing: f.bearing ?? map.getBearing(),
    padding: insets,
    duration: 900,
  });
}

// Line width that grows with zoom, so routes stay readable in navigate mode.
function zw(w: number): maplibregl.ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], 14, w * 0.6, 16, w, 18.5, w * 1.8];
}
