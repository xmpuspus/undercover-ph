import { describe, expect, it } from "vitest";
import { rectsOutline } from "./areaOutline";

describe("rectsOutline", () => {
  it("draws one box as its four corners, closed", () => {
    const rings = rectsOutline([[0, 0, 2, 1]]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
    expect(rings[0][0]).toEqual(rings[0][4]);
    expect(new Set(rings[0].map((p) => p.join(",")))).toEqual(new Set(["0,0", "2,0", "2,1", "0,1"]));
  });

  it("joins overlapping boxes into one outline with no inner lines", () => {
    const rings = rectsOutline([
      [0, 0, 2, 2],
      [1, 1, 3, 3],
    ]);
    expect(rings).toHaveLength(1);
    // Eight corners of the stepped shape, plus the closing point.
    expect(rings[0]).toHaveLength(9);
    const pts = rings[0].map((p) => p.join(","));
    expect(pts).not.toContain("1,1");
    expect(pts).not.toContain("2,2");
    expect(pts).toContain("2,1");
    expect(pts).toContain("1,2");
  });

  it("keeps separate boxes separate, and a box inside another adds nothing", () => {
    expect(
      rectsOutline([
        [0, 0, 1, 1],
        [5, 5, 6, 6],
      ]),
    ).toHaveLength(2);
    const rings = rectsOutline([
      [0, 0, 4, 4],
      [1, 1, 2, 2],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
  });

  it("joins metro-core's seven graph boxes into one outline", () => {
    // graph_rects of metro-core in pipeline/areas.json (2026-10-22).
    const rings = rectsOutline([
      [121.0074, 14.5435, 121.0366, 14.5665],
      [121.0194, 14.5555, 121.0466, 14.5765],
      [121.0354, 14.5285, 121.0666, 14.5675],
      [121.0254, 14.5635, 121.0566, 14.5895],
      [121.0454, 14.5575, 121.0726, 14.5985],
      [121.0654, 14.5485, 121.0946, 14.5745],
      [121.0354, 14.5895, 121.0626, 14.6125],
    ]);
    expect(rings).toHaveLength(1);
    const lons = rings[0].map((p) => p[0]);
    const lats = rings[0].map((p) => p[1]);
    expect([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]).toEqual([121.0074, 14.5285, 121.0946, 14.6125]);
  });

  it("returns nothing for no boxes", () => {
    expect(rectsOutline([])).toEqual([]);
  });
});
