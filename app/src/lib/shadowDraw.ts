import { capsuleEnds, shadowStep, traceCrown, traceRing } from "./shadowGeometry";

// Paints the ground shadows of tile footprints and crowns onto a canvas. It runs in the shadow worker, or on the
// main thread where a worker cannot draw, so it uses no DOM or MapLibre calls.

// The look of the pipeline's former overlay PNGs (shade.py OVERLAY_BLDG and OVERLAY_TREE): slate at 55% for
// buildings and green at 50% for trees, one colour per pixel with buildings on top. Buildings go on opaque and trees
// behind them at 50/55; the map layer applies the 55%.
export const SHADOW_OPACITY = 0.55;
const TREE_ALPHA = 0.5;
const BUILDING_FILL = "rgb(15,23,42)";
const TREE_FILL = "rgb(22,101,52)";
const EARTH_M = 40075016.686;
// Shapes per canvas fill. Chrome's path calls slow down as a path grows; about 50 shapes per fill was fastest.
const BATCH = 50;

export interface ShadowTile {
  key: string;
  z: number;
  x: number;
  y: number;
  extent: number;
  // Tile-unit points, flat [x, y, ...].
  xy: Float32Array;
  // Buildings: per ring [start, end, solid side, outer ring 0 or 1, base m, top m]. Trees: per crown [x, y, r m, base m, top m].
  rows: Float64Array;
  tallest: number;
}

// The canvas's ground in Web Mercator (0 to 1 across the world, y growing south) and its size in pixels.
export interface ShadowBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface Surface {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: Ctx;
}

const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - 90;

// Draws onto `out`, with `scratch` as a second canvas for the trees. Returns the footprint rings and crowns drawn.
export function drawShadows(
  out: Surface,
  scratch: Surface,
  buildings: Iterable<ShadowTile>,
  trees: Iterable<ShadowTile>,
  box: ShadowBox,
  sun: [number, number],
): { buildings: number; trees: number } {
  for (const c of [out.canvas, scratch.canvas]) {
    if (c.width !== box.w) c.width = box.w;
    if (c.height !== box.h) c.height = box.h;
  }
  const [se, sn] = shadowStep(sun[0], sun[1]);
  const reach = Math.hypot(se, sn);
  // Canvas pixels per world unit; the two differ only by the corner snapping.
  const kx = box.w / (box.x1 - box.x0);
  const ky = box.h / (box.y1 - box.y0);
  // fn gets the shadow step and the canvas box in tile units, tile units per metre, and pixels per tile unit.
  type Fn = (t: ShadowTile, dx: number, dy: number, clip: [number, number, number, number], upm: number, px: number) => void;
  const each = (g: Ctx, tiles: Iterable<ShadowTile>, fn: Fn) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.clearRect(0, 0, box.w, box.h);
    g.beginPath();
    for (const t of tiles) {
      const n = 2 ** t.z;
      const scale = n * t.extent;
      // Tile units per ground metre at the tile's middle.
      const upm = scale / (EARTH_M * Math.cos((latOf((t.y + 0.5) / n) * Math.PI) / 180));
      const pad = (t.tallest * reach * upm) / scale;
      if (t.x / n - pad > box.x1 || (t.x + 1) / n + pad < box.x0 || t.y / n - pad > box.y1 || (t.y + 1) / n + pad < box.y0) continue;
      // Path points take the transform as they are added, so tiles at different zooms share a path.
      g.setTransform(kx / scale, 0, 0, ky / scale, (t.x / n - box.x0) * kx, (t.y / n - box.y0) * ky);
      const clip: [number, number, number, number] = [(box.x0 * n - t.x) * t.extent, (box.y0 * n - t.y) * t.extent, (box.x1 * n - t.x) * t.extent, (box.y1 * n - t.y) * t.extent];
      // Tile y grows south, so the northward step flips.
      fn(t, se * upm, -sn * upm, clip, upm, kx / scale);
    }
    g.fill();
  };
  // A canvas path slows down with every shape it holds, so the shapes go in batches. Opaque batches cover their
  // union without darkening overlaps.
  let shapes = 0;
  const batch = (g: Ctx) => {
    if (++shapes % BATCH) return;
    g.fill();
    g.beginPath();
  };
  const ctx = out.ctx;
  let nb = 0;
  ctx.fillStyle = BUILDING_FILL;
  each(ctx, buildings, (t, dx, dy) => {
    const r = t.rows;
    for (let i = 0; i < r.length; i += 6) {
      traceRing(ctx, t.xy, r[i], r[i + 1], r[i + 2], r[i + 4], r[i + 5], dx, dy, r[i + 3] === 1 && r[i + 4] > 0);
      batch(ctx);
    }
    nb += r.length / 6;
  });
  // Trees go opaque on the second canvas first: one alpha for the whole canvas keeps overlapping crowns even.
  let nt = 0;
  const s = scratch.ctx;
  s.fillStyle = TREE_FILL;
  const ends = [2, 4, 8].map((k) => capsuleEnds(se, -sn, k));
  each(s, trees, (t, dx, dy, [cx0, cy0, cx1, cy1], upm, px) => {
    const r = t.rows;
    for (let i = 0; i < r.length; i += 5) {
      const x = r[i];
      const y = r[i + 1];
      const rad = r[i + 2] * upm;
      // Skip a crown whose whole shadow lies off the canvas.
      const ox = dx * r[i + 4];
      const oy = dy * r[i + 4];
      if (x + rad + Math.max(0, ox) < cx0 || x - rad + Math.min(0, ox) > cx1 || y + rad + Math.max(0, oy) < cy0 || y - rad + Math.min(0, oy) > cy1) continue;
      const onScreen = rad * px;
      traceCrown(s, x, y, rad, r[i + 3], r[i + 4], dx, dy, ends[onScreen < 2 ? 0 : onScreen < 5 ? 1 : 2]);
      batch(s);
      nt++;
    }
  });
  // Behind the building shadows, so a pixel shaded by both keeps the building colour.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "destination-over";
  ctx.globalAlpha = TREE_ALPHA / SHADOW_OPACITY;
  ctx.drawImage(scratch.canvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  return { buildings: nb, trees: nt };
}
