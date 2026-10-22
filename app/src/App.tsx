import { Component, Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AREA_LABELS, CBD_CENTER, DEFAULT_AREA, NIGHT_ALT_DEG, SUGGESTED } from "./config";
import type { Advisory, AreaInfo, Endpoint, Mode, Place, Result, Route, ShadowOverlay, Weather } from "./types";
import { MAX_SNAP_M, findRoutes, loadData, loadShadeDate, placeKeys, searchPlaces, snapToNode, type Data } from "./lib/routerClient";
import { BUILDINGS_URL, areaBase, areaPath, exists, loadAdvisory, loadAreas, loadPlaceIndex, loadWeather } from "./lib/data";
import { areaAt, areaCities, areaLabel, areaList, placeWhere, sharedArea } from "./lib/areas";
import { clockPinned, dateLabel, dateShort, fmtDist, fmtMinute, manilaNow, type Clock } from "./lib/time";
import { toDisplay } from "./lib/display";
import type { Focus, Insets } from "./components/MapView";
import Landing from "./components/Landing";
import { AdvisoryBar, Footer, TopBanner } from "./components/Chrome";
import { DestinationSearch, ModeSwitch, TripFields } from "./components/Planner";
import { TimeChips, WeatherChips } from "./components/TimeChips";
import { ProfileToggles, RouteCard, StateMessage, fmtDuration, headline, noRouteText, type Highlight } from "./components/RouteCard";
import RoutePeek from "./components/RoutePeek";
import SunChip from "./components/SunChip";
import { compass16, sunDay, sunPosition, type SunView } from "./lib/sun";
import { rgba, skyTheme, type SkyTheme } from "./lib/skyTheme";
import { eagerMap, loadMapLibre, prefetchMapLibre } from "./lib/maplibre";
import { useReducedMotion } from "./lib/motion";
import { PauseIcon, PlayIcon } from "./components/Icons";
import { nowLabel, nowSlot } from "./lib/nowSlot";
import { decodeEndpoint, encodeEndpoint, hashFor, hhmmToMinute, minuteToHHMM, MY_LOCATION, tripFromHash, type TripParams } from "./lib/tripUrl";

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
  // The trip settings of this entry, so Back and Forward restore its time and profile, not the latest ones.
  settings?: { dateIdx: number; bucketIdx: number; mode: Mode; stepFree: boolean; nowAt: { minute: number; dateIdx: number; bucketIdx: number } | null };
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

// The routing node of a place or point, where the route line starts, so the marker sits on it.
function nodeLL(d: Data, node: number, fallback: [number, number]): [number, number] {
  const lon = d.nodeLon[node];
  const lat = d.nodeLat[node];
  return lon != null && lat != null && Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : fallback;
}

type Bundles = Record<string, Data>;

export default function App() {
  const clock = useManilaClock();
  // Search covers every area: areas.json and places_index.json (about 1.3 MB) load on the first sign of intent,
  // hovering, focusing or tapping a route type. status follows them.
  const [areas, setAreas] = useState<AreaInfo[] | null>(null);
  const [index, setIndex] = useState<Pick<Data, "places" | "placeKeys"> | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  // An area's routing bundle loads when a place or point in it is picked. Only the newest bundle and the current
  // area's stay in memory, since one area's graph is up to 9 MB.
  const [bundles, setBundles] = useState<Bundles>({});
  const [areaFailed, setAreaFailed] = useState<Record<string, string>>({});
  // Counts dates whose shade file arrived, so the routes recompute. The bundle fills its arrays in place.
  const [shadeVer, setShadeVer] = useState(0);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [buildingsLoading, setBuildingsLoading] = useState(true);

  // A link with a start or end in its fragment opens straight on that trip, once its area has loaded.
  const [initialTrip] = useState<TripParams | null>(() => {
    const t = tripFromHash(window.location.hash);
    return t.start || t.end ? t : null;
  });
  const [restoring, setRestoring] = useState(!!initialTrip);
  const [stage, setStage] = useState<Stage>(initialTrip ? "plan" : "landing");
  const [mode, setMode] = useState<Mode>(initialTrip?.mode ?? "shade");
  const [from, setFrom] = useState<Endpoint | null>(null);
  const [to, setTo] = useState<Endpoint | null>(null);
  // The trip's area is the end's, else the start's. A start in another area gets the one-area message.
  // lastArea holds the area while no end is set, such as during a restore or after Back clears the fields.
  const [lastArea, setLastArea] = useState<string | null>(initialTrip ? (initialTrip.area ?? DEFAULT_AREA) : null);
  const areaId = to?.area ?? from?.area ?? lastArea;
  const data = areaId ? (bundles[areaId] ?? null) : null;
  const crossArea = !!from && !!to && from.area !== to.area;
  // Ends in two areas still route when one area's graph holds both. Only a trip no graph holds gets the message.
  const shared = crossArea && from && to && areas ? sharedArea(areas, from, to) : null;
  const blocked = crossArea && !shared;
  const areaRef = useRef(areaId);
  areaRef.current = areaId;
  const bundlesRef = useRef(bundles);
  bundlesRef.current = bundles;
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
    loadAdvisory(lastArea ?? DEFAULT_AREA).then(setAdvisory);
  }, []);
  // Weather and the shadow images belong to the area.
  useEffect(() => {
    if (!areaId) return;
    let live = true;
    setWeather(null);
    setShadowsReady(false);
    // A failed fetch shows "Weather unavailable", the same as a file that reports an error. Null means still loading.
    loadWeather(areaId).then((w) => live && setWeather(w ?? { status: "unavailable", fetched_at: "" }));
    exists(`${areaPath(areaId)}READY.shadows`).then((r) => live && setShadowsReady(r));
    return () => {
      live = false;
    };
  }, [areaId]);

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
    Promise.all([loadAreas(), loadPlaceIndex()])
      .then(([list, raw]) => {
        const places = raw.map((pl) => ({ ...pl, aliases: Array.isArray(pl.aliases) ? pl.aliases : [] }));
        setAreas(list);
        setIndex({ places, placeKeys: placeKeys(places) });
        setStatus("ready");
      })
      .catch((e: unknown) => {
        loading.current = false;
        setStatus("error");
        setLoadError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  // The date whose shade loads with a new area: the chosen date, or today before any time is set.
  const wantDate = useRef(clock.date);
  const areaLoading = useRef(new Set<string>());
  const ensureArea = useCallback((id: string) => {
    if (bundlesRef.current[id] || areaLoading.current.has(id)) return;
    areaLoading.current.add(id);
    setAreaFailed(({ [id]: _, ...rest }) => rest);
    loadData(areaBase(id), undefined, { date: wantDate.current })
      .then((d) =>
        setBundles((prev) => {
          const cur = areaRef.current;
          return cur && cur !== id && prev[cur] ? { [cur]: prev[cur], [id]: d } : { [id]: d };
        }),
      )
      .catch((e: unknown) => setAreaFailed((f) => ({ ...f, [id]: e instanceof Error ? e.message : String(e) })))
      .finally(() => areaLoading.current.delete(id));
  }, []);
  useEffect(() => {
    if (areaId) ensureArea(areaId);
  }, [areaId, ensureArea]);
  const areaError = areaId ? (areaFailed[areaId] ?? null) : null;

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
  wantDate.current = date || clock.date;
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
    setNowAt(null);
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

  // A time the user picks by hand is never Now, even if it lands on Now's slot again.
  const pickBucket = (i: number) => {
    setPlaying(false);
    setNowAt(null);
    setBucketIdx(i);
  };
  const pickDate = (idx: number) => {
    setNowAt(null);
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
      if (!areaId || !overlayDef.buckets[d]?.includes(hhmm)) return null;
      return `${areaBase(areaId)}${overlayDef.path.replace("{date}", d).replace("{HHMM}", hhmm)}`;
    },
    [shadowsReady, overlayDef, areaId],
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

  // Set once the first area has loaded and the trip time is restored or set to Now.
  const started = useRef(false);
  // Areas come from one daily build, so their dates and slots match. If a newly loaded area's manifest differs,
  // keep the chosen date and time when it has them, and fall back to Now when it does not.
  const slot = useRef<{ date: string; minute: number } | null>(null);
  useEffect(() => {
    const s = slot.current;
    if (!manifest || !s || !started.current) return;
    if (manifest.dates[dateIdx] === s.date && manifest.buckets_min[bucketIdx] === s.minute) return;
    const di = manifest.dates.indexOf(s.date);
    const bi = manifest.buckets_min.indexOf(s.minute);
    if (di >= 0 && bi >= 0) {
      setDateIdx(di);
      setBucketIdx(bi);
    } else applyNow();
  }, [manifest]);
  useEffect(() => {
    if (manifest) slot.current = { date: manifest.dates[dateIdx], minute: manifest.buckets_min[bucketIdx] };
  }, [manifest, dateIdx, bucketIdx]);

  // Shade comes one date per file. Fetch the chosen date's file when the bundle lacks it; routes wait for it.
  // A date whose file fails is tried once, and then routes count only roofs, with a note on the card.
  const shadeTried = useRef(new WeakMap<Data, Map<number, "loading" | "done">>());
  const tried = data ? shadeTried.current.get(data) : undefined;
  // A date outside the bundle never loads; the router then reports it as an error instead of a wait.
  const shadeReady = !data?.shade || data.shade.loaded[dateIdx] === 1 || tried?.get(dateIdx) === "done" || dateIdx >= data.shade.nDates;
  useEffect(() => {
    if (!data?.shade || data.shade.loaded[dateIdx] || dateIdx >= data.shade.nDates) return;
    const t = shadeTried.current.get(data) ?? new Map<number, "loading" | "done">();
    shadeTried.current.set(data, t);
    if (t.has(dateIdx)) return;
    t.set(dateIdx, "loading");
    loadShadeDate(data, dateIdx).then(() => {
      t.set(dateIdx, "done");
      setShadeVer((v) => v + 1);
    });
  }, [data, dateIdx]);

  // Routing runs in the browser. The router scores each edge at the slot when the walker reaches it.
  // The search runs on a deferred copy of its inputs, so a tap on a place or an hour paints at once and the
  // routes follow; meanwhile the card says it is updating. The bundle rides along, so the ends and the graph
  // they belong to always change together.
  const [timeSet, setTimeSet] = useState(false);
  const routeInput = useMemo(
    () => ({ data, area: areaId, from, to, dateIdx, bucketIdx, mode, stepFree, includeUnchecked, minute: departMin, stage, ready: timeSet && shadeReady, shadeVer }),
    [data, areaId, from, to, dateIdx, bucketIdx, mode, stepFree, includeUnchecked, departMin, stage, timeSet, shadeReady, shadeVer],
  );
  const deferred = useDeferredValue(routeInput);
  const routing = deferred !== routeInput;
  const routed = useMemo<{ result: Result | null; error: string | null }>(() => {
    const { data, area, from, to, dateIdx, bucketIdx, mode, stepFree, includeUnchecked, minute, stage, ready } = deferred;
    if (!data || !ready || !from || !to || stage === "landing") return { result: null, error: null };
    // Routes stay inside one area: a start or end from another area's graph has no node here.
    if (from.area !== area || to.area !== area) return { result: null, error: null };
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
  }, [deferred]);
  // A stale result from before the start moved to another area never shows beside the one-area message.
  const result = crossArea ? null : routed.result;

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
  const gatedEnds =
    mainNet && from && to && !crossArea && to.area === areaId ? [from, to].filter((x) => mainNet.comp[x.node] !== mainNet.main).map((x) => x.label) : [];
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

  // Search covers every area. Within a tier, places in the other end's area come first.
  const editingField: Field = view === "dest" ? "to" : (active ?? (!from ? "from" : "to"));
  const otherArea = (editingField === "from" ? to : from)?.area ?? null;
  const results = useMemo(
    () => (index && query.trim() ? searchPlaces(index, query, 8, otherArea ? (p) => p.area === otherArea : undefined) : []),
    [index, query, otherArea],
  );
  const suggested = useMemo(() => {
    if (!index) return [];
    const taken = new Set([from, to].map((e) => (e ? `${e.area}|${e.node}` : "")));
    const pick = (area: string) =>
      (SUGGESTED[area] ?? [])
        .map((n) => index.places.find((pl) => pl.area === area && pl.name.toLowerCase() === n.toLowerCase()))
        .filter((pl): pl is Place => !!pl && !taken.has(`${area}|${pl.node_id}`));
    if (otherArea) return pick(otherArea).slice(0, 4);
    // Nothing picked yet: one place in each area, so the list shows where the app works.
    return AREA_LABELS.map((a) => pick(a.id)[0]).filter((pl): pl is Place => !!pl);
  }, [index, from, to, otherArea]);
  const where = useCallback((p: Place) => placeWhere(p, areas), [areas]);

  // A map point or GPS fix waiting for its area's walking map to load.
  const [pendingPoint, setPendingPoint] = useState<{ field: Field; lon: number; lat: number; label: string; area: string } | null>(null);

  const assign = (field: Field, ep: Endpoint) => {
    setNotice(null);
    setQuery("");
    setPickedLabel(null);
    setShowSteps(false);
    setFocus(null);
    setPendingPoint(null);
    setLastArea(ep.area);
    const other = field === "from" ? to : from;
    if (field === "from") setFrom(ep);
    else setTo(ep);
    setActive(other ? null : field === "from" ? "to" : "from");
    // Keyboard and screen reader users land on the next thing to do, not on the page body.
    refocus(other ? "panel" : `${field === "from" ? "to" : "from"}-input`);
  };

  // A place carries its area from the index. Before that area loads, its marker sits at the place itself.
  const placeEndpoint = (pl: Place, area = pl.area ?? areaId ?? DEFAULT_AREA): Endpoint => {
    const d = bundles[area];
    const [lon, lat] = d ? nodeLL(d, pl.node_id, [pl.lon, pl.lat]) : [pl.lon, pl.lat];
    return { label: pl.name, sub: pl.category, area, node: pl.node_id, lon, lat, snap_m: null };
  };
  // Once the area loads, move such a marker to the place's path node, where its route starts.
  useEffect(() => {
    const fix = (ep: Endpoint | null) => {
      const d = ep && ep.snap_m === null ? bundles[ep.area] : undefined;
      if (!ep || !d) return ep;
      const [lon, lat] = nodeLL(d, ep.node, [ep.lon, ep.lat]);
      return lon === ep.lon && lat === ep.lat ? ep : { ...ep, lon, lat };
    };
    setFrom(fix);
    setTo(fix);
  }, [bundles]);

  // Move the end that sits in another area onto the shared area's graph: the same place by name within 150 m,
  // else the nearest path node there.
  useEffect(() => {
    if (!shared || !from || !to) return;
    const d = bundles[shared];
    if (!d) return ensureArea(shared);
    const near = (p: { lon: number; lat: number }, q: { lon: number; lat: number }) =>
      Math.hypot((p.lon - q.lon) * 107_550, (p.lat - q.lat) * 110_574) < 150;
    const rehome = (ep: Endpoint): Endpoint | null => {
      if (ep.area === shared) return ep;
      const twin = ep.snap_m === null ? d.places.find((p) => p.name === ep.label && near(p, ep)) : undefined;
      if (twin) return placeEndpoint(twin, shared);
      const s = snapToNode(d, ep.lon, ep.lat);
      if (!s || s.dist_m > MAX_SNAP_M) return null;
      const [lon, lat] = nodeLL(d, s.node, [ep.lon, ep.lat]);
      return { ...ep, area: shared, node: s.node, lon, lat, snap_m: s.dist_m };
    };
    const f = rehome(from);
    const t2 = rehome(to);
    if (f && t2) {
      setFrom(f);
      setTo(t2);
    }
  }, [shared, bundles, from, to]);

  // A point farther than the router's snap limit is off the mapped paths; say so instead of dropping a pin.
  const pointEndpoint = (d: Data, area: string, lon: number, lat: number, label: string): Endpoint | string => {
    const s = snapToNode(d, lon, lat);
    if (!s) return "The walking map is not loaded.";
    if (s.dist_m > MAX_SNAP_M) {
      return `${label === MY_LOCATION ? "You are" : "That point is"} ${fmtDist(s.dist_m)} from the nearest mapped path. Pick a point on a street or path.`;
    }
    const [nlon, nlat] = nodeLL(d, s.node, [lon, lat]);
    return { label, sub: `${Math.round(s.dist_m)} m from the nearest path`, area, node: s.node, lon: nlon, lat: nlat, snap_m: s.dist_m };
  };

  // A map tap or GPS fix routes in the area whose graph covers it, on that area's nearest node.
  const placePoint = (d: Data, field: Field, area: string, lon: number, lat: number, label: string) => {
    const ep = pointEndpoint(d, area, lon, lat, label);
    if (typeof ep === "string") setNotice(ep);
    else assign(field, ep);
  };
  const pickPoint = (field: Field, lon: number, lat: number, label: string) => {
    if (!areas) {
      ensureData();
      setNotice("The walking map is still loading. Try again in a moment.");
      return;
    }
    const a = areaAt(areas, lon, lat, areaId);
    if (!a) {
      setNotice(`${label === MY_LOCATION ? "You are" : "That point is"} outside the areas this app covers: ${areaList(areas)}.`);
      return;
    }
    const d = bundles[a.id];
    if (d) return placePoint(d, field, a.id, lon, lat, label);
    setNotice(`Loading the walking map for ${areaLabel(a.id, areas)}...`);
    setPendingPoint({ field, lon, lat, label, area: a.id });
    ensureArea(a.id);
  };
  useEffect(() => {
    if (!pendingPoint) return;
    const d = bundles[pendingPoint.area];
    if (d) {
      setPendingPoint(null);
      placePoint(d, pendingPoint.field, pendingPoint.area, pendingPoint.lon, pendingPoint.lat, pendingPoint.label);
    } else if (areaFailed[pendingPoint.area]) {
      setPendingPoint(null);
      setNotice("The walking map did not load. Check your connection and try again.");
    }
  }, [pendingPoint, bundles, areaFailed]);

  const onPick = (pl: Place) => assign(editingField, placeEndpoint(pl));

  const onMapClick = (lon: number, lat: number) => {
    if (stage !== "plan" || view === "results" || view === "steps") return;
    pickPoint(editingField, lon, lat, "Point on map");
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
        pickPoint("from", pos.coords.longitude, pos.coords.latitude, MY_LOCATION);
      },
      (err) => {
        setLocating(false);
        setNotice(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Pick a place instead." : "Could not get your location. Pick a place instead.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  // Once the first area loads: restore the trip from the link, or pick Now. The time chosen then stays put as the
  // clock ticks. Routes wait for this (timeSet), so the first search never runs at a placeholder time.
  useEffect(() => {
    if (initialTrip) ensureData();
  }, []);
  useEffect(() => {
    if (!data || !manifest || !areaId || started.current) return;
    started.current = true;
    setTimeSet(true);
    const trip = initialTrip;
    if (!trip) return applyNow();
    // Names and points in the link resolve inside the link's area.
    const area = areaId;
    const resolve = (token: string | null): Endpoint | null => {
      const ref = decodeEndpoint(token);
      if (!ref) return null;
      if (ref.kind === "point") {
        const ep = pointEndpoint(data, area, ref.lon, ref.lat, "Point on map");
        return typeof ep === "string" ? null : ep;
      }
      const named = (x: Place) => ref.kind === "name" && x.name.toLowerCase() === ref.name.toLowerCase();
      const pl =
        ref.kind === "node"
          ? data.places.find((x) => x.node_id === ref.node)
          : (data.places.find((x) => named(x) && x.node_id === ref.node) ?? data.places.find(named));
      return pl ? placeEndpoint(pl, area) : null;
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
  // If the link's area never loads, drop the restoring card so the retry button shows.
  useEffect(() => {
    if (areaError) setRestoring(false);
  }, [areaError]);

  // Every screen is a browser history entry, and the trip is kept in the fragment with replaceState.
  const tripParams = useMemo<TripParams | null>(() => {
    if (stage === "landing") return null;
    // A name gets a node suffix only when it repeats inside its own area.
    const placesOf = (area: string) => bundles[area]?.places ?? index?.places.filter((p) => p.area === area) ?? [];
    const timed = !!manifest && !!(from || to);
    const live = isNow && !!nowAt;
    return {
      area: to?.area ?? from?.area ?? null,
      start: from ? encodeEndpoint(from, placesOf(from.area)) : null,
      end: to ? encodeEndpoint(to, placesOf(to.area)) : null,
      date: timed && !live ? (manifest?.dates[dateIdx] ?? null) : null,
      time: timed ? (live ? "now" : minuteToHHMM(minute)) : null,
      mode,
      stepFree,
    };
  }, [stage, bundles, index, manifest, from, to, isNow, nowAt, dateIdx, minute, mode, stepFree]);
  const tripHash = hashFor(tripParams);
  const lastScreen = useRef<Screen | null>(null);
  useEffect(() => {
    if (restoring) return;
    const { pathname, search } = window.location;
    const url = `${pathname}${search}${tripHash}`;
    const prior = window.history.state as Snapshot | null;
    const snap: Snapshot = { screen, stage, active, showSteps, from, to, settings: { dateIdx, bucketIdx, mode, stepFree, nowAt }, i: prior?.i ?? 0 };
    if (lastScreen.current === null) {
      lastScreen.current = screen;
      if (prior || screen === "landing") return window.history.replaceState(snap, "", url);
      // A shared link has nothing behind it. Seed a landing entry so Back has somewhere to go.
      const landing: Snapshot = { screen: "landing", stage: "landing", active: null, showSteps: false, from: null, to: null, i: 0 };
      window.history.replaceState(landing, "", `${pathname}${search}`);
      window.history.pushState({ ...snap, i: 1 }, "", url);
    } else if (screen !== lastScreen.current) {
      lastScreen.current = screen;
      window.history.pushState({ ...snap, i: snap.i + 1 }, "", url);
    } else {
      window.history.replaceState(snap, "", url);
    }
  }, [restoring, screen, stage, active, showSteps, from, to, tripHash, dateIdx, bucketIdx, mode, stepFree, nowAt]);
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
      if (s.settings) {
        setDateIdx(s.settings.dateIdx);
        setBucketIdx(s.settings.bucketIdx);
        setMode(s.settings.mode);
        setStepFree(s.settings.stepFree);
        setNowAt(s.settings.nowAt);
      }
      if (s.screen === "dest") {
        setFrom(null);
        setTo(null);
      } else if (s.screen !== "landing") {
        // A step back to the trip fields keeps the start and end already picked.
        setFrom((f) => s.from ?? f);
        setTo((t) => s.to ?? t);
      }
    };
    // A link pasted into the same tab changes only the fragment and carries no app entry. Reload so the
    // trip in the new link loads the same way as a fresh visit. Back and Forward carry an entry and go to onPop.
    const onHash = () => {
      if (!(window.history.state as Snapshot | null)?.screen) window.location.reload();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
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
  // Each screen gets its own title, so tabs, history, and screen readers say where the user is (WCAG 2.4.2).
  useEffect(() => {
    const base = "undercover.ph";
    if (stage === "navigate" && to) document.title = `Walking to ${to.label} | ${base}`;
    else if (stage === "plan" && from && to) document.title = `${from.label} to ${to.label} | ${base}`;
    else if (stage === "plan") document.title = `Plan a walk | ${base}`;
    else document.title = `${base} | Shaded and sheltered walks in Metro Manila`;
  }, [stage, from, to]);

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
    refocus("turn-card");
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
  // A start and end in different areas: no route, and the card names both areas.
  const crossText = blocked && from && to ? `${from.label} is in ${areaLabel(from.area, areas)}. ${to.label} is in ${areaLabel(to.area, areas)}.` : "";
  const announce = useMemo(() => {
    if (stage !== "plan" || editing || !from || !to) return "";
    if (crossText) return `Routes stay inside one area. ${crossText}`;
    if (routing) return "";
    if (routed.error) return routed.error;
    if (!result) return "";
    if (result.state === "no_route") return noRouteText(result.notes, from.label, to.label, []).title;
    if (result.state === "outside") return "This start or end is outside the covered area.";
    if (!current) return "";
    const n = display.length;
    const sunLine = result.state === "night" ? ((result.sun?.altitude ?? 0) > 0 ? "The sun is too low for shade." : "Shade does not apply after dark.") : `${fmtDuration(current.route.sun_minutes)} ${routeMode === "shade" ? "in sun" : "without a roof"}.`;
    return `${n} ${n === 1 ? "route" : "routes"} found. ${current.title}: ${current.pct}% ${current.pctWord}, ${current.route.minutes} min walk. ${sunLine}`;
  }, [stage, editing, from, to, crossText, routing, routed.error, result, current, display.length, routeMode]);

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

  // Phones show the route as a short sheet first, as map apps do, so the map keeps most of the screen.
  const [sheetFull, setSheetFull] = useState(false);
  const sheetDrag = useRef<number | null>(null);

  // Refit on new endpoints or profile, not on a new hour, so the scrubber does not swing the camera.
  const fitKey = display.length ? `${stage}|${from?.area}|${from?.node}|${to?.node}|${mode}|${stepFree}|${includeUnchecked}` : "";
  useEffect(() => setSheetFull(false), [fitKey]);

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
      ? nowLabel(nowAt.minute, { bucketIdx, min: minute, night: dark }, mode, sun?.[0])
      : date
        ? `${dateLabel(date, clock.date)}, ${fmtMinute(minute, true)}`
        : "";
  const toggles = <ProfileToggles stepFree={stepFree} onStepFree={setStepFree} mode={mode} onMode={setMode} />;
  const dataDate = manifest ? dateShort(manifest.generated_at.slice(0, 10)) : "";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-200 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] font-sans text-ink">
      {banner && <TopBanner onClose={() => setBanner(false)} onAbout={openAbout} />}
      {/* Before an area loads there is no trip time yet, so the bar checks the advisory against the clock. */}
      <AdvisoryBar
        advisory={advisory}
        date={date || clock.date}
        minute={manifest ? departMin : clock.minute}
        mode={mode}
        cities={areaCities(areaId, areas)}
        onRain={() => setMode("rain")}
      />
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
                {desktop ? (
                  <>
                    <div className="flex items-start gap-2">
                      <TimeChips
                        now={{ minute: isNow && nowAt ? nowAt.minute : clock.minute, active: isNow, onClick: goNow }}
                        today={clock.date}
                        dates={dateOpts}
                        dateIdx={dateIdx}
                        buckets={bucketOpts}
                        bucketIdx={bucketIdx}
                        allDates={manifest.dates}
                        bucketsMin={manifest.buckets_min}
                        onDate={pickDate}
                        onBucket={pickBucket}
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
                          aria-label="Shadows on the map"
                          className={`pointer-events-auto flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] shadow-sm ${shadowsOn ? "border-brand bg-blue-50 text-brand" : "border-slate-200 bg-white/95 text-slate-600"}`}
                          data-testid="shadows-toggle"
                        >
                          <span className={`h-2.5 w-2.5 rounded-sm ${shadowsOn ? "bg-slate-600/70" : "border border-slate-500"}`} />
                          <span className="hidden md:inline">Shadows</span>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  // Phones: one row, as in map apps, so the map keeps the height. Play and the map shadows
                  // switch sit behind the when chip and the sun chip. Below 360 px the row wraps.
                  <div className="flex flex-wrap items-start gap-1.5">
                    <TimeChips
                      compact
                      play={daySlots.length > 1 ? { playing, onToggle: togglePlay } : null}
                      now={{ minute: isNow && nowAt ? nowAt.minute : clock.minute, active: isNow, onClick: goNow }}
                      today={clock.date}
                      dates={dateOpts}
                      dateIdx={dateIdx}
                      buckets={bucketOpts}
                      bucketIdx={bucketIdx}
                      allDates={manifest.dates}
                      bucketsMin={manifest.buckets_min}
                      onDate={pickDate}
                      onBucket={pickBucket}
                    />
                    <WeatherChips compact weather={weather} date={date} minute={minute} mode={mode} dark={dark} />
                    <SunChip
                      compact
                      sun={sunView}
                      bearing={mapBearing}
                      day={manifest ? sunDay(manifest.sunrise_sunset?.[date], manifest.buckets_min, manifest.sun?.[date], minute) : null}
                      accent={theme.accent}
                      shadows={overlayUrl && !dark ? { on: shadowsOn, toggle: () => setShadowsOn(!shadowsOn) } : null}
                    />
                  </div>
                )}
              </div>
            )}
            <div
              ref={setPanelEl}
              tabIndex={-1}
              aria-label="Trip"
              className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-3 outline-none md:bottom-4 md:left-4 md:right-auto md:w-[368px] md:p-0"
              style={{ maxHeight: short ? "calc(100% - 32px)" : desktop ? `calc(100% - ${(view === "dest" ? 0 : topH) + 40}px)` : `min(${view === "steps" ? 72 : 70}%, calc(100% - ${topH + 20}px))` }}
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
                      where={where}
                    />
                    {notice && (
                      <p className="mt-2 rounded-card bg-amber-50 px-3 py-2 text-[13px] text-amber-900" role="status">
                        {notice}
                      </p>
                    )}
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
                      where={where}
                    />
                  </div>
                </>
              )}
              {(view === "results" || view === "steps") && from && to && (
                <>
                  {!desktop && sheetFull && view === "results" && current && (
                    <button
                      type="button"
                      onClick={() => setSheetFull(false)}
                      onPointerDown={(e) => (sheetDrag.current = e.clientY)}
                      onPointerUp={(e) => {
                        if (sheetDrag.current !== null && e.clientY - sheetDrag.current > 24) setSheetFull(false);
                        sheetDrag.current = null;
                      }}
                      aria-expanded
                      aria-label="Show less, more map"
                      className="-mb-1 flex h-7 w-full shrink-0 items-center justify-center"
                      data-testid="sheet-collapse"
                    >
                      <span className="h-1.5 w-10 rounded-full bg-white/90 shadow" aria-hidden="true" />
                    </button>
                  )}
                  {(desktop || !current || (sheetFull && view === "results")) && !crossArea && toggles}
                  <div className="flex min-h-0 flex-col overflow-y-auto rounded-card">
                    {crossArea && !blocked && <Pending text={`Loading the walking map for ${areaLabel(shared!, areas)}...`} />}
                    {blocked && (
                      <div className="rounded-card bg-white p-4 text-[14px] text-ink shadow-card" role="status" data-testid="cross-area">
                        <p className="text-[16px] font-medium">Routes stay inside one area.</p>
                        <p className="mt-1 text-slate-700">{crossText} Pick a start in the same area as your end.</p>
                        <button type="button" onClick={() => editField("from")} className="mt-3 block h-11 rounded-card bg-brand px-4 text-white" data-testid="cross-area-edit">
                          Change the start
                        </button>
                      </div>
                    )}
                    {!crossArea && areaError && (
                      <div className="rounded-card bg-white p-4 text-[14px] text-ink shadow-card" role="alert" title={areaError} data-testid="area-error">
                        The walking map for {areaLabel(areaId!, areas)} did not load. Check your connection and try again.
                        <button type="button" onClick={() => ensureArea(areaId!)} className="mt-3 block h-11 rounded-card border border-slate-300 px-4 font-medium text-brand">
                          Try again
                        </button>
                      </div>
                    )}
                    {!crossArea && !areaError && view === "results" && (!data || !timeSet) && <Pending text={`Loading the walking map for ${areaLabel(areaId!, areas)}...`} />}
                    {!crossArea && data && timeSet && !shadeReady && view === "results" && <Pending text={`Loading shade for ${dateLabel(date, clock.date)}...`} />}
                    {!crossArea && routed.error && (
                      <div className="rounded-card bg-white p-4 text-[14px] text-ink shadow-card" data-testid="route-state" data-state="error">
                        {routed.error}
                        <button type="button" onClick={() => editField("from")} className="mt-3 block h-11 rounded-card bg-brand px-4 text-white">
                          Change start or end
                        </button>
                      </div>
                    )}
                    {!crossArea && result && (result.state === "no_route" || result.state === "outside") && (
                      <StateMessage
                        result={result}
                        onEdit={() => editField("from")}
                        onAbout={openAbout}
                        includeUnchecked={includeUnchecked}
                        onIncludeUnchecked={setIncludeUnchecked}
                        stepFree={stepFree}
                        from={from.label}
                        to={to.label}
                        gatedEnds={gatedEnds}
                      />
                    )}
                    {!crossArea && data && timeSet && shadeReady && routing && !result && !routed.error && view === "results" && <Pending text="Finding routes..." />}
                    {result && current && view === "results" && !desktop && !sheetFull && (
                      <div className={`transition-opacity motion-reduce:transition-none ${routing ? "opacity-60" : ""}`} aria-busy={routing}>
                        <RoutePeek
                          d={current}
                          count={display.length}
                          mode={routeMode}
                          night={night}
                          head={headline(current, display, result, routeMode)}
                          onExpand={() => setSheetFull(true)}
                          onSteps={() => setShowSteps(true)}
                          onNavigate={startNavigate}
                        />
                      </div>
                    )}
                    {result && current && view === "results" && (desktop || sheetFull) && (
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
                        // The phone's full sheet is the details view, so it shows notes, warnings, and options open.
                        compact={false}
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

        {/* Phones: Play as a round map button above the sheet, as map apps place their map controls. */}
        {stage === "plan" && !desktop && view === "results" && !sheetFull && current && daySlots.length > 1 && (
          <button
            type="button"
            data-scrubber
            onClick={togglePlay}
            aria-label={playing ? "Stop the hour scrubber" : "Play the day hour by hour"}
            aria-pressed={playing}
            className={`absolute right-3 z-20 grid h-12 w-12 place-items-center rounded-full border shadow-card ${playing ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-ink"}`}
            style={{ bottom: panelH + 4 }}
            data-testid="map-play"
          >
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
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
