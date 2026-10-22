// Ground shadows of buildings and tree crowns for one sun position, traced as canvas paths.
// Any planar frame with square units works. A path in it is "positive" when its signed area
// (sum of x[i] * y[i+1] - x[i+1] * y[i]) is above zero. Every path traced here is positive, so one
// nonzero fill of many overlapping shadows covers their union and never cancels an overlap.

const RAD = Math.PI / 180;

// Shadow offset per metre of height, in metres east and north, for the sun at altitude alt and azimuth az
// (degrees, clockwise from north). The shadow points away from the sun.
export function shadowStep(alt: number, az: number): [number, number] {
  const k = 1 / Math.tan(alt * RAD);
  return [-Math.sin(az * RAD) * k, -Math.cos(az * RAD) * k];
}

// The calls a canvas context offers for paths. Tests record them instead.
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, from: number, to: number): void;
  closePath(): void;
}

// Twice the signed area of the ring of points from..to (exclusive) in a flat [x, y, x, y, ...] array.
export function ringArea(xy: ArrayLike<number>, from: number, to: number): number {
  let a = 0;
  for (let i = from; i < to; i++) {
    const j = i + 1 < to ? i + 1 : from;
    a += xy[2 * i] * xy[2 * j + 1] - xy[2 * j] * xy[2 * i + 1];
  }
  return a;
}

let facing = new Uint8Array(64);

// The shadow of one footprint ring between heights base and top, with (dx, dy) the shadow offset per metre of height.
// solid is +1 when the building lies on the positive side of the ring (a positive outer ring, or a hole traced
// the other way round), -1 otherwise. withFootprint adds the footprint itself at the base offset.
//
// The shadow is the footprint swept from the base offset to the top offset. A ground point under that sweep is either
// in the footprint at the base offset, or a footprint edge facing away from the sun passes over it. So the shadow is
// the footprint at the base offset plus one band per run of such edges, the run at the base offset joined to the
// same run at the top offset. Within a run every edge leans the same way across the sun direction, so a band never
// folds over itself. With base 0 the footprint sits under its own opaque building, and callers leave it out.
export function traceRing(
  sink: PathSink,
  xy: ArrayLike<number>,
  from: number,
  to: number,
  solid: number,
  base: number,
  top: number,
  dx: number,
  dy: number,
  withFootprint: boolean,
): void {
  const n = to - from;
  if (n < 3) return;
  const bx = dx * base;
  const by = dy * base;
  const tx = dx * top;
  const ty = dy * top;
  if (withFootprint) {
    // A positive ring keeps its order; a negative one is traced backwards.
    const fwd = ringArea(xy, from, to) > 0;
    for (let k = 0; k < n; k++) {
      const i = from + (fwd ? k : n - 1 - k);
      if (k === 0) sink.moveTo(xy[2 * i] + bx, xy[2 * i + 1] + by);
      else sink.lineTo(xy[2 * i] + bx, xy[2 * i + 1] + by);
    }
    sink.closePath();
  }
  if (facing.length < n) facing = new Uint8Array(n * 2);
  let start = -1;
  for (let k = 0; k < n; k++) {
    const i = from + k;
    const j = k + 1 < n ? i + 1 : from;
    const ex = xy[2 * j] - xy[2 * i];
    const ey = xy[2 * j + 1] - xy[2 * i + 1];
    // The edge's outward normal is solid * (ey, -ex); it faces away from the sun when it points along the shadow.
    facing[k] = solid * (ey * dx - ex * dy) > 0 ? 1 : 0;
    if (!facing[k]) start = k;
  }
  // Every closed ring has an edge facing the sun, unless the shadow has no length at all.
  if (start < 0) return;
  // Walk once round the ring from just after a sun-facing edge, so no run wraps past the walk's start.
  let run = -1;
  for (let s = 1; s <= n; s++) {
    const k = (start + s) % n;
    if (facing[k]) {
      if (run < 0) run = k;
      continue;
    }
    if (run >= 0) band(sink, xy, from, n, run, k, bx, by, tx, ty, solid > 0);
    run = -1;
  }
}

// One run of away-facing edges: points first..last of the ring, at the base offset one way and the top offset back.
// For solid +1 that order is negative, so it starts at the top offset instead.
function band(sink: PathSink, xy: ArrayLike<number>, from: number, n: number, first: number, last: number, bx: number, by: number, tx: number, ty: number, flip: boolean) {
  const m = (last - first + n) % n;
  const [ax, ay, cx, cy] = flip ? [tx, ty, bx, by] : [bx, by, tx, ty];
  for (let s = 0; s <= m; s++) {
    const i = from + ((first + s) % n);
    if (s === 0) sink.moveTo(xy[2 * i] + ax, xy[2 * i + 1] + ay);
    else sink.lineTo(xy[2 * i] + ax, xy[2 * i + 1] + ay);
  }
  for (let s = m; s >= 0; s--) {
    const i = from + ((first + s) % n);
    sink.lineTo(xy[2 * i] + cx, xy[2 * i + 1] + cy);
  }
  sink.closePath();
}

// Unit vectors round the two ends of a crown's shadow, for traceCrown: the far half circle, then the near one,
// steps chords each, with growing angle. Arcs cost a canvas about twice as much as a few straight chords.
export function capsuleEnds(dx: number, dy: number, steps: number): Float64Array {
  const a = Math.atan2(dy, dx);
  const out = new Float64Array(4 * (steps + 1));
  for (let i = 0; i <= steps; i++) {
    const far = a - Math.PI / 2 + (i * Math.PI) / steps;
    out[2 * i] = Math.cos(far);
    out[2 * i + 1] = Math.sin(far);
    out[2 * (steps + 1 + i)] = Math.cos(far + Math.PI);
    out[2 * (steps + 1 + i) + 1] = Math.sin(far + Math.PI);
  }
  return out;
}

// The shadow of a crown disc of radius r between heights base and top: the disc swept from the base offset to the
// top offset, a capsule. With ends from capsuleEnds the round ends are chords; without, arcs. Both run with growing
// angle, which keeps the path positive.
export function traceCrown(sink: PathSink, x: number, y: number, r: number, base: number, top: number, dx: number, dy: number, ends?: Float64Array): void {
  const x1 = x + dx * top;
  const y1 = y + dy * top;
  const x0 = x + dx * base;
  const y0 = y + dy * base;
  if (ends) {
    const half = ends.length / 2;
    sink.moveTo(x1 + r * ends[0], y1 + r * ends[1]);
    for (let i = 2; i < half; i += 2) sink.lineTo(x1 + r * ends[i], y1 + r * ends[i + 1]);
    for (let i = half; i < ends.length; i += 2) sink.lineTo(x0 + r * ends[i], y0 + r * ends[i + 1]);
    sink.closePath();
    return;
  }
  const a = Math.atan2(dy, dx);
  sink.moveTo(x1 + r * Math.sin(a), y1 - r * Math.cos(a));
  sink.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
  sink.arc(x0, y0, r, a + Math.PI / 2, a + (3 * Math.PI) / 2);
  sink.closePath();
}
