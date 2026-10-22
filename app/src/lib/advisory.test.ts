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

  it("writes the banner line with or without Makati", () => {
    expect(advisoryLine(ISSUED, ["Marikina", "Quezon City"])).toEqual({
      listed: false,
      text: "PAGASA thunderstorm advisory, issued 10:10 PM: Marikina, Quezon City. Makati is not listed.",
    });
    expect(advisoryLine(ISSUED, ["Makati", "Pasig"]).text).toBe("PAGASA thunderstorm advisory, issued 10:10 PM: Makati, Pasig. Makati is listed.");
    expect(advisoryLine(ISSUED, ["Metro Manila"]).listed).toBe(true);
  });

  it("names the cities of the area being planned", () => {
    const core = ["Makati", "Mandaluyong", "Pasig", "Quezon City", "San Juan", "Taguig"];
    expect(advisoryLine(ISSUED, ["Pasig", "Taguig", "Marikina"], core)).toEqual({
      listed: true,
      text: "PAGASA thunderstorm advisory, issued 10:10 PM: Pasig, Taguig, Marikina. Pasig and Taguig are listed.",
    });
    expect(advisoryLine(ISSUED, ["Marikina"], ["Pasay"]).text).toBe("PAGASA thunderstorm advisory, issued 10:10 PM: Marikina. Pasay is not listed.");
    expect(advisoryLine(ISSUED, ["Marikina"], core).text).toBe("PAGASA thunderstorm advisory, issued 10:10 PM: Marikina. No covered city is listed.");
    expect(advisoryLine(ISSUED, ["Metro Manila"], ["Manila"]).text).toBe("PAGASA thunderstorm advisory, issued 10:10 PM: Metro Manila. Metro Manila is listed.");
  });
});
