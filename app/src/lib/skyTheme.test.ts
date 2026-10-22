import { describe, expect, it } from "vitest";
import { mixColor, mixTheme, phaseOf, skyTheme, type SkyTheme } from "./skyTheme";

const AM = 100;
const PM = 260;
const HEX = /^#[0-9A-F]{6}$/;
const COLORS = ["sky", "horizon", "fog", "building", "accent", "tint", "wash", "tone"] as const;

function channels(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function allColors(t: SkyTheme): string[] {
  return [...COLORS.map((k) => t[k]), t.light.color];
}

describe("skyTheme phases", () => {
  it("switches phase at -6, -2, 6 and 15 degrees", () => {
    expect(phaseOf(-6.01)).toBe("night");
    expect(phaseOf(-6)).toBe("blue");
    expect(phaseOf(-2.01)).toBe("blue");
    expect(phaseOf(-2)).toBe("glow");
    expect(phaseOf(5.99)).toBe("glow");
    expect(phaseOf(6)).toBe("golden");
    expect(phaseOf(14.99)).toBe("golden");
    expect(phaseOf(15)).toBe("day");
    expect(phaseOf(64)).toBe("day");
  });

  it("uses the dark basemap only below -6 degrees", () => {
    expect(skyTheme(-6.01, PM).dark).toBe(true);
    expect(skyTheme(-6, PM).dark).toBe(false);
    expect(skyTheme(0.2, PM).dark).toBe(false);
    expect(skyTheme(40, AM).dark).toBe(false);
  });

  it("aims the light at the real sun by day and grazes it below the horizon", () => {
    const day = skyTheme(34.3, 245.3).light;
    expect(day.anchor).toBe("map");
    expect(day.position[1]).toBeCloseTo(245.3);
    expect(day.position[2]).toBeCloseTo(90 - 34.3);
    expect(skyTheme(-3, PM).light.position[2]).toBe(89);
    expect(skyTheme(-14, PM).light.anchor).toBe("viewport");
  });
});

describe("morning and evening", () => {
  it("colours sunrise and sunset differently at the same altitude", () => {
    for (const alt of [-2, 0, 1, 3, 9]) {
      const am = skyTheme(alt, AM);
      const pm = skyTheme(alt, PM);
      expect(am.morning).toBe(true);
      expect(pm.morning).toBe(false);
      expect(am.phase).toBe(pm.phase);
      expect(am.sky === pm.sky && am.horizon === pm.horizon && am.light.color === pm.light.color).toBe(false);
    }
  });

  it("makes the sunset sky violet and both horizons warm", () => {
    const [r, g, b] = channels(skyTheme(1, PM).sky);
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(g);
    for (const az of [AM, PM]) {
      const [hr, , hb] = channels(skyTheme(1, az).horizon);
      expect(hr).toBeGreaterThan(hb);
    }
  });

  it("is the same in full daylight and at night whatever the side", () => {
    expect(skyTheme(40, AM).sky).toBe(skyTheme(40, PM).sky);
    expect(skyTheme(-10, AM).sky).toBe(skyTheme(-10, PM).sky);
  });
});

describe("interpolation", () => {
  it("keeps every value in range from deep night to noon", () => {
    for (const az of [AM, PM]) {
      for (let alt = -20; alt <= 90; alt += 0.25) {
        const t = skyTheme(alt, az);
        for (const c of allColors(t)) expect(c).toMatch(HEX);
        expect(t.light.intensity).toBeGreaterThanOrEqual(0.2);
        expect(t.light.intensity).toBeLessThanOrEqual(0.38);
        expect(t.washAlpha).toBeGreaterThanOrEqual(0);
        expect(t.washAlpha).toBeLessThanOrEqual(1);
        expect(t.toneAlpha).toBeGreaterThanOrEqual(0);
        expect(t.toneAlpha).toBeLessThanOrEqual(1);
        expect(t.light.position[2]).toBeGreaterThanOrEqual(0);
        expect(t.light.position[2]).toBeLessThanOrEqual(89);
      }
    }
  });

  it("changes smoothly, with no jump between nearby altitudes", () => {
    for (const az of [AM, PM]) {
      for (let alt = -12; alt <= 30; alt += 0.1) {
        const a = skyTheme(alt, az);
        const b = skyTheme(alt + 0.1, az);
        for (const k of COLORS) {
          const d = channels(a[k]).map((v, i) => Math.abs(v - channels(b[k])[i]));
          expect(Math.max(...d)).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("stays between the two key colours it blends", () => {
    const golden = skyTheme(13, PM);
    const day = skyTheme(19, PM);
    const mid = skyTheme(16, PM);
    for (const k of COLORS) {
      const [lo, hi, m] = [channels(golden[k]), channels(day[k]), channels(mid[k])];
      m.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(Math.min(lo[i], hi[i]));
        expect(v).toBeLessThanOrEqual(Math.max(lo[i], hi[i]));
      });
    }
  });

  it("eases one theme into another and ends exactly on the target", () => {
    const a = skyTheme(34.3, 245.3);
    const b = skyTheme(6.9, 256.6);
    expect(mixTheme(a, b, 0).sky).toBe(a.sky);
    expect(mixTheme(a, b, 1)).toBe(b);
    const half = mixTheme(a, b, 0.5);
    expect(half.sky).toBe(mixColor(a.sky, b.sky, 0.5));
    expect(half.light.position[1]).toBeGreaterThan(Math.min(a.light.position[1], b.light.position[1]));
    expect(half.light.position[1]).toBeLessThan(Math.max(a.light.position[1], b.light.position[1]));
  });

  it("turns the short way round when the azimuth crosses north", () => {
    const a = { ...skyTheme(20, AM), light: { anchor: "map" as const, color: "#FFFFFF", intensity: 0.4, position: [1.5, 350, 60] as [number, number, number] } };
    const b = { ...a, light: { ...a.light, position: [1.5, 10, 60] as [number, number, number] } };
    const az = mixTheme(a, b, 0.5).light.position[1];
    expect(az === 0 || az === 360).toBe(true);
  });
});

describe("card tint", () => {
  it("keeps ink and slate-600 text at WCAG AA on every tint", () => {
    for (const az of [AM, PM]) {
      for (let alt = -20; alt <= 90; alt += 1) {
        const tint = skyTheme(alt, az).tint;
        expect(contrast("#0F172A", tint)).toBeGreaterThanOrEqual(4.5);
        expect(contrast("#475569", tint)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
