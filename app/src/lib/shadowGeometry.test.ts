import { describe, expect, it } from "vitest";
import { capsuleEnds, ringArea, shadowStep, traceCrown, traceRing, type PathSink } from "./shadowGeometry";

// Records traced paths as closed polygons, with each arc cut into short chords.
function recorder() {
  const paths: [number, number][][] = [];
  let cur: [number, number][] = [];
  const sink: PathSink = {
    moveTo(x, y) {
      cur = [[x, y]];
      paths.push(cur);
    },
    lineTo(x, y) {
      cur.push([x, y]);
    },
    arc(x, y, r, from, to) {
      for (let i = 0; i <= 64; i++) {
        const a = from + ((to - from) * i) / 64;
        cur.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
      }
    },
    closePath() {},
  };
  return { sink, paths };
}

function area(p: [number, number][]) {
  return ringArea(p.flat(), 0, p.length);
}

// Nonzero winding of all paths together, as a canvas fill counts it.
function winding(paths: [number, number][][], x: number, y: number) {
  let w = 0;
  for (const p of paths) {
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i];
      const [x1, y1] = p[(i + 1) % p.length];
      const cross = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
      if (y0 <= y && y1 > y && cross > 0) w++;
      else if (y1 <= y && y0 > y && cross < 0) w--;
    }
  }
  return w;
}

const inShadow = (paths: [number, number][][], x: number, y: number) => winding(paths, x, y) !== 0;

// A 10 m square, east and north in metres, traced with a positive area.
const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10];

describe("shadowStep", () => {
  it("points away from the sun, one metre per metre of height at 45 degrees", () => {
    const [e, n] = shadowStep(45, 90);
    expect(e).toBeCloseTo(-1, 9);
    expect(n).toBeCloseTo(0, 9);
    const [e2, n2] = shadowStep(45, 180);
    expect(e2).toBeCloseTo(0, 9);
    expect(n2).toBeCloseTo(1, 9);
  });
});

describe("traceRing", () => {
  it("a 10 m building with the sun 45 degrees up in the east casts a 10 m shadow to the west", () => {
    const { sink, paths } = recorder();
    const [dx, dy] = shadowStep(45, 90);
    traceRing(sink, SQUARE, 0, 4, 1, 0, 10, dx, dy, false);
    // The ground shadow is the 10 m by 10 m square west of the building: area 100 m2 (signed area counts twice).
    const total = paths.reduce((s, p) => s + area(p), 0) / 2;
    expect(total).toBeCloseTo(100, 6);
    expect(Math.min(...paths.flat().map((p) => p[0]))).toBeCloseTo(-10, 6);
    for (const y of [0.5, 5, 9.5]) {
      expect(inShadow(paths, -0.5, y)).toBe(true);
      expect(inShadow(paths, -9.5, y)).toBe(true);
      expect(inShadow(paths, -10.5, y)).toBe(false);
    }
    expect(inShadow(paths, -5, -0.5)).toBe(false);
    expect(inShadow(paths, -5, 10.5)).toBe(false);
    expect(inShadow(paths, 10.5, 5)).toBe(false);
    for (const p of paths) expect(area(p)).toBeGreaterThan(0);
  });

  it("an oblique sun covers the whole swept footprint, and every path stays positive", () => {
    const { sink, paths } = recorder();
    // Sun in the south-east at 30 degrees: the shadow falls north-west, about 1.73 m per metre of height.
    const [dx, dy] = shadowStep(30, 135);
    traceRing(sink, SQUARE, 0, 4, 1, 0, 10, dx, dy, false);
    const far = [5 + 10 * dx, 5 + 10 * dy];
    expect(inShadow(paths, far[0], far[1])).toBe(true);
    expect(inShadow(paths, 5 + 5 * dx, 5 + 5 * dy)).toBe(true);
    expect(inShadow(paths, 12, -2)).toBe(false);
    for (const p of paths) expect(area(p)).toBeGreaterThan(0);
  });

  it("a ring traced the other way round gives the same shadow", () => {
    const back = [0, 10, 10, 10, 10, 0, 0, 0];
    const a = recorder();
    const b = recorder();
    const [dx, dy] = shadowStep(40, 250);
    traceRing(a.sink, SQUARE, 0, 4, 1, 0, 12, dx, dy, false);
    traceRing(b.sink, back, 0, 4, -1, 0, 12, dx, dy, false);
    for (const [x, y] of [
      [15, 5],
      [20, 8],
      [11, 1],
      [-1, 5],
      [25, 12],
    ]) {
      expect(inShadow(b.paths, x, y)).toBe(inShadow(a.paths, x, y));
    }
    for (const p of b.paths) expect(area(p)).toBeGreaterThan(0);
  });

  it("an L-shaped footprint shades its inner corner", () => {
    const { sink, paths } = recorder();
    const ell = [0, 0, 20, 0, 20, 5, 5, 5, 5, 20, 0, 20];
    // Sun due south, so the shadow falls north; the short wing's shadow lands in the corner.
    const [dx, dy] = shadowStep(45, 180);
    traceRing(sink, ell, 0, 6, 1, 0, 8, dx, dy, false);
    expect(inShadow(paths, 12, 9)).toBe(true);
    expect(inShadow(paths, 12, 14)).toBe(false);
    expect(inShadow(paths, 2, 27)).toBe(true);
    for (const p of paths) expect(area(p)).toBeGreaterThan(0);
  });

  it("a courtyard's east wall shades the courtyard floor when its ring takes the building's side", () => {
    const { sink, paths } = recorder();
    // Outer ring positive, hole traced the other way round, as in a vector tile; both get the outer ring's side.
    const outer = [0, 0, 30, 0, 30, 30, 0, 30];
    const hole = [10, 10, 10, 20, 20, 20, 20, 10];
    const [dx, dy] = shadowStep(45, 90);
    traceRing(sink, outer, 0, 4, 1, 0, 5, dx, dy, false);
    traceRing(sink, hole, 0, 4, 1, 0, 5, dx, dy, false);
    expect(inShadow(paths, 17, 15)).toBe(true);
    expect(inShadow(paths, 12, 15)).toBe(false);
    expect(inShadow(paths, -3, 15)).toBe(true);
    for (const p of paths) expect(area(p)).toBeGreaterThan(-1e-9);
  });

  it("a raised deck shades the ground from its base offset, not right under its sunny edge", () => {
    const { sink, paths } = recorder();
    const [dx, dy] = shadowStep(45, 90);
    // A deck from 5 m to 6 m up: its shadow spans 6 m to 5 m west of each point of it.
    traceRing(sink, SQUARE, 0, 4, 1, 5, 6, dx, dy, true);
    expect(inShadow(paths, 7, 5)).toBe(false);
    expect(inShadow(paths, 2, 5)).toBe(true);
    expect(inShadow(paths, -2, 5)).toBe(true);
    expect(inShadow(paths, -5.5, 5)).toBe(true);
    expect(inShadow(paths, -6.5, 5)).toBe(false);
    for (const p of paths) expect(area(p)).toBeGreaterThan(0);
  });
});

describe("traceCrown", () => {
  it("a crown casts a capsule from its base offset to its top offset", () => {
    const { sink, paths } = recorder();
    const [dx, dy] = shadowStep(45, 90);
    // Radius 2 m, from 2 m to 8 m up: discs centred 2 m and 8 m west, joined.
    traceCrown(sink, 0, 0, 2, 2, 8, dx, dy);
    expect(paths).toHaveLength(1);
    expect(area(paths[0])).toBeGreaterThan(0);
    expect(inShadow(paths, -5, 1.9)).toBe(true);
    expect(inShadow(paths, -5, 2.1)).toBe(false);
    expect(inShadow(paths, -9.9, 0)).toBe(true);
    expect(inShadow(paths, -10.1, 0)).toBe(false);
    expect(inShadow(paths, -0.1, 0)).toBe(true);
    // Round ends, not a box: the corners next to each end disc stay lit.
    expect(inShadow(paths, -1, 1.9)).toBe(false);
    expect(inShadow(paths, -9, 1.9)).toBe(false);
    // The ground under the crown is lit at this sun, since the crown starts 2 m up.
    expect(inShadow(paths, 0.5, 0)).toBe(false);
  });

  it("chord ends trace the same capsule as arcs, also positive", () => {
    const { sink, paths } = recorder();
    const [dx, dy] = shadowStep(45, 90);
    traceCrown(sink, 0, 0, 2, 2, 8, dx, dy, capsuleEnds(dx, dy, 16));
    expect(area(paths[0])).toBeGreaterThan(0);
    for (const [x, y, inside] of [
      [-5, 1.9, true],
      [-5, 2.1, false],
      [-9.9, 0, true],
      [-10.1, 0, false],
      [-0.1, 0, true],
      [-1, 1.9, false],
      [0.5, 0, false],
    ] as const) {
      expect(inShadow(paths, x, y)).toBe(inside);
    }
  });

  it("with the sun overhead the shadow is the disc", () => {
    const { sink, paths } = recorder();
    const [dx, dy] = shadowStep(89.999, 0);
    traceCrown(sink, 0, 0, 3, 1, 9, dx, dy);
    expect(inShadow(paths, 0, 2.9)).toBe(true);
    expect(inShadow(paths, 2.9, 0)).toBe(true);
    expect(inShadow(paths, 3.1, 0)).toBe(false);
  });
});
