import { describe, expect, it } from "vitest";
import { searchPlaces } from "../index";
import { boundedEditDistance } from "../search";
import type { Place } from "../types";
import { fan, pt } from "./helpers";

const place = (name: string, extra: Partial<Place> = {}): Place => ({
  name,
  category: "mall",
  lon: pt(0, 0)[0],
  lat: pt(0, 0)[1],
  node_id: 0,
  aliases: [],
  ...extra,
});

const searchData = (places: Place[]) => fan([{ y: 0 }], { places }).data;

describe("edit distance", () => {
  it("counts insertions, deletions and substitutions, and stops at the cap", () => {
    expect(boundedEditDistance("glorieta", "glorietta", 2)).toBe(1);
    expect(boundedEditDistance("greenbelt", "grenbelt", 2)).toBe(1);
    expect(boundedEditDistance("abc", "xyz", 1)).toBe(2);
    expect(boundedEditDistance("abcdef", "ab", 1)).toBe(2);
  });
});

describe("fuzzy search tier", () => {
  const data = searchData([
    place("Glorietta 4", { aliases: ["G4"] }),
    place("Greenbelt 1"),
    place("Power Plant Mall"),
    place("Ayala Triangle Gardens", { category: "park" }),
    place("Mile Long", { aliases: ["Milelong Building"] }),
  ]);

  it("finds a name with a missing letter", () => {
    expect(searchPlaces(data, "glorieta")[0].name).toBe("Glorietta 4");
  });

  it("finds a name with a wrong or extra letter", () => {
    expect(searchPlaces(data, "greenbelr")[0].name).toBe("Greenbelt 1");
    expect(searchPlaces(data, "powerr plant")[0].name).toBe("Power Plant Mall");
  });

  it("allows two edits only for words of 8 or more letters", () => {
    expect(searchPlaces(data, "triangel gardens")[0]?.name).toBe("Ayala Triangle Gardens");
    expect(searchPlaces(data, "gardnes")).toEqual([]);
    expect(searchPlaces(data, "powr")[0]?.name).toBe("Power Plant Mall");
    expect(searchPlaces(data, "pwr")).toEqual([]);
  });

  it("does not match words under 4 letters or distant words", () => {
    expect(searchPlaces(data, "gl4")).toEqual([]);
    expect(searchPlaces(data, "zzzzzz")).toEqual([]);
  });

  it("matches alias tokens", () => {
    expect(searchPlaces(data, "milelng")[0].name).toBe("Mile Long");
  });

  it("keeps exact and prefix matches ahead of fuzzy ones", () => {
    const d = searchData([place("Glorietta Mall"), place("Glorieta Cafe"), place("Grand Glorieta Hotel")]);
    // Glorieta Cafe is a prefix match. Glorietta Mall and the hotel match only through the typo tier.
    expect(searchPlaces(d, "glorieta").map((p) => p.name)).toEqual(["Glorieta Cafe", "Grand Glorieta Hotel", "Glorietta Mall"]);
  });

  it("stays fast over 1,200 places", () => {
    const many = Array.from({ length: 1200 }, (_, i) => place(`Tower ${i} Plaza Centre`));
    const d = searchData(many);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) searchPlaces(d, "plazza centr");
    expect((performance.now() - t0) / 20).toBeLessThan(25);
  });
});

describe("detail", () => {
  it("passes detail through search results and leaves it off other places", () => {
    const d = searchData([
      place("Muji", { category: "store", detail: "in Greenbelt 3" }),
      place("Muji", { category: "store", detail: "in Glorietta 3" }),
      place("Greenbelt 3"),
    ]);
    const r = searchPlaces(d, "muji");
    expect(r.map((p) => p.detail).sort()).toEqual(["in Glorietta 3", "in Greenbelt 3"]);
    expect(searchPlaces(d, "greenbelt 3")[0].detail).toBeUndefined();
  });

  it("does not search the detail text", () => {
    const d = searchData([place("Muji", { detail: "in Greenbelt 3" })]);
    expect(searchPlaces(d, "greenbelt")).toEqual([]);
  });
});
