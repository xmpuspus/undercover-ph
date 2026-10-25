import { expect, it, vi } from "vitest";
import { aStar } from "../router/astar";
import { grid, rawJog } from "./__tests__/fixtures";
import { parseJog } from "./attrs";
import { findLoops } from "./loops";

vi.mock("../router/astar", async (original) => {
  const actual = await original<typeof import("../router/astar")>();
  return { ...actual, aStar: vi.fn(actual.aStar) };
});

it("keeps loop legs out of streets that cannot fit the distance, while retaining the tolerance boundary", () => {
  const { data, at } = grid(20, 20, 50);
  const edge = (u: number, v: number) => Array.from(data.edgeU).findIndex((from, e) => from === u && data.edgeV[e] === v);
  // The boundary street needs 500 m out, 50 m along it and 550 m back: exactly 1.1 km.
  const boundary = edge(at(10, 0), at(11, 0));
  const distant = edge(at(18, 18), at(19, 18));
  const jog = parseJog(rawJog(data, { road: Array(data.edgeCount).fill(5) }), data.edgeCount);
  vi.mocked(aStar).mockClear();
  const result = findLoops(data, jog, { start: at(0, 0), targetM: 1000, dateIdx: 0, bucketIdx: 0, departMin: 600, paceMinPerKm: 7 });
  expect(result.loops.length).toBeGreaterThan(0);
  expect(aStar).toHaveBeenCalled();
  for (const [, spec] of vi.mocked(aStar).mock.calls) {
    expect(spec.allowed[distant], "A* must not expand streets outside every feasible loop").toBe(0);
    expect(spec.allowed[boundary], "Road costs must not exclude a street at the length boundary").toBe(1);
  }
  for (const [, , , target, , options] of vi.mocked(aStar).mock.calls) {
    expect(options?.potential?.[target], "Each leg needs a bound rooted at its own destination").toBe(0);
  }
  for (const loop of result.loops) expect(Math.abs(loop.length_m - 1000)).toBeLessThanOrEqual(100);
});
