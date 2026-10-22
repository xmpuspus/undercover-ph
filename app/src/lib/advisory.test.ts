import { describe, expect, it } from "vitest";
import { advisoryCovers, advisoryLine, parseIssued } from "./advisory";

const ISSUED = "10:10 PM, 21 October 2026";

describe("PAGASA advisory window", () => {
  it("parses the issue time as Manila time", () => {
    expect(parseIssued(ISSUED)).toBe(Date.UTC(2026, 9, 21, 14, 10));
    expect(parseIssued("12:05 AM, 1 November 2026")).toBe(Date.UTC(2026, 9, 31, 16, 5));
    expect(parseIssued("12:30 PM, 1 November 2026")).toBe(Date.UTC(2026, 10, 1, 4, 30));
  });

  it("covers departures from the issue time to two hours after", () => {
    expect(advisoryCovers(ISSUED, "2026-10-21", 22 * 60 + 10)).toBe(true);
    expect(advisoryCovers(ISSUED, "2026-10-21", 23 * 60)).toBe(true);
    expect(advisoryCovers(ISSUED, "2026-10-22", 10)).toBe(true);
  });

  it("does not cover departures before the issue time or after the window", () => {
    expect(advisoryCovers(ISSUED, "2026-10-21", 22 * 60)).toBe(false);
    expect(advisoryCovers(ISSUED, "2026-10-22", 11)).toBe(false);
    expect(advisoryCovers(ISSUED, "2026-10-22", 15 * 60)).toBe(false);
  });

  it("covers nothing when the issue time does not parse", () => {
    expect(advisoryCovers(null, "2026-10-21", 22 * 60 + 30)).toBe(false);
    expect(advisoryCovers("issued tonight", "2026-10-21", 22 * 60 + 30)).toBe(false);
  });

  it("names the cities and the end of the 2-hour window", () => {
    expect(advisoryLine(ISSUED, ["Marikina", "Quezon City"])).toEqual({
      listed: false,
      text: "PAGASA expects thunderstorms over Marikina and Quezon City until 12:10 AM.",
    });
    expect(advisoryLine(ISSUED, ["Makati", "Pasig"])).toEqual({ listed: true, text: "PAGASA expects thunderstorms over Makati and Pasig until 12:10 AM." });
    expect(advisoryLine(ISSUED, ["Metro Manila", "Pasig"])).toEqual({ listed: true, text: "PAGASA expects thunderstorms over Metro Manila until 12:10 AM." });
    expect(advisoryLine("2:51 PM, 22 October 2026", ["Taguig"], ["Taguig"])?.text).toBe("PAGASA expects thunderstorms over Taguig until 4:51 PM.");
  });

  it("gives no line when the advisory names no Metro Manila city", () => {
    // 22 October 2026, 2:51 PM: the advisory named only Bataan, Pampanga and Zambales towns.
    expect(advisoryLine("2:51 PM, 22 October 2026", [], ["Makati"])).toBeNull();
  });

  it("puts the planned area's cities first and shortens a long list", () => {
    const core = ["Makati", "Mandaluyong", "Pasig", "Quezon City", "San Juan", "Taguig"];
    expect(advisoryLine(ISSUED, ["Caloocan", "Malabon", "Marikina", "Navotas", "Taguig"], core)).toEqual({
      listed: true,
      text: "PAGASA expects thunderstorms over Taguig, Caloocan, Malabon and 2 more cities until 12:10 AM.",
    });
    expect(advisoryLine(ISSUED, ["Marikina"], core)?.listed).toBe(false);
  });
});
