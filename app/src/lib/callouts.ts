// Callout placement for the route bubbles.
// Each route gets an anchor on a part of it that the other routes do not share,
// then a bubble beside that anchor that stays inside the safe rectangle and off the other bubbles.

type LL = [number, number];

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function toXY(p: LL, lat0: number): [number, number] {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return [p[0] * 111320 * k, p[1] * 110540];
}

function distToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function resample(xy: [number, number][], ll: LL[], step: number): { xy: [number, number]; ll: LL; along: number }[] {
  const out: { xy: [number, number]; ll: LL; along: number }[] = [];
  let along = 0;
  for (let i = 1; i < xy.length; i++) {
    const seg = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
    const n = Math.max(1, Math.ceil(seg / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push({
        xy: [xy[i - 1][0] + t * (xy[i][0] - xy[i - 1][0]), xy[i - 1][1] + t * (xy[i][1] - xy[i - 1][1])],
        ll: [ll[i - 1][0] + t * (ll[i][0] - ll[i - 1][0]), ll[i - 1][1] + t * (ll[i][1] - ll[i - 1][1])],
        along: along + t * seg,
      });
    }
    along += seg;
  }
  if (ll.length) out.push({ xy: xy[xy.length - 1], ll: ll[ll.length - 1], along });
  return out;
}

// Candidate anchors per route, best first: far from the other routes, away from the shared ends.
export function anchorCandidates(routes: LL[][]): LL[][] {
  if (!routes.length || !routes[0].length) return routes.map(() => []);
  const lat0 = routes[0][0][1];
  const xys = routes.map((r) => r.map((p) => toXY(p, lat0)));
  return routes.map((r, i) => {
    const samples = resample(xys[i], r, 12);
    const total = samples.length ? samples[samples.length - 1].along : 0;
    const scored = samples
      .filter((s) => s.along > total * 0.12 && s.along < total * 0.88)
      .map((s) => {
        let d = Infinity;
        xys.forEach((other, j) => {
          if (j === i) return;
          for (let k = 1; k < other.length; k++) d = Math.min(d, distToSegment(s.xy, other[k - 1], other[k]));
        });
        // Prefer unshared parts; among those, prefer points nearer the middle of the walk.
        const mid = 1 - Math.abs(s.along / Math.max(total, 1) - 0.5);
        return { ll: s.ll, score: Math.min(d, 60) + mid * 10 };
      })
      .sort((a, b) => b.score - a.score);
    const picks = scored.filter((_, k) => k % 3 === 0).slice(0, 40).map((s) => s.ll);
    const middle = samples[Math.floor(samples.length / 2)]?.ll;
    if (middle) picks.push(middle);
    return picks;
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

function overlaps(a: Rect, b: Rect, pad = 6): boolean {
  return a.left < b.right + pad && a.right + pad > b.left && a.top < b.bottom + pad && a.bottom + pad > b.top;
}

function inside(r: Rect, safe: Rect): boolean {
  return r.left >= safe.left && r.top >= safe.top && r.right <= safe.right && r.bottom <= safe.bottom;
}

// Place one bubble per anchor. Bubbles stay inside `safe` and off each other and the obstacles (the pins).
export function placeBubbles(
  anchors: ({ x: number; y: number } | null)[],
  safe: Rect,
  w: number,
  h: number,
  order: number[],
  obstacles: Rect[] = [],
): (Rect | null)[] {
  const placed: (Rect | null)[] = anchors.map(() => null);
  const gap = 18;
  for (const i of order) {
    const a = anchors[i];
    if (!a) continue;
    const offsets: [number, number][] = [
      [gap, -h - gap],
      [-w - gap, -h - gap],
      [gap, gap],
      [-w - gap, gap],
      [gap + 8, -h / 2],
      [-w - gap - 8, -h / 2],
      [-w / 2, -h - gap - 10],
      [-w / 2, gap + 10],
    ];
    const others = [...obstacles, ...placed.filter((p): p is Rect => p !== null)];
    let best: Rect | null = null;
    for (const [dx, dy] of offsets) {
      const r = { left: a.x + dx, top: a.y + dy, right: a.x + dx + w, bottom: a.y + dy + h };
      if (inside(r, safe) && !others.some((o) => overlaps(o, r))) {
        best = r;
        break;
      }
    }
    if (!best) {
      // Clamp the first choice into the safe area, then scan up and down for a free slot.
      // A bubble that still finds no free slot is left out, so bubbles never cover each other;
      // only the first in the order (the selected route) is kept anyway, if the map strip is tall enough for it.
      const left = clamp(a.x + gap, safe.left, safe.right - w);
      const top0 = clamp(a.y - h - gap, safe.top, safe.bottom - h);
      const tops = [top0];
      for (let k = 1; k < 10; k++) tops.push(top0 + k * (h + 8), top0 - k * (h + 8));
      best =
        tops
          .map((t) => ({ left, top: t, right: left + w, bottom: t + h }))
          .find((r) => inside(r, safe) && !others.some((o) => overlaps(o, r))) ??
        (i === order[0] && inside({ left, top: top0, right: left + w, bottom: top0 + h }, safe) ? { left, top: top0, right: left + w, bottom: top0 + h } : null);
    }
    placed[i] = best;
  }
  return placed;
}

// Point on the rectangle edge nearest to p, for the leader line.
export function nearestOnRect(p: { x: number; y: number }, r: Rect): { x: number; y: number } {
  return { x: Math.min(Math.max(p.x, r.left), r.right), y: Math.min(Math.max(p.y, r.top), r.bottom) };
}
