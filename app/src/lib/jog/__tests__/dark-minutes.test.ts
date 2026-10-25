import { describe, expect, it } from "vitest";
import { makeData, THURSDAY } from "../../router/__tests__/helpers";
import { parseJog } from "../attrs";
import { findLoops, measureLoop } from "../loops";
import type { JogQuery } from "../types";
import { grid, rawJog } from "./fixtures";

// Acceptance for SPEC J-N4 (app/src/lib/jog/SPEC.md). Shade slots start at 06:00, but from April to September 06:00
// is 17 to 32 minutes after sunrise in Manila, so a slot's sun can be up while a 05:00 runner is in the dark. A loop
// is dark at every minute before sunrise or from sunset on, read from manifest.sunrise_sunset, whatever the slot.
// The helper manifest has sunrise 05:51, sunset 17:33, and slots 10:00 (sun 60), 15:00 (40), 18:00 (0), 18:30 (-5).

// A 4 km square, every edge fully shaded in the two day slots.
const square = makeData({
  nodes: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]],
  edges: [0, 1, 2, 3].map((i) => ({ u: i, v: (i + 1) % 4, building: [100, 100, 0, 0] })),
  nodeFlags: [5, 5, 5, 5],
});
const jog = parseJog(rawJog(square), square.edgeCount);
const path = { edges: [0, 1, 2, 3], nodes: [0, 1, 2, 3, 0] };
const q = (over: Partial<JogQuery>): JogQuery => ({ start: 0, targetM: 4000, dateIdx: THURSDAY, bucketIdx: 0, departMin: 600, paceMinPerKm: 10, ...over });

describe("a loop's darkness follows sunrise and sunset, not only the shade slot", () => {
  it("is dark at 05:00 even when the first slot's sun is up", () => {
    const m = measureLoop(square, jog, path, q({ departMin: 5 * 60 }));
    expect(m.dark).toBe(true);
    expect(m.shade_pct).toBeNull();
  });

  it("is not dark at 10:00, with the slot's shade", () => {
    const m = measureLoop(square, jog, path, q({ departMin: 10 * 60 }));
    expect(m.dark).toBe(false);
    expect(m.shade_pct).toBe(100);
  });

  it("turns dark when a 40-minute loop that starts at 17:00 runs past sunset at 17:33", () => {
    const m = measureLoop(square, jog, path, q({ departMin: 17 * 60, bucketIdx: 1 }));
    expect(m.dark).toBe(true);
  });

  it("findLoops reports a 05:00 search as dark", () => {
    const G = grid(12, 12, 100);
    const res = findLoops(G.data, parseJog(rawJog(G.data), G.data.edgeCount), {
      start: G.at(5, 5), targetM: 3000, dateIdx: THURSDAY, bucketIdx: 0, departMin: 5 * 60, paceMinPerKm: 7, seed: 1,
    });
    expect(res.loops.length).toBeGreaterThanOrEqual(1);
    expect(res.dark).toBe(true);
    for (const l of res.loops) expect(l.shade_pct).toBeNull();
  });
});
