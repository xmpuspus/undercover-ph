import { describe, expect, it } from "vitest";
import { advisoryCovers, advisoryLine, parseIssued, placeKey, regionPlaces } from "./advisory";

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

// The same cases as pipeline/regions/test_regions.py, so the live line and the build file agree.
describe("regional PAGASA pages", () => {
  const places = (text: string, cities = ["Cebu City"], provinces = ["Cebu"]) => regionPlaces(text, cities, provinces);

  it("gives one key to every spelling of a city", () => {
    for (const n of ["Cebu City", "CebuCity", "CityOfCebu", "City of Cebu"]) expect(placeKey(n)).toBe("cebu");
  });

  it("counts a listed city and no other town", () => {
    expect(places("Thunderstorm Advisory No. 3 #VISPRSD over #Cebu(Talisay, CebuCity and Mandaue)")).toEqual(["Cebu City"]);
    expect(places("Thunderstorm Advisory No. 3 #VISPRSD over #Cebu(Badian, Sibonga, CityOfCarcar)")).toEqual([]);
  });

  it("counts a province with no list as the whole province", () => {
    expect(places("Thunderstorm Advisory No. 3 #VISPRSD expected over #Cebu within 2 hours")).toEqual(["Cebu"]);
    expect(places("Thunderstorm Advisory No. 3 expected over Cebu within 2 hours")).toEqual(["Cebu"]);
  });

  it("reads a city in plain text as the city, not the province", () => {
    expect(places("Thunderstorm Advisory No. 3 rainshowers over Cebu City and Talisay")).toEqual(["Cebu City"]);
  });

  it("reads the NCR page format with spaces and 'and'", () => {
    const text = "Thunderstorm Advisory No. 1 #NCR_PRSD over Bataan (Dinalupihan and Hermosa), Pampanga (Lubao, and Angeles City)";
    expect(places(text, ["Angeles"], ["Pampanga"])).toEqual(["Angeles"]);
    expect(places(text, ["Guagua"], ["Pampanga"])).toEqual([]);
  });

  it("reads a real Visayas block from 22 October 2026", () => {
    const block = "Thunderstorm Advisory No. 29 #VISPRSD Issued at 08:50 PM 22 October 2026 Moderate to Heavy rainshowers with lightning and strong winds are expected over #Samar(TagapulAn), #Bohol(Dimiao, Valencia, Getafe), #Antique(Anini-y)";
    expect(places(block, ["Tagbilaran"], ["Bohol"])).toEqual([]);
    expect(places(block, ["Valencia"], ["Bohol"])).toEqual(["Valencia"]);
    expect(advisoryCovers("08:50 PM 22 October 2026", "2026-10-22", 21 * 60)).toBe(true);
  });
});

