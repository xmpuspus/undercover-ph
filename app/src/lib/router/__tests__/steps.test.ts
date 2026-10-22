import { describe, expect, it } from "vitest";
import { findRoutes } from "../index";
import { makeData, query } from "./helpers";

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("landmark steps", () => {
  // East along Ayala Avenue, a 10 m crossing to the south, south on Paseo de Roxas,
  // a 10 m unnamed link, stairs up to a footbridge and down again, then Makati Avenue.
  const nodes: [number, number][] = [
    [0, 0],
    [150, 0],
    [150, -10],
    [150, -160],
    [150, -170],
    [150, -180],
    [150, -260],
    [150, -270],
    [150, -400],
  ];
  const data = makeData({
    nodes,
    edges: [
      { u: 0, v: 1, name: "Ayala Avenue", landmark: "Glorietta 4", building: 60 },
      { u: 1, v: 2, flags: 256 },
      { u: 2, v: 3, name: "Paseo de Roxas" },
      { u: 3, v: 4 },
      { u: 4, v: 5, flags: 16 },
      { u: 5, v: 6, flags: 8, landmark: "Greenbelt 1" },
      { u: 6, v: 7, flags: 16 },
      { u: 7, v: 8, name: "Makati Avenue" },
    ],
  });
  const route = findRoutes(data, query({ from: 0, to: 8 })).routes.find((r) => r.label === "shortest");
  if (!route) throw new Error("no route");
  const steps = route.steps;

  it("folds steps under 25 m into a neighbour", () => {
    expect(steps).toHaveLength(4);
    for (const s of steps) expect(s.distance_m).toBeGreaterThanOrEqual(25);
    expect(steps.map((s) => s.distance_m)).toEqual([150, 170, 100, 130]);
    expect(steps.reduce((a, s) => a + s.distance_m, 0)).toBe(route.length_m);
  });

  it("names the landmark and the street", () => {
    expect(steps[0].text).toBe("Head east on Ayala Avenue past Glorietta 4");
    expect(steps[0].landmark).toBe("Glorietta 4");
    expect(steps[0].cover).toBe("mixed");
    expect(steps[0].textTl).toBe("Maglakad pa-east sa Ayala Avenue, lampas sa Glorietta 4");
  });

  it("keeps the folded crossing in the text and the flags", () => {
    expect(steps[1].flags).toContain("crossing");
    expect(steps[1].text).toBe("Turn right, cross the street, then continue onto Paseo de Roxas");
    expect(steps[1].textTl).toBe("Kumanan, tumawid sa kalsada, tapos diretso sa Paseo de Roxas");
    expect(steps[1].at).toEqual(route.coords[1]);
  });

  it("marks the footbridge stairs", () => {
    expect(steps[2].text).toBe("Cross the footbridge (stairs) past Greenbelt 1");
    expect(steps[2].flags).toEqual(expect.arrayContaining(["stairs", "footbridge"]));
    expect(steps[2].textTl).toBe("Tumawid sa footbridge (may hagdan), lampas sa Greenbelt 1");
    expect(steps[3].text).toBe("Continue onto Makati Avenue");
  });

  it("keeps step text short and gives minutes", () => {
    for (const s of steps) {
      expect(words(s.text)).toBeLessThanOrEqual(12);
      expect(words(s.textTl)).toBeLessThanOrEqual(12);
      expect(s.minutes).toBe(Math.ceil(s.distance_m / 66));
    }
  });

  it("reads a side change as cross, then continue", () => {
    // North sidewalk east, cross south, then south sidewalk east again.
    const d = makeData({
      nodes: [
        [0, 0],
        [200, 0],
        [200, -15],
        [400, -15],
      ],
      edges: [
        { u: 0, v: 1, name: "Ayala Avenue" },
        { u: 1, v: 2, flags: 256, name: "Ayala Avenue" },
        { u: 2, v: 3, name: "Ayala Avenue", landmark: "Glorietta 4", flags: 1 },
      ],
    });
    const r = findRoutes(d, query({ from: 0, to: 3 })).routes[0];
    expect(r.steps.map((s) => s.text)).toEqual([
      "Head east on Ayala Avenue",
      "Cross Ayala Avenue, then take the covered walkway past Glorietta 4",
    ]);
    expect(r.steps[1].textTl).toBe("Tumawid sa Ayala Avenue, tapos dumaan sa may bubong na daanan");
    expect(r.steps[1].cover).toBe("roof");
  });

  it("uses turn words from the bearing change", () => {
    // East 100 m, then a 30 degree bend left, then 100 degrees left, then a sharp right.
    const rad = Math.PI / 180;
    const p1: [number, number] = [100, 0];
    const p2: [number, number] = [p1[0] + 100 * Math.cos(30 * rad), p1[1] + 100 * Math.sin(30 * rad)];
    const p3: [number, number] = [p2[0] + 100 * Math.cos(130 * rad), p2[1] + 100 * Math.sin(130 * rad)];
    const p4: [number, number] = [p3[0] + 100 * Math.cos(-20 * rad), p3[1] + 100 * Math.sin(-20 * rad)];
    const d = makeData({
      nodes: [[0, 0], p1, p2, p3, p4],
      edges: [
        { u: 0, v: 1, name: "A Street" },
        { u: 1, v: 2, name: "B Street" },
        { u: 2, v: 3, name: "C Street" },
        { u: 3, v: 4, name: "D Street" },
      ],
    });
    const r = findRoutes(d, query({ from: 0, to: 4 })).routes[0];
    expect(r.steps.map((s) => s.text)).toEqual([
      "Head east on A Street",
      "Slight left onto B Street",
      "Turn left onto C Street",
      "Sharp right onto D Street",
    ]);
    expect(r.steps.map((s) => s.textTl.split(" ")[0])).toEqual(["Maglakad", "Mag-slight", "Kumaliwa", "Mag-sharp"]);
  });
});
