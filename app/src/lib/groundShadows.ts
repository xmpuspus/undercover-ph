import type * as maplibregl from "maplibre-gl";
import { NIGHT_ALT_DEG } from "../config";
import { ringArea } from "./shadowGeometry";
import { drawShadows, SHADOW_OPACITY, type ShadowBox, type ShadowTile, type Surface } from "./shadowDraw";
import type { FromWorker, ToWorker } from "./shadowWorker";

// Ground shadows of the buildings and tree crowns in view, drawn in the browser for the chosen sun.
// A worker draws each picture where it can; the page reads the tiles MapLibre has loaded and shows the pictures.
// Two canvas sources take turns: the next picture goes into the hidden one, which then replaces the shown one,
// with a fade when the hour changes. Both raster layers sit under the 3D buildings.

const EARTH_M = 40075016.686;
// Canvas size limit per side, and the finest ground detail worth drawing.
const MAX_SIDE = 2048;
const MIN_PX_M = 0.5;
const SETTLE_MS = 120;
const GIVE_UP_MS = 2000;

export const BUILDINGS_SOURCE = "hb-buildings";
export const TREES_SOURCE = "hb-trees";

// Web Mercator, 0 to 1 across the world, y growing south. Vector tiles and canvas sources both stretch linearly in it.
const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const lonOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - 90;

interface Box extends ShadowBox {
  key: string;
}

// The ground the canvas covers: the visible bounds plus a quarter on each side, cut to a square round the centre.
// The cut keeps a steep pitch, whose bounds reach the horizon, from spreading the canvas thin; the far ground
// sits under the haze. Canvas pixels match screen pixels at the centre, within MAX_SIDE.
function viewBox(map: maplibregl.Map): Box | null {
  const el = map.getCanvas();
  const side = Math.max(el.clientWidth, el.clientHeight);
  if (!side) return null;
  const c = map.getCenter();
  const cos = Math.cos((c.lat * Math.PI) / 180);
  const mpp = (EARTH_M * cos) / (512 * 2 ** map.getZoom());
  const wpm = 1 / (EARTH_M * cos);
  const r = 0.75 * side * mpp * wpm;
  const cx = mercX(c.lng);
  const cy = mercY(c.lat);
  const b = map.getBounds();
  const bx0 = mercX(b.getWest());
  const bx1 = mercX(b.getEast());
  const by0 = mercY(b.getNorth());
  const by1 = mercY(b.getSouth());
  const mx = (bx1 - bx0) / 4;
  const my = (by1 - by0) / 4;
  let x0 = Math.max(cx - r, bx0 - mx);
  let y0 = Math.max(cy - r, by0 - my);
  let x1 = Math.min(cx + r, bx1 + mx);
  let y1 = Math.min(cy + r, by1 + my);
  if (!(x1 > x0 && y1 > y0)) return null;
  // MapLibre rounds an image's corners to the grid of the tile that holds it. Snapping the corners to that grid
  // (one zoom coarser, so a small change in size cannot move them off it) keeps shadows exactly under their buildings.
  const zoom = Math.max(0, Math.floor(-Math.log2(Math.max(x1 - x0, y1 - y0))) - 1);
  const grid = 2 ** zoom * 8192;
  x0 = Math.floor(x0 * grid) / grid;
  y0 = Math.floor(y0 * grid) / grid;
  x1 = Math.ceil(x1 * grid) / grid;
  y1 = Math.ceil(y1 * grid) / grid;
  const px = Math.max(Math.max(mpp, MIN_PX_M) * wpm, Math.max(x1 - x0, y1 - y0) / MAX_SIDE);
  const w = Math.min(MAX_SIDE, Math.max(1, Math.round((x1 - x0) / px)));
  const h = Math.min(MAX_SIDE, Math.max(1, Math.round((y1 - y0) / px)));
  return { x0, y0, x1, y1, w, h, key: `${x0},${y0},${x1},${y1},${w},${h}` };
}

function corners(b: Pick<Box, "x0" | "y0" | "x1" | "y1">): [[number, number], [number, number], [number, number], [number, number]] {
  const w = lonOf(b.x0);
  const e = lonOf(b.x1);
  const n = latOf(b.y0);
  const s = latOf(b.y1);
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
}

interface Slot extends Surface {
  id: string;
  layer: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  key: string;
}

interface Request {
  box: Box;
  sun: [number, number];
  fade: boolean;
}

export interface ShadowStats {
  // Main-thread time to read new tiles, to draw (or, with the worker, to copy its picture in), and to upload.
  collectMs: number;
  drawMs: number;
  uploadMs: number;
  // Drawing time in the worker, off the main thread. Zero without one.
  workerMs: number;
  buildings: number;
  trees: number;
  canvas: [number, number];
}

function surface(): Surface & { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  return { canvas, ctx: canvas.getContext("2d")! };
}

// A worker can draw only with a 2D OffscreenCanvas (Safari from 16.4).
function startWorker(): Worker | null {
  try {
    if (typeof OffscreenCanvas === "undefined" || !new OffscreenCanvas(1, 1).getContext("2d")) return null;
    return new Worker(new URL("./shadowWorker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export class GroundShadows {
  private map: maplibregl.Map;
  private slots: Slot[];
  private scratch: Surface | null = null;
  private worker: Worker | null;
  private front = -1;
  private pending: { slot: number; fade: boolean; since: number } | null = null;
  // With the worker: the drawing it is making, and the next one wanted.
  private drawing: Request | null = null;
  private wanted: Request | null = null;
  private installed = false;
  private sun: [number, number] | null = null;
  private on = false;
  private fade = false;
  private drawnKey = "";
  private stale = true;
  private raf = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private buildings = new Map<string, ShadowTile>();
  private trees = new Map<string, ShadowTile>();
  private fadeMs: number;
  stats: ShadowStats = { collectMs: 0, drawMs: 0, uploadMs: 0, workerMs: 0, buildings: 0, trees: 0, canvas: [0, 0] };

  constructor(map: maplibregl.Map, fadeMs: number) {
    this.map = map;
    this.fadeMs = fadeMs;
    this.slots = ["a", "b"].map((k) => ({ id: `hb-shadows-${k}`, layer: `hb-shadows-${k}-layer`, key: "", ...surface() }));
    this.worker = startWorker();
    if (this.worker) {
      this.worker.onmessage = this.onDrawn;
      this.worker.onerror = this.onWorkerError;
    }
    map.on("render", this.onRender);
    map.on("moveend", this.onMoveEnd);
    map.on("sourcedata", this.onSourceData);
  }

  // Add the two canvas layers under layer `before`. A new style drops them, so this runs on every style load.
  install(before: string) {
    const map = this.map;
    const box = viewBox(map);
    const c = map.getCenter();
    const coords = corners(box ?? { x0: mercX(c.lng), y0: mercY(c.lat), x1: mercX(c.lng) + 1e-6, y1: mercY(c.lat) + 1e-6 });
    for (const s of this.slots) {
      if (!map.getSource(s.id)) map.addSource(s.id, { type: "canvas", canvas: s.canvas, coordinates: coords, animate: false });
      if (!map.getLayer(s.layer)) {
        map.addLayer(
          {
            id: s.layer,
            type: "raster",
            source: s.id,
            paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 0, delay: 0 }, "raster-fade-duration": 0 },
          },
          map.getLayer(before) ? before : undefined,
        );
      }
      s.key = box ? box.key : "";
    }
    this.installed = true;
    this.front = -1;
    this.pending = null;
    this.drawnKey = "";
    this.stale = true;
    this.schedule();
  }

  uninstall() {
    this.installed = false;
    this.pending = null;
  }

  // The chosen sun as [altitude, azimuth] in degrees, and whether shadows are on.
  set(sun: [number, number] | null, on: boolean) {
    const moved = !this.sun || !sun || this.sun[0] !== sun[0] || this.sun[1] !== sun[1];
    if (!moved && on === this.on) return;
    this.fade = moved && this.on && on && this.front >= 0;
    this.sun = sun;
    this.on = on;
    this.schedule();
  }

  remove() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.map.off("render", this.onRender);
    this.map.off("moveend", this.onMoveEnd);
    this.map.off("sourcedata", this.onSourceData);
  }

  private onMoveEnd = () => {
    this.stale = true;
    this.schedule();
  };

  // Tiles arrive in bursts; draw once a burst settles, not on every tile.
  private onSourceData = (e: maplibregl.MapSourceDataEvent) => {
    if ((e.sourceId !== BUILDINGS_SOURCE && e.sourceId !== TREES_SOURCE) || !e.tile) return;
    this.stale = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.schedule(), SETTLE_MS);
  };

  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.run();
    });
  }

  private visible() {
    return this.installed && this.on && !!this.sun && this.sun[0] > NIGHT_ALT_DEG;
  }

  private run() {
    const map = this.map;
    if (!this.installed) return;
    if (!this.visible()) {
      // A source left playing uploads its canvas every frame and keeps the map from going idle.
      if (this.pending) map.getSource<maplibregl.CanvasSource>(this.slots[this.pending.slot].id)?.pause();
      this.pending = null;
      this.wanted = null;
      for (let i = 0; i < 2; i++) this.opacity(i, 0, 0);
      this.front = -1;
      this.drawnKey = "";
      return;
    }
    // A moving camera ends with moveend, which comes back here.
    if (map.isMoving()) return;
    const box = viewBox(map);
    if (!box) return;
    const t0 = performance.now();
    if (this.stale) this.collect();
    this.stats.collectMs = performance.now() - t0;
    const sun = this.sun!;
    const key = `${box.key}|${sun[0]},${sun[1]}|${[...this.buildings.keys()]}|${[...this.trees.keys()]}`;
    this.stale = false;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const req = { box, sun, fade: this.fade };
    this.fade = false;
    if (this.worker) {
      this.wanted = req;
      this.post();
      return;
    }
    const t1 = performance.now();
    this.scratch ??= surface();
    const scratch = this.scratch;
    this.show(req, (slot) => {
      const n = drawShadows(slot, scratch, this.buildings.values(), this.trees.values(), box, sun);
      this.stats.buildings = n.buildings;
      this.stats.trees = n.trees;
    });
    this.stats.drawMs = performance.now() - t1;
  }

  // One drawing at a time in the worker; a request made meanwhile waits, and a newer one replaces it.
  private post() {
    if (this.drawing || !this.wanted || !this.worker) return;
    const req = this.wanted;
    this.wanted = null;
    this.drawing = req;
    const msg: ToWorker = { kind: "draw", box: req.box, sun: req.sun };
    this.worker.postMessage(msg);
  }

  private onDrawn = (e: MessageEvent<FromWorker>) => {
    const req = this.drawing;
    this.drawing = null;
    const { bitmap, ms, buildings, trees } = e.data;
    if (req && this.visible()) {
      const t0 = performance.now();
      this.show(req, (slot) => {
        slot.ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
        slot.ctx.drawImage(bitmap, 0, 0);
      });
      Object.assign(this.stats, { drawMs: performance.now() - t0, workerMs: ms, buildings, trees });
    }
    bitmap.close();
    this.post();
  };

  // Without a worker, draw on the main thread. Tiles sent to the worker left this thread, so read them again.
  private onWorkerError = () => {
    this.worker?.terminate();
    this.worker = null;
    this.drawing = null;
    this.wanted = null;
    this.buildings = new Map();
    this.trees = new Map();
    this.stale = true;
    this.drawnKey = "";
    this.schedule();
  };

  // Paint a picture into the hidden slot and start showing it once MapLibre holds it.
  private show(req: Request, paint: (slot: Slot) => void) {
    const next = this.front === 0 ? 1 : 0;
    const slot = this.slots[next];
    const src = this.map.getSource<maplibregl.CanvasSource>(slot.id);
    if (!src) return;
    // The hidden slot may still be fading out; cut it before it shows a half-made picture.
    this.opacity(next, 0, 0);
    if (slot.canvas.width !== req.box.w) slot.canvas.width = req.box.w;
    if (slot.canvas.height !== req.box.h) slot.canvas.height = req.box.h;
    paint(slot);
    this.stats.canvas = [req.box.w, req.box.h];
    if (slot.key !== req.box.key) {
      src.setCoordinates(corners(req.box));
      slot.key = req.box.key;
    }
    this.pending = { slot: next, fade: req.fade, since: performance.now() };
    src.play();
  }

  // Once the hidden source holds a tile for its corners, upload the canvas and swap it in.
  private onRender = () => {
    const p = this.pending;
    if (!p) return;
    const src = this.map.getSource<maplibregl.CanvasSource>(this.slots[p.slot].id);
    if (!src) return;
    if (!Object.values(src.tiles).some((t) => t.tileID.canonical.equals(src.tileID))) {
      // A playing source keeps the map from going idle. If its tile never comes, stop and let the next
      // camera move, tile or hour draw again.
      if (performance.now() - p.since < GIVE_UP_MS) return;
      src.pause();
      this.pending = null;
      this.stale = true;
      this.drawnKey = "";
      return;
    }
    // pause() uploads the canvas a last time, then stops uploading on every frame. A canvas may rasterise its
    // paths only now, so this time is part of the cost of a drawing.
    const t0 = performance.now();
    src.pause();
    this.stats.uploadMs = performance.now() - t0;
    this.pending = null;
    const ms = p.fade ? this.fadeMs : 0;
    this.opacity(p.slot, SHADOW_OPACITY, ms);
    if (this.front >= 0 && this.front !== p.slot) this.opacity(this.front, 0, ms);
    this.front = p.slot;
  };

  private opacity(i: number, v: number, ms: number) {
    const layer = this.slots[i].layer;
    if (!this.map.getLayer(layer)) return;
    this.map.setPaintProperty(layer, "raster-opacity-transition", { duration: ms, delay: 0 });
    this.map.setPaintProperty(layer, "raster-opacity", v);
  }

  // Footprints and crowns from the tiles MapLibre holds. A tile read once is kept until it leaves the view;
  // the worker gets each new tile once.
  private collect() {
    const b = readTiles(this.map, BUILDINGS_SOURCE, "buildings", this.buildings, readBuilding);
    const t = readTiles(this.map, TREES_SOURCE, "trees", this.trees, readCrown);
    this.buildings = b.tiles;
    this.trees = t.tiles;
    if (!this.worker) return;
    for (const [layer, r] of [
      ["buildings", b],
      ["trees", t],
    ] as const) {
      const msg: ToWorker = { kind: "tiles", layer, add: r.added, keep: [...r.tiles.keys()] };
      this.worker.postMessage(msg, r.added.flatMap((x) => [x.xy.buffer, x.rows.buffer]));
    }
  }
}

interface Builder {
  xy: number[];
  rows: number[];
  tallest: number;
}

type Reader = (f: maplibregl.GeoJSONFeature, b: Builder) => void;

// querySourceFeatures lists features tile by tile, so a tile already read is skipped with one comparison per feature.
function readTiles(map: maplibregl.Map, source: string, sourceLayer: string, cache: Map<string, ShadowTile>, read: Reader) {
  const tiles = new Map<string, ShadowTile>();
  const added: ShadowTile[] = [];
  if (!map.getSource(source)) return { tiles, added };
  let z = -1;
  let x = -1;
  let y = -1;
  let b: Builder | null = null;
  const done = () => {
    const t = added[added.length - 1];
    if (!b || !t) return;
    t.xy = new Float32Array(b.xy);
    t.rows = new Float64Array(b.rows);
    t.tallest = b.tallest;
    b = null;
  };
  for (const f of map.querySourceFeatures(source, { sourceLayer })) {
    if (f._z !== z || f._x !== x || f._y !== y) {
      done();
      z = f._z;
      x = f._x;
      y = f._y;
      const key = `${z}/${x}/${y}`;
      const kept = tiles.get(key) ?? cache.get(key);
      if (kept) {
        tiles.set(key, kept);
        continue;
      }
      const t: ShadowTile = { key, z, x, y, extent: f._vectorTileFeature.extent, xy: new Float32Array(0), rows: new Float64Array(0), tallest: 0 };
      tiles.set(key, t);
      added.push(t);
      b = { xy: [], rows: [], tallest: 0 };
    }
    if (b) read(f, b);
  }
  done();
  return { tiles, added };
}

// Raw tile geometry, in tile units, skips the per-point conversion to longitude and latitude that
// feature.geometry does; the canvas transform maps tile units straight to pixels.
function readBuilding(f: maplibregl.GeoJSONFeature, b: Builder) {
  const top = Number(f.properties.height_m);
  const base = Math.max(0, Number(f.properties.min_height_m) || 0);
  if (!(top > base)) return;
  let solid = 0;
  for (const ring of f._vectorTileFeature.loadGeometry()) {
    // Tile rings repeat their first point at the end.
    let n = ring.length;
    if (n > 1 && ring[0].x === ring[n - 1].x && ring[0].y === ring[n - 1].y) n--;
    if (n < 3) continue;
    const start = b.xy.length / 2;
    for (let i = 0; i < n; i++) b.xy.push(ring[i].x, ring[i].y);
    const sign = Math.sign(ringArea(b.xy, start, start + n));
    if (!sign) {
      b.xy.length = start * 2;
      continue;
    }
    // The first ring is an outer ring. Its sign marks the building's side for every ring of the feature,
    // since holes run the other way round; rings with that sign start new outer rings.
    if (!solid) solid = sign;
    b.rows.push(start, start + n, solid, sign === solid ? 1 : 0, base, top);
  }
  if (solid) b.tallest = Math.max(b.tallest, top);
}

function readCrown(f: maplibregl.GeoJSONFeature, b: Builder) {
  const r = Number(f.properties.r_m);
  const top = Number(f.properties.top_m);
  const base = Math.max(0, Number(f.properties.base_m) || 0);
  if (!(r > 0 && top > base)) return;
  for (const ring of f._vectorTileFeature.loadGeometry()) {
    for (const p of ring) b.rows.push(p.x, p.y, r, base, top);
  }
  b.tallest = Math.max(b.tallest, top);
}
