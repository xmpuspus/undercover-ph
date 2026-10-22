// Outline of the routing areas: the union of each area's graph boxes, so overlapping boxes draw one outer line
// rather than crossing lines inside the area.

export type Rect = [number, number, number, number];

// Closed rings ([lon, lat], first point repeated) around the union of west, south, east, north boxes.
export function rectsOutline(rects: Rect[]): [number, number][][] {
  const xs = [...new Set(rects.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r[1], r[3]]))].sort((a, b) => a - b);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  if (nx < 1 || ny < 1) return [];
  const covered = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    const x = (xs[i] + xs[i + 1]) / 2;
    const y = (ys[j] + ys[j + 1]) / 2;
    return rects.some((r) => r[0] < x && x < r[2] && r[1] < y && y < r[3]);
  };
  // Grid edges between a covered and an open cell, directed so the covered side is on the left.
  const key = (i: number, j: number) => i * (ny + 1) + j;
  const out = new Map<number, number[]>();
  const add = (a: [number, number], b: [number, number]) => {
    const k = key(...a);
    const list = out.get(k) ?? [];
    list.push(key(...b));
    out.set(k, list);
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (!covered(i, j)) continue;
      if (!covered(i, j - 1)) add([i, j], [i + 1, j]);
      if (!covered(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
      if (!covered(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
      if (!covered(i - 1, j)) add([i, j + 1], [i, j]);
    }
  }
  const pt = (k: number): [number, number] => [xs[Math.floor(k / (ny + 1))], ys[k % (ny + 1)]];
  const rings: [number, number][][] = [];
  for (const [start, list] of out) {
    while (list.length) {
      const ring = [start];
      let at = list.pop()!;
      while (at !== start) {
        ring.push(at);
        at = out.get(at)!.pop()!;
      }
      rings.push(simplify(ring.map(pt)));
    }
  }
  return rings;
}

// Drop points where the line runs straight on, then close the ring.
function simplify(ring: [number, number][]): [number, number][] {
  const n = ring.length;
  const keep = ring.filter((p, i) => {
    const a = ring[(i + n - 1) % n];
    const b = ring[(i + 1) % n];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
  return [...keep, keep[0]];
}
