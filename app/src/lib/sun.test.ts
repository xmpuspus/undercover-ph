import { describe, expect, it } from "vitest";
import { CBD_CENTER } from "../config";
import { compass16, sunPosition } from "./sun";

// Rows copied from manifest.json for 2026-10-22: [minute, altitude, azimuth].
const ROWS: [number, number, number][] = [
  [360, 2.18, 101.8],
  [540, 42.76, 120.5],
  [720, 63.96, 191.0],
  [990, 13.88, 254.4],
  [1050, 0.22, 258.6],
  [1110, -14.63, 262.0],
];

describe("sunPosition", () => {
  it("matches the pipeline's sun table within a tenth of a degree", () => {
    for (const [min, alt, az] of ROWS) {
      const [a, z] = sunPosition("2026-10-22", min, CBD_CENTER[0], CBD_CENTER[1]);
      expect(Math.abs(a - alt)).toBeLessThan(0.1);
      expect(Math.abs(z - az)).toBeLessThan(0.1);
    }
  });

  it("puts the sun well below the horizon at midnight", () => {
    expect(sunPosition("2026-10-22", 0, CBD_CENTER[0], CBD_CENTER[1])[0]).toBeLessThan(-50);
  });

  it("names compass points", () => {
    expect(compass16(0)).toBe("N");
    expect(compass16(247.5)).toBe("WSW");
    expect(compass16(-90)).toBe("W");
  });
});
