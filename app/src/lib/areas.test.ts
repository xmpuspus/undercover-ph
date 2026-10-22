import { describe, expect, it } from "vitest";
import type { AreaInfo, Place } from "../types";
import { areaAt, areaCities, areaGroups, areaLabel, areaList, placeWhere, regionOf, sharedArea, wellKnown } from "./areas";

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

describe("sharedArea", () => {
  const box = (id: string, rects: [number, number, number, number][]) =>
    ({ id, name: id, cities: [], bbox: rects[0], graph_bbox: rects[0], graph_rects: rects, neighbourhoods: [], center: [0, 0] }) as unknown as AreaInfo;
  const core = box("metro-core", [[121.0354, 14.5285, 121.0666, 14.5675]]);
  const taguig = box("taguig-pateros", [[121.034, 14.496, 121.082, 14.554]]);
  const moa = box("pasay-moa", [[120.9714, 14.5205, 121.0076, 14.5495]]);
  it("routes a seam trip in the area whose graph holds both ends, the end's area first", () => {
    const bgc = { area: "metro-core", lon: 121.052, lat: 14.551 };
    const mckinley = { area: "taguig-pateros", lon: 121.051, lat: 14.534 };
    expect(sharedArea([core, taguig, moa], bgc, mckinley)).toBe("taguig-pateros");
    expect(sharedArea([core, taguig, moa], mckinley, bgc)).toBe("metro-core");
  });
  it("gives null when no graph holds both ends", () => {
    expect(sharedArea([core, taguig, moa], { area: "pasay-moa", lon: 120.982, lat: 14.535 }, { area: "metro-core", lon: 121.052, lat: 14.551 })).toBeNull();
  });
});

describe("regions", () => {
  const cebu: AreaInfo = { ...core, id: "cebu-city-centre", name: "Cebu City", region: { id: "cebu", name: "Metro Cebu" }, cities: ["Cebu City"] };
  const baguio: AreaInfo = { ...core, id: "baguio-centre", name: "Baguio", region: { id: "baguio", name: "Baguio" }, cities: ["Baguio"] };

  it("treats an area with no region as Metro Manila", () => {
    expect(regionOf(core)).toBe("ncr");
    expect(regionOf(cebu)).toBe("cebu");
    expect(regionOf(undefined)).toBe("ncr");
  });

  it("groups areas with Metro Manila first, then the other regions by name", () => {
    const g = areaGroups([cebu, core, baguio, cubao]);
    expect(g.map((x) => x.name)).toEqual(["Metro Manila", "Baguio", "Metro Cebu"]);
    expect(g[0].areas.map((a) => a.id)).toEqual(["metro-core", "cubao-eastwood"]);
  });
});


describe("suggested places for an area with no hand-picked list", () => {
  const at = (name: string, category: string, area = "batangas-city"): Place => ({ name, category, lon: 121, lat: 13.7, node_id: 1, aliases: [], area });
  const places = [
    at("Batangas City Hall", "landmark"),
    at("Batangas City Hall of Justice", "landmark"),
    at("SM City Batangas", "mall"),
    at("Bay City Mall", "mall"),
    at("BOSS", "mall"),
    at("Nuciti Central", "mall"),
    at("Batangas Medical Center", "hospital"),
    at("Grand Terminal", "bus_station"),
    at("Grand Terminal", "bus_station"),
    at("Lipa City Hall", "landmark", "lipa"),
    at("Sitio Office", "office"),
  ];
  it("puts the city hall first, keeps two of a kind, and skips repeated, short and plain names", () => {
    expect(wellKnown(places, "batangas-city").map((p) => p.name)).toEqual([
      "Batangas City Hall",
      "SM City Batangas",
      "Nuciti Central",
      "Batangas Medical Center",
    ]);
  });
  it("only suggests places of the asked area", () => {
    expect(wellKnown(places, "lipa").map((p) => p.name)).toEqual(["Lipa City Hall"]);
  });
});
