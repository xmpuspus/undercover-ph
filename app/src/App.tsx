import { Component, Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CBD_CENTER, DATA_BASE, NIGHT_ALT_DEG, SUGGESTED } from "./config";
import type { Advisory, Endpoint, Mode, Place, Result, Route, ShadowOverlay, Weather } from "./types";
import { MAX_SNAP_M, findRoutes, loadData, searchPlaces, snapToNode, type Data } from "./lib/routerClient";
import { BUILDINGS_URL, exists, loadAdvisory, loadWeather } from "./lib/data";
import { clockPinned, dateLabel, dateShort, fmtDist, fmtMinute, manilaNow, type Clock } from "./lib/time";
import { toDisplay } from "./lib/display";
import type { Focus, Insets } from "./components/MapView";
import Landing from "./components/Landing";
import { AdvisoryBar, Footer, TopBanner } from "./components/Chrome";
import { DestinationSearch, ModeSwitch, TripFields } from "./components/Planner";
import { TimeChips, WeatherChips } from "./components/TimeChips";
import { ProfileToggles, RouteCard, StateMessage, type Highlight } from "./components/RouteCard";
import SunChip from "./components/SunChip";
import { compass16, sunDay, sunPosition, type SunView } from "./lib/sun";
import { rgba, skyTheme, type SkyTheme } from "./lib/skyTheme";
import { eagerMap, loadMapLibre, prefetchMapLibre } from "./lib/maplibre";
import { useReducedMotion } from "./lib/motion";
import { PauseIcon, PlayIcon } from "./components/Icons";
import { nowLabel, nowSlot } from "./lib/nowSlot";
import { buildSearch, decodeEndpoint, encodeEndpoint, hhmmToMinute, minuteToHHMM, parseTrip, type TripParams } from "./lib/tripUrl";

// The first screen needs only the landing card. The map, steps, navigation, About and rain load as separate chunks.
const MapView = lazy(() => loadMapLibre().then(() => import("./components/MapView")));
const StepsList = lazy(() => import("./components/Steps").then((m) => ({ default: m.StepsList })));
const TurnCard = lazy(() => import("./components/Navigate").then((m) => ({ default: m.TurnCard })));
const NavSheet = lazy(() => import("./components/Navigate").then((m) => ({ default: m.NavSheet })));
const About = lazy(() => import("./components/About"));
const RainLayer = lazy(() => import("./components/RainLayer"));

type Stage = "landing" | "plan" | "navigate";
type Field = "from" | "to";
type Screen = "landing" | "dest" | "trip" | "results" | "steps" | "navigate";

// What each browser history entry remembers, so Back and Forward put the screen back as it was.
interface Snapshot {
  screen: Screen;
  stage: Stage;
  active: Field | null;
  showSteps: boolean;
  from: Endpoint | null;
  to: Endpoint | null;
  // Position in the app's own history, 0 for the first entry. In-app Back uses it to know when to go back a step.
  i: number;
}
const historyIndex = () => (window.history.state as Snapshot | null)?.i ?? 0;

function useHeight(el: HTMLElement | null): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!el) {
      setH(0);
      return;
    }
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    setH(el.offsetHeight);
    return () => ro.disconnect();
  }, [el]);
  return h;
}

function useViewport(): { w: number; h: number } {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return v;
}

// The Manila wall clock, checked every 15 seconds. A `?now=` override stays pinned.
function useManilaClock(): Clock {
  const [clock, setClock] = useState(manilaNow);
  useEffect(() => {
    if (clockPinned()) return;
    const t = setInterval(() => {
      const n = manilaNow();
      setClock((c) => (c.date === n.date && c.minute === n.minute ? c : n));
    }, 15_000);
    return () => clearInterval(t);
  }, []);
  return clock;
}

function bearing(a: [number, number], b: [number, number]): number {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI;
}

export default function App() {
  const clock = useManilaClock();
  const [data, setData] = useState<Data | null>(null);
  // Route data (about 4 MB) loads on the first sign of intent: hovering, focusing or tapping a route type.
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [buildingsLoading, setBuildingsLoading] = useState(true);

  // A link with a start or end in its query opens straight on that trip, once the places have loaded.
  const [initialTrip] = useState<TripParams | null>(() => {
    const t = parseTrip(window.location.search);
    return t.start || t.end ? t : null;
  });
  const [restoring, setRestoring] = useState(!!initialTrip);
  const [stage, setStage] = useState<Stage>(initialTrip ? "plan" : "landing");
  const [mode, setMode] = useState<Mode>(initialTrip?.mode ?? "shade");
  const [from, setFrom] = useState<Endpoint | null>(null);
  const [to, setTo] = useState<Endpoint | null>(null);
  const [active, setActive] = useState<Field | null>(null);
  const [query, setQuery] = useState("");
  const [dateIdx, setDateIdx] = useState(0);
  const [bucketIdx, setBucketIdx] = useState(0);
  const [stepFree, setStepFree] = useState(initialTrip?.stepFree ?? false);
  const [includeUnchecked, setIncludeUnchecked] = useState(false);
  const [pickedLabel, setPickedLabel] = useState<Route["label"] | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [navIdx, setNavIdx] = useState(0);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [about, setAbout] = useState(false);
  const [banner, setBanner] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [shadowsReady, setShadowsReady] = useState(false);
  const [shadowsOn, setShadowsOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [mapBearing, setMapBearing] = useState(0);
  // A stretch picked on the route ribbon, lit up on the map.
  const [highlight, setHighlight] = useState<Highlight>(null);
  // The 3D map starts on the first input (or at once with ?now= or ?map=eager). Until it is ready, a poster
  // of the same view stands in, so the first screen costs no map work.
  const [mapOn, setMapOn] = useState(eagerMap || !!initialTrip);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapTry, setMapTry] = useState(0);
  const [picking, setPicking] = useState<Mode | null>(null);
  // Set while "Now" is the chosen time: the real clock minute is the departure, and the slot holds the shade data.
  const [nowAt, setNowAt] = useState<{ minute: number; dateIdx: number; bucketIdx: number } | null>(null);
  const [nowNote, setNowNote] = useState<{ text: string; dateIdx: number; bucketIdx: number } | null>(null);

  useEffect(() => {
    const prefetch = () => prefetchMapLibre();
    if (document.readyState === "complete") prefetch();
    else window.addEventListener("load", prefetch, { once: true });
    if (mapOn) return () => window.removeEventListener("load", prefetch);
    const start = () => setMapOn(true);
    const events = ["pointermove", "pointerdown", "touchstart", "keydown", "focusin", "wheel"] as const;
    for (const e of events) window.addEventListener(e, start, { once: true, passive: true });
    return () => {
      window.removeEventListener("load", prefetch);
      for (const e of events) window.removeEventListener(e, start);
    };
  }, [mapOn]);

  useEffect(() => {
    loadWeather().then(setWeather);
    loadAdvisory().then(setAdvisory);
    exists("READY.shadows").then(setShadowsReady);
  }, []);

  useEffect(() => {
    if (!picking) return;
    const go = () => {
      setPicking(null);
      setStage("plan");
    };
    if (mapLoaded) return go();
    const t = setTimeout(go, 1500);
    return () => clearTimeout(t);
  }, [picking, mapLoaded]);

  const pickMode = (m: Mode) => {
    ensureData();
    setMapOn(true);
    setMode(m);
    // Give the map a moment to start so the next view opens over it, not over the poster.
    if (mapLoaded) setStage("plan");
    else setPicking(m);
  };
  // A tap on the static landing shell in index.html, made before this app started.
  useEffect(() => {
    const w = window as unknown as { __shellPick?: Mode };
    const m = w.__shellPick;
    delete w.__shellPick;
    if (m === "shade" || m === "rain") pickMode(m);
  }, []);

  const loading = useRef(false);
  const ensureData = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    setStatus("loading");
    setLoadError(null);
    loadData(DATA_BASE)
      .then((d) => {
        setData(d);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        loading.current = false;
        setStatus("error");
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const manifest = data?.manifest ?? null;

  // Dates and times on offer: only manifest dates, and only times still ahead today.
  const futureDates = useMemo(() => {
    if (!manifest) return [];
    const last = manifest.buckets_min[manifest.buckets_min.length - 1] ?? 0;
    return manifest.dates
      .map((date, idx) => ({ date, idx }))
      .filter((d) => d.date > clock.date || (d.date === clock.date && last >= clock.minute));
  }, [manifest, clock]);
  const datesPassed = !!manifest && futureDates.length === 0;
  const dateOpts = useMemo(
    () => (datesPassed && manifest ? manifest.dates.map((date, idx) => ({ date, idx })) : futureDates),
    [datesPassed, manifest, futureDates],
  );
  const date = manifest?.dates[dateIdx] ?? "";
  const bucketsFor = useCallback(
    (d: string) => {
      if (!manifest) return [];
      return manifest.buckets_min
        .map((min, idx) => ({ min, idx, night: (manifest.sun?.[d]?.[idx]?.[0] ?? 90) <= NIGHT_ALT_DEG }))
        .filter((b) => d !== clock.date || b.min >= clock.minute);
    },
    [manifest, clock],
  );
  const bucketOpts = useMemo(() => bucketsFor(date), [bucketsFor, date]);

  // Hour scrubber: step through the day's daylight slots every 700 ms. Any tap outside the button stops it.
  const bucketRef = useRef(bucketIdx);
  bucketRef.current = bucketIdx;
  const daySlots = useMemo(() => bucketOpts.filter((b) => !b.night), [bucketOpts]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const i = daySlots.findIndex((b) => b.idx === bucketRef.current);
      const next = daySlots[i + 1];
      if (next) setBucketIdx(next.idx);
      else setPlaying(false);
    }, 700);
    const stop = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-scrubber]")) setPlaying(false);
    };
    document.addEventListener("pointerdown", stop, true);
    return () => {
      clearInterval(t);
      document.removeEventListener("pointerdown", stop, true);
    };
  }, [playing, daySlots]);
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (!daySlots.length) return;
    // Fetch the day's shadow images up front (about 170 KB each), so the overlay keeps pace with the scrubber.
    for (const b of daySlots) {
      const url = shadowUrl(date, b.min);
      if (url) new Image().src = url;
    }
    const i = daySlots.findIndex((b) => b.idx === bucketIdx);
    if (i < 0 || i >= daySlots.length - 1) setBucketIdx(daySlots[0].idx);
    setPlaying(true);
  };

  // "Now" departs at the real clock minute and uses the first shade slot at or after it. After the last slot of
  // the day it uses that slot when it is night, so an evening walk is never shown as tomorrow morning. When today
  // has no fitting slot, Now stays unpressed and a note says which later slot the route uses.
  const applyNow = useCallback(() => {
    if (!manifest || !dateOpts.length) return;
    setPlaying(false);
    const todayIdx = manifest.dates.indexOf(clock.date);
    const slot = todayIdx >= 0 ? nowSlot(manifest.buckets_min, manifest.sun?.[clock.date]?.map((r) => r?.[0]), clock.minute, NIGHT_ALT_DEG) : null;
    if (slot) {
      setDateIdx(todayIdx);
      setBucketIdx(slot.bucketIdx);
      setNowAt({ minute: clock.minute, dateIdx: todayIdx, bucketIdx: slot.bucketIdx });
      return;
    }
    setNowAt(null);
    const last = manifest.buckets_min[manifest.buckets_min.length - 1];
    const lead = todayIdx >= 0 ? `Shade data ends at ${fmtMinute(last, true)} and has no night slot.` : "There is no shade data for today.";
    for (const d of dateOpts) {
      const day = bucketsFor(d.date).find((b) => !b.night);
      if (!day) continue;
      setDateIdx(d.idx);
      setBucketIdx(day.idx);
      setNowNote({ text: `${lead} The route uses the first daylight slot, ${dateLabel(d.date, clock.date)} ${fmtMinute(day.min, true)}.`, dateIdx: d.idx, bucketIdx: day.idx });
      return;
    }
    const first = dateOpts[0];
    setDateIdx(first.idx);
    setBucketIdx(bucketsFor(first.date)[0]?.idx ?? 0);
  }, [manifest, dateOpts, bucketsFor, clock]);
  const goNow = applyNow;
  const isNow = !!nowAt && nowAt.dateIdx === dateIdx && nowAt.bucketIdx === bucketIdx;
  const shownNote = nowNote && nowNote.dateIdx === dateIdx && nowNote.bucketIdx === bucketIdx ? nowNote.text : null;

  const pickDate = (idx: number) => {
    setDateIdx(idx);
    const opts = bucketsFor(manifest?.dates[idx] ?? "");
    if (!opts.some((b) => b.idx === bucketIdx)) setBucketIdx((opts.find((b) => !b.night) ?? opts[0])?.idx ?? 0);
  };

  const minute = manifest?.buckets_min[bucketIdx] ?? 0;
  // Opening hours and walking time use the real departure minute; shade uses the slot.
  const departMin = isNow && nowAt ? nowAt.minute : minute;
  const sun = (manifest?.sun?.[date]?.[bucketIdx] ?? null) as [number, number] | null;
  // The router's night: at 3 degrees or lower, shade does not apply. Shadows and UV hide.
  const dark = sun ? sun[0] <= NIGHT_ALT_DEG : false;
  // The look of the map follows the sun: the live Manila sun on the landing page, the chosen hour's sun after that.
  const liveSun = useMemo(() => sunPosition(clock.date, clock.minute, CBD_CENTER[0], CBD_CENTER[1]), [clock]);
  const [themeAlt, themeAz] = stage === "landing" || !sun ? liveSun : sun;
  const theme = useMemo(() => skyTheme(themeAlt, themeAz), [themeAlt, themeAz]);

  // Ground shadow PNGs. Hidden until READY.shadows exists; a slot missing from the list means no overlay.
  const overlayDef = (manifest as { shadow_overlay?: ShadowOverlay } | null)?.shadow_overlay ?? null;
  const shadowUrl = useCallback(
    (d: string, min: number) => {
      if (!shadowsReady || !overlayDef) return null;
      const hhmm = `${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}`;
      if (!overlayDef.buckets[d]?.includes(hhmm)) return null;
      return `${DATA_BASE}${overlayDef.path.replace("{date}", d).replace("{HHMM}", hhmm)}`;
    },
    [shadowsReady, overlayDef],
  );
  const overlayUrl = date ? shadowUrl(date, minute) : null;
  const shadow = useMemo(
    () => (overlayUrl && overlayDef && shadowsOn && !dark ? { url: overlayUrl, coords: overlayDef.coords } : null),
    [overlayUrl, overlayDef, shadowsOn, dark],
  );
  // Fetch only the next slot's image ahead of time; the play button fetches the rest of the day.
  useEffect(() => {
    if (!shadow || !manifest) return;
    const i = manifest.buckets_min.indexOf(minute);
    const next = i >= 0 ? manifest.buckets_min[i + 1] : undefined;
    const url = next !== undefined ? shadowUrl(date, next) : null;
    if (url) new Image().src = url;
  }, [shadow, manifest, minute, date, shadowUrl]);

  // Routing runs in the browser. The router scores each edge at the slot when the walker reaches it.
  // The search runs on a deferred copy of its inputs, so a tap on a place or an hour paints at once and the
  // routes follow; meanwhile the card says it is updating.
  const routeInput = useMemo(
    () => ({ from, to, dateIdx, bucketIdx, mode, stepFree, includeUnchecked, minute: departMin, stage }),
    [from, to, dateIdx, bucketIdx, mode, stepFree, includeUnchecked, departMin, stage],
  );
  const deferred = useDeferredValue(routeInput);
  const routing = deferred !== routeInput;
  const routed = useMemo<{ result: Result | null; error: string | null }>(() => {
    const { from, to, dateIdx, bucketIdx, mode, stepFree, includeUnchecked, minute, stage } = deferred;
    if (!data || !manifest || !from || !to || stage === "landing") return { result: null, error: null };
    if (from.node === to.node) return { result: null, error: "Start and end are the same point. Pick a different start or end." };
    try {
      const result = findRoutes(data, {
        from: from.node,
        to: to.node,
        dateIdx,
        bucketIdx,
        mode,
        stepFree,
        includeUnchecked,
        departMin: minute,
        from_snap_m: from.snap_m ?? undefined,
        to_snap_m: to.snap_m ?? undefined,
      });
      return { result, error: null };
    } catch (e) {
      return { result: null, error: `The router failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, [data, manifest, deferred]);
  const result = routed.result;

  // Label each node with its piece of the routable network. A start or end outside the largest piece
  // usually sits behind a gate or inside a gated village.
  const mainNet = useMemo(() => {
    if (!data) return null;
    const comp = new Int32Array(data.nodeCount).fill(-1);
    const sizes: number[] = [];
    const stack: number[] = [];
    for (let start = 0; start < data.nodeCount; start++) {
      if (comp[start] >= 0 || !data.routableNode[start]) continue;
      const c = sizes.length;
      let size = 0;
      comp[start] = c;
      stack.push(start);
      while (stack.length) {
        const u = stack.pop()!;
        size++;
        for (let k = data.adjOff[u]; k < data.adjOff[u + 1]; k++) {
          const v = data.adjNode[k];
          if (data.edgeRoutable[data.adjEdge[k]] && comp[v] < 0) {
            comp[v] = c;
            stack.push(v);
          }
        }
      }
      sizes.push(size);
    }
    return { comp, main: sizes.indexOf(Math.max(...sizes)) };
  }, [data]);
  const gatedEnd = !!mainNet && !!from && !!to && [from.node, to.node].some((n) => mainNet.comp[n] !== mainNet.main);
  const night = result?.state === "night";
  const routerSun = result?.sun ?? null;
  const sunView: SunView | null = routerSun
    ? { altitude: routerSun.altitude, azimuth: routerSun.azimuth, compass: compass16(routerSun.azimuth), shadySide: routerSun.shadySide || null }
    : sun
      ? { altitude: sun[0], azimuth: sun[1], compass: compass16(sun[1]), shadySide: null }
      : null;
  // The routes on screen belong to the deferred inputs, so they use that mode until the new search lands.
  const routeMode = deferred.mode;
  const display = useMemo(() => (result && (result.state === "ok" || result.state === "night") ? toDisplay(result, routeMode) : []), [result, routeMode]);

  const preselect = useMemo(() => {
    if (!result) return 0;
    const want: Route["label"] = result.recommendedIsShortest ? "shortest" : "recommended";
    return Math.max(0, display.findIndex((d) => d.labels.includes(want)));
  }, [display, result]);
  const pickedIdx = pickedLabel ? display.findIndex((d) => d.labels.includes(pickedLabel)) : -1;
  const selected = pickedIdx >= 0 ? pickedIdx : preselect;
  const current = display[selected] ?? null;
  const view: "dest" | "trip" | "results" | "steps" =
    !to && active !== "from" ? "dest" : active || !from || !to ? "trip" : showSteps ? "steps" : "results";
  const screen: Screen = stage === "landing" ? "landing" : stage === "navigate" ? "navigate" : view;
  // While a start or end is being edited the old route is hidden; the kept end stays as a marker.
  const editing = stage === "plan" && (view === "dest" || view === "trip");
  const mapRoutes = useMemo(
    () => (stage === "landing" || editing ? [] : stage === "navigate" && current ? [current] : display),
    [stage, editing, current, display],
  );

  // Search and suggestions.
  const results = useMemo(() => (data && query.trim() ? searchPlaces(data, query, 8) : []), [data, query]);
  const suggested = useMemo(() => {
    if (!data) return [];
    const taken = new Set([from?.node, to?.node]);
    return SUGGESTED.map((n) => data.places.find((pl) => pl.name.toLowerCase() === n.toLowerCase())).filter(
      (pl): pl is Place => !!pl && !taken.has(pl.node_id),
    );
  }, [data, from, to]);

  const nodeLL = (node: number, fallback: [number, number]): [number, number] => {
    const lon = data?.nodeLon[node];
    const lat = data?.nodeLat[node];
    return lon != null && lat != null && Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : fallback;
  };

  const assign = (field: Field, ep: Endpoint) => {
    setNotice(null);
    setQuery("");
    setPickedLabel(null);
    setShowSteps(false);
    setFocus(null);
    const other = field === "from" ? to : from;
    if (field === "from") setFrom(ep);
    else setTo(ep);
    setActive(other ? null : field === "from" ? "to" : "from");
  };

  const placeEndpoint = (pl: Place): Endpoint => {
    const [lon, lat] = nodeLL(pl.node_id, [pl.lon, pl.lat]);
    return { label: pl.name, sub: pl.category, node: pl.node_id, lon, lat, snap_m: null };
  };

  // A point farther than the router's snap limit is outside the pilot; say so instead of dropping a pin.
  const pointEndpoint = (lon: number, lat: number, label: string): Endpoint | string => {
    const s = data ? snapToNode(data, lon, lat) : null;
    if (!s) return "The walking map is not loaded.";
    if (s.dist_m > MAX_SNAP_M) {
      return `${label === "My location" ? "You are" : "That point is"} ${fmtDist(s.dist_m)} from the nearest mapped path. Routing works only inside the dashed box, the covered area.`;
    }
    const [nlon, nlat] = nodeLL(s.node, [lon, lat]);
    return { label, sub: `${Math.round(s.dist_m)} m from the nearest path`, node: s.node, lon: nlon, lat: nlat, snap_m: s.dist_m };
  };

  const onPick = (pl: Place) => {
    const field: Field = view === "dest" ? "to" : (active ?? (!from ? "from" : "to"));
    assign(field, placeEndpoint(pl));
  };

  const onMapClick = (lon: number, lat: number) => {
    if (stage !== "plan" || view === "results" || view === "steps") return;
    const field: Field = view === "dest" ? "to" : (active ?? (!from ? "from" : "to"));
    const ep = pointEndpoint(lon, lat, "Point on map");
    if (typeof ep === "string") setNotice(ep);
    else assign(field, ep);
  };

  const onLocate = () => {
    if (!("geolocation" in navigator)) {
      setNotice("This browser cannot share a location.");
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const ep = pointEndpoint(pos.coords.longitude, pos.coords.latitude, "My location");
        if (typeof ep === "string") setNotice(ep);
        else assign("from", ep);
      },
      (err) => {
        setLocating(false);
        setNotice(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Pick a place instead." : "Could not get your location. Pick a place instead.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  // Once the places load: restore the trip from the link, or pick Now. The time chosen then stays put as the clock ticks.
  const started = useRef(false);
  useEffect(() => {
    if (initialTrip) ensureData();
  }, []);
  useEffect(() => {
    if (!data || !manifest || started.current) return;
    started.current = true;
    const trip = initialTrip;
    if (!trip) return applyNow();
    const resolve = (token: string | null): Endpoint | null => {
      const ref = decodeEndpoint(token);
      if (!ref) return null;
      if (ref.kind === "point") {
        const ep = pointEndpoint(ref.lon, ref.lat, "Point on map");
        return typeof ep === "string" ? null : ep;
      }
      const pl =
        ref.kind === "node" ? data.places.find((x) => x.node_id === ref.node) : data.places.find((x) => x.name.toLowerCase() === ref.name.toLowerCase());
      return pl ? placeEndpoint(pl) : null;
    };
    const f = resolve(trip.start);
    const t = resolve(trip.end);
    if ((trip.start && !f) || (trip.end && !t)) setNotice("Part of this link did not match a place. Pick it again.");
    setFrom(f);
    setTo(t);
    setActive(f && t ? null : t ? "from" : f ? "to" : null);
    const di = trip.date ? manifest.dates.indexOf(trip.date) : -1;
    const bi = trip.time && trip.time !== "now" ? manifest.buckets_min.indexOf(hhmmToMinute(trip.time)) : -1;
    if (di >= 0 && bi >= 0 && trip.date! >= clock.date) {
      setDateIdx(di);
      setBucketIdx(bi);
    } else applyNow();
    setRestoring(false);
  }, [data, manifest]);
  // If the places never load, drop the restoring card so the retry button shows.
  useEffect(() => {
    if (status === "error") setRestoring(false);
  }, [status]);

  // Every screen is a browser history entry, and the trip is kept in the query with replaceState.
  const tripParams = useMemo<TripParams | null>(() => {
    if (stage === "landing") return null;
    const places = data?.places ?? [];
    const timed = !!manifest && !!(from || to);
    const live = isNow && !!nowAt;
    return {
      start: from ? encodeEndpoint(from, places) : null,
      end: to ? encodeEndpoint(to, places) : null,
      date: timed && !live ? (manifest?.dates[dateIdx] ?? null) : null,
      time: timed ? (live ? "now" : minuteToHHMM(minute)) : null,
      mode,
      stepFree,
    };
  }, [stage, data, manifest, from, to, isNow, nowAt, dateIdx, minute, mode, stepFree]);
  const search = buildSearch(window.location.search, tripParams);
  const lastScreen = useRef<Screen | null>(null);
  useEffect(() => {
    if (restoring) return;
    const { pathname, hash } = window.location;
    const url = `${pathname}${search}${hash}`;
    const prior = window.history.state as Snapshot | null;
    const snap: Snapshot = { screen, stage, active, showSteps, from, to, i: prior?.i ?? 0 };
    if (lastScreen.current === null) {
      lastScreen.current = screen;
      if (prior || screen === "landing") return window.history.replaceState(snap, "", url);
      // A shared link has nothing behind it. Seed a landing entry so Back has somewhere to go.
      const landing: Snapshot = { screen: "landing", stage: "landing", active: null, showSteps: false, from: null, to: null, i: 0 };
      window.history.replaceState(landing, "", `${pathname}${buildSearch(search, null)}${hash}`);
      window.history.pushState({ ...snap, i: 1 }, "", url);
    } else if (screen !== lastScreen.current) {
      lastScreen.current = screen;
      window.history.pushState({ ...snap, i: snap.i + 1 }, "", url);
    } else {
      window.history.replaceState(snap, "", url);
    }
  }, [restoring, screen, stage, active, showSteps, from, to, search]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const s = e.state as Snapshot | null;
      if (!s?.screen || restoring) return;
      lastScreen.current = s.screen;
      setPlaying(false);
      setPicking(null);
      setNotice(null);
      setQuery("");
      setFocus(null);
      setStage(s.stage);
      setActive(s.active);
      setShowSteps(s.showSteps);
      if (s.screen === "dest") {
        setFrom(null);
        setTo(null);
      } else if (s.screen !== "landing") {
        // A step back to the trip fields keeps the start and end already picked.
        setFrom((f) => s.from ?? f);
        setTo((t) => s.to ?? t);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [restoring]);

  // Dialogs and sheets hand focus back to the control that opened them.
  const aboutOpener = useRef<HTMLElement | null>(null);
  const openAbout = () => {
    aboutOpener.current = document.activeElement as HTMLElement | null;
    setAbout(true);
  };
  const closeAbout = () => {
    setAbout(false);
    aboutOpener.current?.focus();
  };
  // Focus moves after React has drawn the view that holds the target.
  const focusNext = useRef<string | null>(null);
  const refocus = (testid: string) => {
    focusNext.current = testid;
  };
  useEffect(() => {
    const id = focusNext.current;
    const el = id ? document.querySelector<HTMLElement>(`[data-testid="${id}"]`) : null;
    if (!el) return;
    focusNext.current = null;
    el.focus();
  });
  const endNavigate = () => {
    refocus("navigate");
    // Each stage is a history entry, so leaving navigation steps back one entry, as the browser Back button does.
    if (historyIndex() > 0) return window.history.back();
    setStage("plan");
    setShowSteps(false);
    setFocus(null);
  };
  useEffect(() => {
    if (stage !== "navigate") return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !about) endNavigate();
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  });

  const startNavigate = () => {
    setStage("navigate");
    setNavIdx(0);
    setShowSteps(false);
  };

  // In navigate mode the map follows the current step, facing the next one.
  useEffect(() => {
    if (stage !== "navigate" || !current) return;
    const steps = current.route.steps;
    const s = steps[navIdx];
    if (!s) {
      const c = current.route.coords;
      if (c.length) setFocus({ at: c[0], bearing: c.length > 1 ? bearing(c[0], c[1]) : null, zoom: 17.5 });
      return;
    }
    const next = steps[navIdx + 1]?.at ?? current.route.coords[current.route.coords.length - 1];
    setFocus({ at: s.at, bearing: next ? bearing(s.at, next) : null, zoom: 18 });
  }, [stage, navIdx, current]);

  // Read out new route results to screen readers, once each search lands.
  const announce = useMemo(() => {
    if (stage !== "plan" || editing || !from || !to || routing) return "";
    if (routed.error) return routed.error;
    if (!result) return "";
    if (result.state === "no_route") return "No open walking route connects these points at this time.";
    if (result.state === "outside") return "This start or end is outside the covered area.";
    if (!current) return "";
    const n = display.length;
    const sunLine = result.state === "night" ? "Shade does not apply after dark." : `${Math.round(current.route.sun_minutes * 10) / 10} min ${routeMode === "shade" ? "in sun" : "without a roof"}.`;
    return `${n} ${n === 1 ? "route" : "routes"} found. ${current.title}: ${current.pct}% ${current.pctWord}, ${current.route.minutes} min walk. ${sunLine}`;
  }, [stage, editing, from, to, routing, routed.error, result, current, display.length, routeMode]);

  const vp = useViewport();
  const desktop = vp.w >= 768;
  // Wide but short screens (a phone held sideways): the chips sit right of the panel, which takes the full height.
  const short = desktop && vp.h <= 520;
  const [topEl, setTopEl] = useState<HTMLDivElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const topH = useHeight(topEl);
  const panelH = useHeight(panelEl);
  const insets = useMemo<Insets>(
    () =>
      stage === "landing"
        ? { top: 0, bottom: 0, left: 0, right: 0 }
        : desktop
          ? { top: topH + 28, left: 400, right: 28, bottom: 28 }
          : { top: topH + 20, left: 16, right: 16, bottom: panelH + 16 },
    [stage, desktop, topH, panelH],
  );

  // Refit on new endpoints or profile, not on a new hour, so the scrubber does not swing the camera.
  const fitKey = display.length ? `${stage}|${from?.node}|${to?.node}|${mode}|${stepFree}|${includeUnchecked}` : "";

  const goBack = () => {
    if (historyIndex() > 0) return window.history.back();
    setNotice(null);
    setQuery("");
    if (view === "dest") {
      setStage("landing");
      return;
    }
    if (from && to) {
      setActive(null);
      return;
    }
    setFrom(null);
    setTo(null);
    setActive(null);
  };

  const editField = (f: Field) => {
    setActive(f);
    setQuery("");
    setShowSteps(false);
  };

  const when =
    isNow && nowAt
      ? nowLabel(nowAt.minute, { bucketIdx, min: minute, night: dark }, mode)
      : date
        ? `${dateLabel(date, clock.date)}, ${fmtMinute(minute, true)}`
        : "";
  const toggles = <ProfileToggles stepFree={stepFree} onStepFree={setStepFree} mode={mode} onMode={setMode} />;
  const dataDate = manifest ? dateShort(manifest.generated_at.slice(0, 10)) : "";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-200 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] font-sans text-ink">
      {banner && <TopBanner onClose={() => setBanner(false)} onAbout={openAbout} />}
      <AdvisoryBar advisory={advisory} date={date} minute={minute} mode={mode} onRain={() => setMode("rain")} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        {mapOn && buildingsLoading && (
          <p className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-1 text-[12px] text-slate-600 shadow-sm" role="status">
            Loading 3D buildings...
          </p>
        )}
        {mapOn && (
          <MapBoundary key={mapTry} onRetry={() => setMapTry((n) => n + 1)}>
        <Suspense fallback={null}>
          <MapView
            theme={theme}
            buildingsUrl={BUILDINGS_URL}
            onBuildings={() => setBuildingsLoading(false)}
            onLoaded={() => setMapLoaded(true)}
            onReady={() => setMapReady(true)}
            coverBbox={manifest?.graph_bbox ?? null}
            routes={mapRoutes}
            selected={stage === "navigate" ? 0 : selected}
            mode={routeMode}
            nightState={night}
            from={stage === "landing" ? null : from}
            to={stage === "landing" ? null : to}
            insets={insets}
            stage={stage}
            focus={focus}
            showCallouts={stage === "plan" && (view === "results" || (view === "steps" && desktop))}
            fitKey={fitKey}
            onMapClick={onMapClick}
            onBearing={setMapBearing}
            shadow={shadow}
            highlight={stage === "plan" && view === "results" ? highlight : null}
            onSelect={(i) => {
              const d = display[i];
              if (d) setPickedLabel(d.labels[0]);
            }}
          />
        </Suspense>
          </MapBoundary>
        )}
        <Poster theme={theme} hidden={mapReady} />

        <p className="sr-only" role="status" aria-live="polite" data-testid="route-announce">
          {announce}
        </p>

        {mode === "rain" && stage !== "landing" && (
          <Suspense fallback={null}>
            <RainLayer />
          </Suspense>
        )}

        {stage === "landing" && (
          <Landing
            theme={theme}
            minute={clock.minute}
            status={status}
            error={loadError}
            onIntent={ensureData}
            picking={picking}
            onPick={pickMode}
          />
        )}

        {stage === "plan" && (
          <>
            {view !== "dest" && manifest && (
              <div ref={setTopEl} className="pointer-events-none absolute left-3 right-3 top-3 z-30 flex flex-col items-start gap-2 md:left-4 md:top-4 md:short:left-[396px]">
                <div className="flex items-start gap-2">
                  <TimeChips
                    now={{ minute: clock.minute, active: isNow, onClick: goNow }}
                    today={clock.date}
                    dates={dateOpts}
                    dateIdx={dateIdx}
                    buckets={bucketOpts}
                    bucketIdx={bucketIdx}
                    allDates={manifest.dates}
                    bucketsMin={manifest.buckets_min}
                    onDate={pickDate}
                    onBucket={(i) => {
                      setPlaying(false);
                      setBucketIdx(i);
                    }}
                  />
                  {daySlots.length > 1 && (
                    <button
                      type="button"
                      data-scrubber
                      onClick={togglePlay}
                      aria-label={playing ? "Stop the hour scrubber" : "Play the day hour by hour"}
                      aria-pressed={playing}
                      className={`pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full border shadow-sm ${playing ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-ink hover:border-slate-300"}`}
                      data-testid="scrubber"
                    >
                      {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <WeatherChips weather={weather} date={date} minute={minute} mode={mode} dark={dark} />
                  <SunChip
                    sun={sunView}
                    bearing={mapBearing}
                    day={manifest ? sunDay(manifest.sunrise_sunset?.[date], manifest.buckets_min, manifest.sun?.[date], minute) : null}
                    accent={theme.accent}
                  />
                  {overlayUrl && !dark && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={shadowsOn}
                      onClick={() => setShadowsOn(!shadowsOn)}
                      className={`pointer-events-auto flex h-11 items-center gap-1.5 rounded-full border px-3 text-[13px] shadow-sm ${shadowsOn ? "border-brand bg-blue-50 text-brand" : "border-slate-200 bg-white/95 text-slate-600"}`}
                      data-testid="shadows-toggle"
                    >
                      <span className={`h-2.5 w-2.5 rounded-sm ${shadowsOn ? "bg-slate-600/70" : "border border-slate-500"}`} />
                      Shadows
                    </button>
                  )}
                </div>
              </div>
            )}
            <div
              ref={setPanelEl}
              className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3 md:bottom-4 md:left-4 md:right-auto md:w-[368px] md:p-0"
              style={{ maxHeight: short ? "calc(100% - 32px)" : desktop ? `calc(100% - ${(view === "dest" ? 0 : topH) + 40}px)` : view === "steps" ? "72%" : "70%" }}
              data-testid="panel"
            >
              {datesPassed && (
                <p className="rounded-card bg-amber-50 px-3 py-2 text-[13px] text-amber-900 shadow-card">
                  The shade data covers {dateShort(manifest!.dates[0])} to {dateShort(manifest!.dates[manifest!.dates.length - 1])}. Those dates have passed.
                </p>
              )}
              {shownNote && (
                <p className="rounded-card bg-amber-50 px-3 py-2 text-[13px] text-amber-900 shadow-card" role="status" data-testid="now-note">
                  {shownNote}
                </p>
              )}
              {restoring && <Pending text="Restoring your trip..." />}
              {view === "dest" && !restoring && (
                <>
                  <ModeSwitch mode={mode} onChange={setMode} />
                  <div className="min-h-0 overflow-y-auto rounded-card">
                    <DestinationSearch
                      data={{ status, onRetry: ensureData }}
                      mode={mode}
                      query={query}
                      onQuery={setQuery}
                      results={results}
                      suggested={suggested}
                      onPick={onPick}
                      onBack={goBack}
                    />
                    {notice && <p className="mt-2 rounded-card bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{notice}</p>}
                  </div>
                </>
              )}
              {view === "trip" && (
                <>
                  <ModeSwitch mode={mode} onChange={setMode} />
                  <div className="min-h-0 overflow-y-auto rounded-card">
                    <TripFields
                      data={{ status, onRetry: ensureData }}
                      from={from}
                      to={to}
                      active={active ?? (!from ? "from" : "to")}
                      query={query}
                      onQuery={setQuery}
                      onActivate={editField}
                      results={results}
                      suggested={suggested}
                      onPick={onPick}
                      onLocate={onLocate}
                      locating={locating}
                      notice={notice}
                      onBack={goBack}
                    />
                  </div>
                </>
              )}
              {(view === "results" || view === "steps") && from && to && (
                <>
                  {(desktop || !current) && toggles}
                  <div className="flex min-h-0 flex-col overflow-y-auto rounded-card">
                    {routed.error && (
                      <div className="rounded-card bg-white p-4 text-[14px] text-ink shadow-card" data-testid="route-state" data-state="error">
                        {routed.error}
                        <button type="button" onClick={() => editField("from")} className="mt-3 block h-11 rounded-card bg-brand px-4 text-white">
                          Change start or end
                        </button>
                      </div>
                    )}
                    {result && (result.state === "no_route" || result.state === "outside") && (
                      <StateMessage
                        result={result}
                        onEdit={() => editField("from")}
                        onAbout={openAbout}
                        includeUnchecked={includeUnchecked}
                        onIncludeUnchecked={setIncludeUnchecked}
                        stepFree={stepFree}
                        gatedEnd={gatedEnd}
                      />
                    )}
                    {routing && !result && !routed.error && view === "results" && <Pending text="Finding routes..." />}
                    {result && current && view === "results" && (
                      <div className={`transition-opacity motion-reduce:transition-none ${routing ? "opacity-60" : ""}`} aria-busy={routing}>
                      <RouteCard
                        display={display}
                        selected={selected}
                        onSelect={(i) => setPickedLabel(display[i].labels[0])}
                        result={result}
                        mode={routeMode}
                        from={from}
                        to={to}
                        onEdit={editField}
                        when={when}
                        includeUnchecked={includeUnchecked}
                        onIncludeUnchecked={setIncludeUnchecked}
                        onSteps={() => setShowSteps(true)}
                        onNavigate={startNavigate}
                        onAbout={openAbout}
                        dataDate={dataDate}
                        compact={!desktop}
                        toggles={toggles}
                        onHighlight={setHighlight}
                      />
                      </div>
                    )}
                    {result && current && view === "steps" && (
                      <Suspense fallback={<Pending text="Loading steps..." />}>
                      <StepsList
                        steps={current.route.steps}
                        lengthM={current.route.length_m}
                        minutes={current.route.minutes}
                        night={night}
                        onBack={() => {
                          refocus("show-steps");
                          if (historyIndex() > 0) return window.history.back();
                          setShowSteps(false);
                          setFocus(null);
                        }}
                        onFocus={(i) => {
                          const s = current.route.steps[i];
                          if (s) setFocus({ at: s.at, bearing: null, zoom: 17.6 });
                        }}
                      />
                      </Suspense>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {stage === "navigate" && current && from && to && (
          <>
            <div
              ref={setTopEl}
              className="pointer-events-none absolute left-3 right-3 top-3 z-20 md:left-1/2 md:right-auto md:w-[460px] md:-translate-x-1/2 md:short:left-auto md:short:right-3 md:short:w-[min(400px,calc(100%-400px))] md:short:translate-x-0"
            >
              <Suspense fallback={<Pending text="Loading directions..." />}>
              <TurnCard
                d={current}
                idx={navIdx}
                night={night}
                onPrev={() => setNavIdx((i) => Math.max(0, i - 1))}
                onNext={() => setNavIdx((i) => Math.min(current.route.steps.length - 1, i + 1))}
              />
              </Suspense>
            </div>
            <div
              ref={setPanelEl}
              className="absolute inset-x-3 bottom-3 z-20 flex flex-col md:bottom-4 md:left-4 md:right-auto md:w-[368px]"
              style={{ maxHeight: showSteps ? "70%" : undefined }}
            >
              <Suspense fallback={<Pending text="Loading directions..." />}>
              <NavSheet
                d={current}
                from={from}
                to={to}
                night={night}
                showSteps={showSteps}
                idx={navIdx}
                onSteps={setShowSteps}
                onStep={setNavIdx}
                onClose={endNavigate}
              />
              </Suspense>
            </div>
          </>
        )}
      </main>
      <Footer onAbout={openAbout} />
      {about && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-ink/40" role="status" aria-label="Loading About" />}>
          <About manifest={manifest} onClose={closeAbout} />
        </Suspense>
      )}
    </div>
  );
}

// A card-sized placeholder while a chunk of the app loads.
function Pending({ text }: { text: string }) {
  return (
    <p className="pointer-events-auto rounded-card bg-white p-4 text-[14px] text-slate-600 shadow-card" role="status">
      {text}
    </p>
  );
}

// A still of the landing map, shown until the live map is ready, then faded out. Day and night versions;
// the hour's colour cast and haze sit on top, as they do on the live map.
function Poster({ theme, hidden }: { theme: SkyTheme; hidden: boolean }) {
  const reduced = useReducedMotion();
  const [gone, setGone] = useState(hidden);
  useEffect(() => {
    if (!hidden) return setGone(false);
    const t = setTimeout(() => setGone(true), reduced ? 0 : 450);
    return () => clearTimeout(t);
  }, [hidden, reduced]);
  if (gone) return null;
  const kind = theme.dark ? "night" : "day";
  const base = `${import.meta.env.BASE_URL}poster/${kind}`;
  return (
    <div
      className={`pointer-events-none absolute inset-0 transition-opacity duration-[400ms] motion-reduce:transition-none ${hidden ? "opacity-0" : "opacity-100"}`}
      style={{ background: `linear-gradient(${theme.sky}, ${theme.horizon} 14%, ${theme.dark ? "#1E293B" : "#EEF2F6"} 40%)` }}
      aria-hidden="true"
      data-testid="map-poster"
    >
      <picture>
        <source media="(max-width: 767px)" srcSet={`${base}-640.webp`} />
        <img src={`${base}-1280.webp`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      <div className="absolute inset-0 mix-blend-multiply" style={{ background: rgba(theme.tone, theme.toneAlpha) }} />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to bottom, ${rgba(theme.wash, theme.washAlpha)} 0%, ${rgba(theme.wash, theme.washAlpha * 0.45)} 22%, ${rgba(theme.wash, 0)} 50%)` }}
      />
    </div>
  );
}

// If the map library fails to load, say so and offer a retry; the rest of the app keeps working.
class MapBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-3 rounded-card bg-white p-3 text-[14px] text-ink shadow-card md:left-auto md:w-[360px]" role="alert">
        The map could not load.
        <button type="button" onClick={this.props.onRetry} className="min-h-11 shrink-0 rounded-card border border-slate-300 px-4 font-medium text-brand">
          Try again
        </button>
      </div>
    );
  }
}
