import type { SegKind } from "../types";

type LL = [number, number];

// Metres between two lon/lat points. Equirectangular is exact enough over a few hundred metres.
export function distM(a: LL, b: LL): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k * 111_320, (b[1] - a[1]) * 110_574);
}

export function lengthM(coords: LL[]): number {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += distM(coords[i - 1], coords[i]);
  return m;
}

// The first m metres of a line, cut inside the edge where m runs out.
export function sliceAlong(coords: LL[], m: number): LL[] {
  if (coords.length < 2 || m <= 0) return coords.slice(0, 1);
  const out: LL[] = [coords[0]];
  let left = m;
  for (let i = 1; i < coords.length; i++) {
    const d = distM(coords[i - 1], coords[i]);
    if (d >= left) {
      const t = d > 0 ? left / d : 0;
      const [a, b] = [coords[i - 1], coords[i]];
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return out;
    }
    out.push(coords[i]);
    left -= d;
  }
  return out;
}

export interface RibbonPart {
  kind: SegKind;
  // Share of the walk from the start, 0 to 1.
  from: number;
  to: number;
  metres: number;
  coords: LL[];
}

// The walk as runs of one cover kind, in walking order, each sized by its distance.
// Neighbouring segments of the same kind merge into one run.
export function ribbonParts(segments: { coords: LL[]; kind: SegKind }[]): RibbonPart[] {
  const runs: { kind: SegKind; metres: number; coords: LL[] }[] = [];
  for (const s of segments) {
    const m = lengthM(s.coords);
    if (m <= 0) continue;
    const last = runs[runs.length - 1];
    if (last && last.kind === s.kind) {
      last.metres += m;
      last.coords = [...last.coords, ...s.coords.slice(1)];
    } else runs.push({ kind: s.kind, metres: m, coords: s.coords });
  }
  const total = runs.reduce((a, r) => a + r.metres, 0);
  let at = 0;
  return runs.map((r) => {
    const from = at / total;
    at += r.metres;
    return { ...r, from, to: at / total };
  });
}
