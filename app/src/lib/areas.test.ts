import { describe, expect, it } from "vitest";
import type { AreaInfo } from "../types";
import { areaAt, areaCities, areaLabel, areaList, placeWhere } from "./areas";

// Two areas whose graph boxes overlap, as Greenhills (metro-core) and Cubao do.
const core: AreaInfo = {
  id: "metro-core",
  name: "Makati, BGC, Ortigas and Shaw",
  cities: ["Makati", "Taguig"],
  bbox: [121.012, 14.533, 121.09, 14.608],
  graph_bbox: [121.0074, 14.5285, 121.0946, 14.6125],
  graph_rects: [
    [121.0074, 14.5435, 121.0366, 14.5665],
    [121.0354, 14.5895, 121.0626, 14.6125],
  ],
  neighbourhoods: [
    { id: "makati-cbd", name: "Makati CBD", bbox: [121.012, 14.548, 121.032, 14.562] },
    { id: "greenhills", name: "Greenhills", bbox: [121.04, 14.594, 121.058, 14.608] },
  ],
  center: [121.051, 14.5705],
};
const cubao: AreaInfo = {
  id: "cubao-eastwood",
  name: "Cubao and Eastwood",
  cities: ["Quezon City"],
  bbox: [121.046, 14.602, 121.086, 14.627],
  graph_bbox: [121.0414, 14.5975, 121.0906, 14.6315],
  graph_rects: [[121.0414, 14.6075, 121.0666, 14.6315]],
  neighbourhoods: [{ id: "cubao", name: "Cubao and Araneta City", bbox: [121.046, 14.612, 121.062, 14.627] }],
  center: [121.066, 14.6145],
};
const AREAS = [core, cubao];

describe("area of a point", () => {
  it("finds the area whose graph covers the point, and none outside every area", () => {
    expect(areaAt(AREAS, 121.02, 14.555, null)?.id).toBe("metro-core");
    expect(areaAt(AREAS, 121.06, 14.62, null)?.id).toBe("cubao-eastwood");
    expect(areaAt(AREAS, 120.9, 14.4, null)).toBeNull();
  });

  it("settles an overlap with the current area first, then the area whose core holds the point", () => {
    // In both graphs. The point sits inside metro-core's core box (it ends at 14.608).
    const lon = 121.05;
    const lat = 14.6078;
    expect(areaAt(AREAS, lon, lat, null)?.id).toBe("metro-core");
    expect(areaAt(AREAS, lon, lat, "cubao-eastwood")?.id).toBe("cubao-eastwood");
    // Past metro-core's core box, the other area's core wins.
    expect(areaAt(AREAS, 121.05, 14.611, null)?.id).toBe("cubao-eastwood");
  });
});

describe("area words", () => {
  it("uses the landing card's short names, and the file's name for an unknown area", () => {
    expect(areaLabel("metro-core", AREAS)).toBe("Makati CBD, Rockwell, BGC, Shaw, Ortigas, Pasig and Greenhills");
    expect(areaLabel("new-area", [{ ...cubao, id: "new-area", name: "New Area" }])).toBe("New Area");
  });

  it("lists the areas in the landing card's order", () => {
    expect(areaList([cubao, core])).toBe("Makati CBD, Rockwell, BGC, Shaw, Ortigas, Pasig and Greenhills; Cubao and Eastwood");
  });

  it("names a place's neighbourhood, or its area outside every neighbourhood", () => {
    const p = { name: "Greenhills Mall", category: "mall", lon: 121.05, lat: 14.6, node_id: 1, aliases: [], area: "metro-core" };
    expect(placeWhere(p, AREAS)).toBe("Greenhills");
    expect(placeWhere({ ...p, lon: 121.07, lat: 14.57 }, AREAS)).toBe("Makati CBD, Rockwell, BGC, Shaw, Ortigas, Pasig and Greenhills");
    expect(placeWhere({ ...p, area: undefined }, AREAS)).toBeNull();
  });

  it("gives the advisory the cities of the area, or of every area before one is picked", () => {
    expect(areaCities("cubao-eastwood", AREAS)).toEqual(["Quezon City"]);
    expect(areaCities(null, AREAS)).toEqual(["Makati", "Taguig", "Quezon City"]);
  });
});
