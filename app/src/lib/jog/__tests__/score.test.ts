/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DAY, makeData, NIGHT, THURSDAY, type EdgeSpec } from "../../router/__tests__/helpers";
import type { Data } from "../../router/types";
import { parseJog } from "../attrs";
import { streetsOf } from "../history";
import { measureLoop } from "../loops";
import { JOG_WEIGHTS } from "../score";
import type { JogQuery, RunRecord } from "../types";
import { rawJog, type RawJogOver } from "./fixtures";

// Acceptance for the loop score, SPEC J-S1 to J-S8 (app/src/lib/jog/SPEC.md). Lower is better. Each test
// scores two paths of the same length that differ in one thing.

const q = (over: Partial<JogQuery> = {}): JogQuery => ({
  start: 0, targetM: 400, dateIdx: THURSDAY, bucketIdx: DAY, departMin: 900, paceMinPerKm: 7, ...over,
});

function score(data: Data, over: RawJogOver, path: { edges: number[]; nodes: number[] }, query: Partial<JogQuery> = {}) {
  return measureLoop(data, parseJog(rawJog(data, over), data.edgeCount), path, q(query)).score;
}

// Main Road runs east: A (0, 0), B (200, 0), C (400, 0), with a north and a south sidewalk.
// Edges: 0 north A-B, 1 north B-C, 2 south A-B, 3 south B-C.
function road(bFlag: number, extra: Partial<EdgeSpec> = {}) {
  const side = (u: number, v: number, s: "left" | "right", x0: number, x1: number): EdgeSpec => ({
    u, v, name: "Main Road", way: 7, side: s, geom: [[x0, s === "left" ? 5 : -5], [x1, s === "left" ? 5 : -5]], ...extra,
  });
  return makeData({
    nodes: [[0, 0], [200, 0], [400, 0]],
    edges: [side(0, 1, "left", 0, 200), side(1, 2, "left", 200, 400), side(0, 1, "right", 0, 200), side(1, 2, "right", 200, 400)],
    nodeFlags: [4, bFlag, 4],
  });
}
const straight = { edges: [0, 1], nodes: [0, 1, 2] };
const switchAtB = { edges: [0, 3], nodes: [0, 1, 2] };

describe("loop score", () => {
  it("has one documented constant for every weight", () => {
    const src = readFileSync(new URL("../score.ts", import.meta.url), "utf8").split("\n");
    const keys = Object.keys(JOG_WEIGHTS);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const k of keys) {
      expect(typeof (JOG_WEIGHTS as Record<string, unknown>)[k]).toBe("number");
      const line = src.findIndex((l) => new RegExp(`^\\s*${k}\\s*:`).test(l));
      expect(line, k).toBeGreaterThan(0);
      expect(src[line - 1], `comment above ${k}`).toMatch(/\/\/|\*/);
    }
  });

  it("by day sun metres cost more, and in the dark shade adds nothing", () => {
    const sunny = road(5);
    const shady = makeData({
      nodes: [[0, 0], [200, 0], [400, 0]],
      edges: [0, 1, 2, 3].map((i) => ({ u: i % 2, v: (i % 2) + 1, name: "Main Road", way: 7, side: i < 2 ? "left" as const : "right" as const, building: 100 })),
      nodeFlags: [4, 5, 4],
    });
    expect(score(sunny, {}, straight)).toBeGreaterThan(score(shady, {}, straight));
    expect(score(sunny, {}, straight, { bucketIdx: NIGHT, departMin: 1110 })).toBeCloseTo(score(shady, {}, straight, { bucketIdx: NIGHT, departMin: 1110 }), 6);
  });

  it("an unmarked crossing loses to signals, and costs more across a bigger road", () => {
    const primary = { road: [5, 5, 5, 5] };
    const residential = { road: [2, 2, 2, 2] };
    expect(score(road(4), primary, switchAtB)).toBeGreaterThan(score(road(6), primary, switchAtB));
    expect(score(road(4), primary, switchAtB)).toBeGreaterThan(score(road(5), primary, switchAtB));
    // The extra cost of no marked crossing grows with the road's size.
    const gap = (over: RawJogOver) => score(road(4), over, switchAtB) - score(road(6), over, switchAtB);
    expect(gap(residential)).toBeGreaterThan(0);
    expect(gap(primary)).toBeGreaterThan(gap(residential));
    const m = measureLoop(road(4), parseJog(rawJog(road(4), primary), 4), switchAtB, q());
    expect(m.crossings.unmarked).toBe(1);
    expect(m.crossings.unmarkedBig).toBe(1);
    const s = measureLoop(road(6), parseJog(rawJog(road(6), primary), 4), switchAtB, q());
    expect(s.crossings.signals).toBe(1);
    expect(s.crossings.unmarked).toBe(0);
  });

  it("a sidewalk beside a primary road costs more than one beside a residential street", () => {
    expect(score(road(5), { road: [5, 5, 5, 5] }, straight)).toBeGreaterThan(score(road(5), { road: [2, 2, 2, 2] }, straight));
  });

  it("in a well-mapped area at night, lit=no costs most, untagged a third as much, lit nothing", () => {
    const night = { bucketIdx: NIGHT, departMin: 1110 };
    const lit = score(road(5), { lit: [1, 1, 1, 1], litShare: 0.4 }, straight, night);
    const unknown = score(road(5), { lit: [0, 0, 0, 0], litShare: 0.4 }, straight, night);
    const dark = score(road(5), { lit: [2, 2, 2, 2], litShare: 0.4 }, straight, night);
    expect(lit).toBeLessThan(unknown);
    expect(unknown).toBeLessThan(dark);
    expect((unknown - lit) / (dark - lit)).toBeCloseTo(1 / 3, 2);
    const m = measureLoop(road(5), parseJog(rawJog(road(5), { lit: [1, 1, 0, 0], litShare: 0.4 }), 4), straight, q(night));
    expect(m.lit_m).toBe(400);
    expect(m.unknownLit_m).toBe(0);
  });

  it("in a poorly mapped area light changes nothing", () => {
    const night = { bucketIdx: NIGHT, departMin: 1110 };
    const lit = score(road(5), { lit: [1, 1, 1, 1], litShare: 0.1 }, straight, night);
    const dark = score(road(5), { lit: [2, 2, 2, 2], litShare: 0.1 }, straight, night);
    expect(lit).toBeCloseTo(dark, 6);
  });

  it("streets in the runner's history cost more, half as much at night, nothing with Prefer new streets off", () => {
    const data = road(5);
    const history: RunRecord[] = [{ id: "r", area: "test", date: "2026-10-24", length_m: 400, streets: streetsOf(data, [0, 1]) }];
    const dayUp = score(data, {}, straight, { history }) - score(data, {}, straight);
    const night = { bucketIdx: NIGHT, departMin: 1110 };
    const nightUp = score(data, {}, straight, { history, ...night }) - score(data, {}, straight, night);
    expect(dayUp).toBeGreaterThan(0);
    expect(Math.abs(nightUp - dayUp / 2)).toBeLessThanOrEqual(0.1 * dayUp);
    expect(score(data, {}, straight, { history, preferNew: false })).toBeCloseTo(score(data, {}, straight), 6);
    const m = measureLoop(data, parseJog(rawJog(data), 4), straight, q({ history }));
    expect(m.new_pct).toBe(0);
    expect(m.shared_m).toBe(400);
  });

  it("parks, water and sights cost less, but a path never costs less than its length", () => {
    const plain = score(road(5), {}, straight);
    const sights = [{ name: "Test Memorial", kind: "historic", lon: 121.021, lat: 14.5501, src: "osm:n1" }];
    for (const over of [{ park: [1, 1, 1, 1] }, { water: [1, 1, 1, 1] }, { sight: [0, 0, -1, -1], sights }]) {
      const s = score(road(5), over, straight);
      expect(s).toBeLessThan(plain);
      expect(s).toBeGreaterThanOrEqual(400);
    }
    const m = measureLoop(road(5), parseJog(rawJog(road(5), { sight: [0, 0, -1, -1], sights }), 4), straight, q());
    expect(m.sights).toEqual(["Test Memorial"]);
  });

  it("more turns per km cost more", () => {
    // Straight: 0 to 4 east, 100 m each. Zigzag: east, north, east, south, the same 400 m.
    const data = makeData({
      nodes: [[0, 0], [100, 0], [200, 0], [300, 0], [400, 0], [100, 100], [200, 100]],
      edges: [{ u: 0, v: 1 }, { u: 1, v: 2 }, { u: 2, v: 3 }, { u: 3, v: 4 }, { u: 1, v: 5 }, { u: 5, v: 6 }, { u: 6, v: 2 }],
      nodeFlags: [5, 5, 5, 5, 5, 5, 5],
    });
    const flat = { edges: [0, 1, 2, 3], nodes: [0, 1, 2, 3, 4] };
    const zig = { edges: [0, 4, 5, 6], nodes: [0, 1, 5, 6, 2] };
    const a = measureLoop(data, parseJog(rawJog(data), 7), flat, q());
    const b = measureLoop(data, parseJog(rawJog(data), 7), zig, q());
    expect(a.length_m).toBe(b.length_m);
    expect(b.turnsPerKm).toBeGreaterThan(a.turnsPerKm);
    expect(b.score).toBeGreaterThan(a.score);
  });
});
