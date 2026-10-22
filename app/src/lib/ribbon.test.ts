import { describe, expect, it } from "vitest";
import type { SegKind } from "../types";
import { lengthM, ribbonParts, sliceAlong } from "./ribbon";

// A north-running line in Makati: 1 degree of latitude is about 110.6 km.
const LAT0 = 14.55;
const LON = 121.02;
const at = (m: number): [number, number] => [LON, LAT0 + m / 110_574];
const seg = (from: number, to: number, kind: SegKind) => ({ coords: [at(from), at(to)], kind });

describe("ribbonParts", () => {
  it("sizes each part by its share of the walk's distance", () => {
    const parts = ribbonParts([seg(0, 100, "sun"), seg(100, 400, "tree")]);
    expect(parts.map((p) => p.kind)).toEqual(["sun", "tree"]);
    expect(parts[0].from).toBe(0);
    expect(parts[0].to).toBeCloseTo(0.25, 6);
    expect(parts[1].from).toBeCloseTo(0.25, 6);
    expect(parts[1].to).toBe(1);
    expect(parts[0].metres).toBeCloseTo(100, 1);
    expect(parts[1].metres).toBeCloseTo(300, 1);
  });

  it("merges neighbouring segments of the same kind and keeps walking order", () => {
    const parts = ribbonParts([seg(0, 50, "roof"), seg(50, 150, "roof"), seg(150, 200, "sun"), seg(200, 400, "roof")]);
    expect(parts.map((p) => p.kind)).toEqual(["roof", "sun", "roof"]);
    expect(parts[0].metres).toBeCloseTo(150, 1);
    expect(parts[0].coords).toHaveLength(3);
    expect(parts.map((p) => [p.from, p.to].map((v) => Math.round(v * 1000) / 1000))).toEqual([
      [0, 0.375],
      [0.375, 0.5],
      [0.5, 1],
    ]);
  });

  it("covers the whole walk with no gaps or overlaps", () => {
    const kinds: SegKind[] = ["sun", "building", "tree", "roof", "unchecked"];
    const segs = Array.from({ length: 23 }, (_, i) => seg(i * 37, (i + 1) * 37 + (i % 3) * 11, kinds[i % 5]));
    const parts = ribbonParts(segs);
    expect(parts[0].from).toBe(0);
    expect(parts[parts.length - 1].to).toBe(1);
    for (let i = 1; i < parts.length; i++) expect(parts[i].from).toBe(parts[i - 1].to);
    const total = parts.reduce((a, p) => a + p.metres, 0);
    for (const p of parts) expect(p.to - p.from).toBeCloseTo(p.metres / total, 9);
  });

  it("drops zero-length segments and returns nothing for an empty route", () => {
    expect(ribbonParts([seg(0, 0, "sun"), seg(0, 80, "roof")]).map((p) => p.kind)).toEqual(["roof"]);
    expect(ribbonParts([])).toEqual([]);
  });
});

describe("sliceAlong", () => {
  it("cuts a line at a distance, inside the edge where it runs out", () => {
    const line = [at(0), at(100), at(300)];
    expect(lengthM(sliceAlong(line, 150))).toBeCloseTo(150, 1);
    expect(sliceAlong(line, 150)).toHaveLength(3);
    expect(lengthM(sliceAlong(line, 1000))).toBeCloseTo(300, 1);
    expect(sliceAlong(line, 0)).toHaveLength(1);
  });
});
