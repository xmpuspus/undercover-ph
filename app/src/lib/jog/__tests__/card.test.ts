import { describe, expect, it } from "vitest";
import { DAY, edgeIdx, makeData, NIGHT, THURSDAY } from "../../router/__tests__/helpers";
import { parseJog, sightGrade } from "../attrs";
import { JOG_COPY, loopFacts } from "../copy";
import { findLoops, measureLoop } from "../loops";
import type { JogQuery } from "../types";
import { grid, rawJog } from "./fixtures";

// Acceptance for the loop card text, SPEC J-U1, J-U3, J-N1, J-N2, J-C1 and J-C2 (app/src/lib/jog/SPEC.md).
// Xavier approved these four lines on 2026-10-24.

describe("card copy", () => {
  it("keeps the approved lines word for word", () => {
    expect(JOG_COPY.safety).toBe("Safety here means traffic: crossings and road size. We have no crime data.");
    expect(JOG_COPY.dark).toBe("Shade does not apply before sunrise or after sunset.");
    expect(JOG_COPY.lightsUnknown).toBe("Street lights are not mapped on most streets here.");
    expect(JOG_COPY.fewSights).toBe("Few sights are mapped here.");
  });
});

describe("loopFacts", () => {
  const G = grid(12, 12, 100);
  const jog = parseJog(rawJog(G.data), G.data.edgeCount);
  const q = (over: Partial<JogQuery> = {}): JogQuery => ({
    start: G.at(5, 5), targetM: 3000, dateIdx: THURSDAY, bucketIdx: DAY, departMin: 900, paceMinPerKm: 7, seed: 1, ...over,
  });
  const day = findLoops(G.data, jog, q()).loops[0];
  const night = findLoops(G.data, jog, q({ bucketIdx: NIGHT, departMin: 1110 })).loops[0];

  it("gives distance, minutes and the safety line on every card", () => {
    const lines = loopFacts(day, { litShare: 0.4, grade: "rich" });
    const text = lines.join("\n");
    expect(text).toContain(`${(day.length_m / 1000).toFixed(1)} km`);
    expect(text).toContain(`${day.minutes} min`);
    expect(lines).toContain(JOG_COPY.safety);
    expect(text).toMatch(/[Ss]hade \d+%/);
    expect(lines).not.toContain(JOG_COPY.dark);
  });

  it("says shade does not apply in the dark, and names unmapped lights where few are mapped", () => {
    const mapped = loopFacts(night, { litShare: 0.4, grade: "rich" });
    expect(mapped).toContain(JOG_COPY.dark);
    expect(mapped).not.toContain(JOG_COPY.lightsUnknown);
    expect(mapped.join("\n")).toMatch(/mapped as lit/);
    const unmapped = loopFacts(night, { litShare: 0.1, grade: "rich" });
    expect(unmapped).toContain(JOG_COPY.lightsUnknown);
    expect(unmapped.join("\n")).not.toMatch(/[Ss]hade \d+%/);
  });

  it("says few sights are mapped in a thin area", () => {
    expect(loopFacts(day, { litShare: 0.4, grade: "thin" })).toContain(JOG_COPY.fewSights);
    expect(loopFacts(day, { litShare: 0.4, grade: "some" })).not.toContain(JOG_COPY.fewSights);
  });

  it("gives the new-streets share only when there is a history", () => {
    expect(day.new_pct).toBeNull();
    expect(loopFacts(day, { litShare: 0.4, grade: "rich" }).join("\n")).not.toMatch(/new streets/i);
    const withHistory = { ...day, new_pct: 80, shared_m: 600 };
    expect(loopFacts(withHistory, { litShare: 0.4, grade: "rich" }).join("\n")).toMatch(/80% new streets/);
  });

  it("names crossings by type", () => {
    const text = loopFacts({ ...day, crossings: { signals: 2, marked: 1, unmarked: 1, unmarkedBig: 0 } }, { litShare: 0.4, grade: "rich" }).join("\n");
    expect(text).toMatch(/2 with signals/);
    expect(text).toMatch(/1 marked/);
    expect(text).toMatch(/1 without a marked crossing/);
  });

  it("keeps the Filipino and Taglish step lines", () => {
    expect(day.steps.length).toBeGreaterThan(0);
    for (const s of day.steps) {
      expect(s.text.length).toBeGreaterThan(0);
      expect(s.textTl.length).toBeGreaterThan(0);
    }
    const again = measureLoop(G.data, jog, { edges: edgeIdx(day.edgeIds), nodes: day.nodes }, q());
    expect(again.steps.map((s) => s.textTl)).toEqual(day.steps.map((s) => s.textTl));
  });
});

describe("parseJog and sightGrade", () => {
  const data = makeData({ nodes: [[0, 0], [100, 0], [200, 0]], edges: [{ u: 0, v: 1 }, { u: 1, v: 2 }] });

  it("accepts a jog file whose arrays match the graph", () => {
    expect(parseJog(rawJog(data), data.edgeCount)).not.toBeNull();
  });

  it("refuses a file for another graph, another version or broken arrays", () => {
    expect(parseJog(rawJog(data), 3)).toBeNull();
    expect(parseJog({ ...rawJog(data), version: 2 }, 2)).toBeNull();
    const broken = rawJog(data);
    (broken.edges as Record<string, unknown>).lit = ["x", "y"];
    expect(parseJog(broken, 2)).toBeNull();
    expect(parseJog(null, 2)).toBeNull();
    expect(parseJog("not json", 2)).toBeNull();
  });

  it("grades sights per km2 of the graph box, times the 0.5 km2 a 5 km loop passes", () => {
    // The helper box is about 3.15 km by 2.54 km, 8.0 km2.
    const sights = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Sight ${i}`, kind: "historic", lon: 121.02, lat: 14.55, src: `osm:n${i}` }));
    const grade = (n: number) => sightGrade(parseJog(rawJog(data, { sights: sights(n) }), 2)!, data);
    expect(grade(0)).toBe("thin");
    expect(grade(10)).toBe("thin");
    expect(grade(20)).toBe("some");
    expect(grade(60)).toBe("rich");
  });
});
