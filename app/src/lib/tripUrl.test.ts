import { describe, expect, it } from "vitest";
import { buildSearch, decodeEndpoint, encodeEndpoint, hhmmToMinute, minuteToHHMM, parseTrip } from "./tripUrl";
import { nowLabel, nowSlot } from "./nowSlot";

const places = [{ name: "Greenbelt" }, { name: "Ayala MRT Station" }, { name: "Twin" }, { name: "twin" }];
const place = (label: string, node: number) => ({ label, node, lon: 121.02, lat: 14.55, snap_m: null });

describe("endpoint tokens", () => {
  it("sends a unique place by name and decodes it back", () => {
    const t = encodeEndpoint(place("Ayala MRT Station", 7), places);
    expect(t).toBe("Ayala MRT Station");
    expect(decodeEndpoint(t)).toEqual({ kind: "name", name: "Ayala MRT Station" });
  });
  it("falls back to the node id when a name repeats", () => {
    const t = encodeEndpoint(place("Twin", 42), places);
    expect(t).toBe("n42");
    expect(decodeEndpoint(t)).toEqual({ kind: "node", node: 42 });
  });
  it("rounds a map point to 5 decimals and decodes it", () => {
    const t = encodeEndpoint({ label: "Point on map", node: 1, lon: 121.0234567, lat: 14.5512345, snap_m: 12 }, places);
    expect(t).toBe("121.02346,14.55123");
    expect(decodeEndpoint(t)).toEqual({ kind: "point", lon: 121.02346, lat: 14.55123 });
  });
  it("returns null for an empty token", () => {
    expect(decodeEndpoint(null)).toBeNull();
  });
});

describe("trip query", () => {
  it("round-trips a trip and keeps the now and map params", () => {
    const trip = { start: "Ayala MRT Station", end: "Greenbelt", date: "2026-10-23", time: "1500", mode: "rain" as const, stepFree: true };
    const search = buildSearch("?now=2026-10-22T09:00&map=eager", trip);
    expect(search).toBe("?now=2026-10-22T09:00&map=eager&start=Ayala%20MRT%20Station&end=Greenbelt&date=2026-10-23&time=1500&mode=rain&step-free=1");
    expect(parseTrip(search)).toEqual(trip);
  });
  it("replaces an old trip and drops it for a null trip", () => {
    expect(buildSearch("?start=A&end=B&now=2026-10-22T09:00", null)).toBe("?now=2026-10-22T09:00");
    expect(buildSearch("?start=A&end=B", null)).toBe("");
  });
  it("keeps commas in map points readable", () => {
    const s = buildSearch("", { start: "121.02346,14.55123", end: null, date: null, time: "now", mode: "shade", stepFree: false });
    expect(s).toBe("?start=121.02346,14.55123&time=now&mode=shade");
  });
  it("ignores bad date and time values", () => {
    const t = parseTrip("?start=A&date=tomorrow&time=3pm&mode=other");
    expect(t).toMatchObject({ start: "A", date: null, time: null, mode: "shade", stepFree: false });
  });
  it("converts minutes and HHMM both ways", () => {
    expect(minuteToHHMM(900)).toBe("1500");
    expect(minuteToHHMM(390)).toBe("0630");
    expect(hhmmToMinute("1500")).toBe(900);
  });
});

describe("Now slot", () => {
  const buckets = [360, 390, 720, 780, 1080, 1110];
  const alt = [2, 9, 64, 58, -7, -14];
  it("uses the next slot ahead and keeps the clock as the departure time", () => {
    const s = nowSlot(buckets, alt, 760, 3);
    expect(s).toEqual({ bucketIdx: 3, min: 780, night: false });
    expect(nowLabel(760, s!, "shade")).toBe("now, 12:40 PM, shade for 1 PM");
  });
  it("uses the last night slot after the day's last slot", () => {
    const s = nowSlot(buckets, alt, 1140, 3);
    expect(s).toEqual({ bucketIdx: 5, min: 1110, night: true });
    expect(nowLabel(1140, s!, "shade")).toBe("now, 7:00 PM, after dark");
  });
  it("uses the first slot, a night one, before dawn", () => {
    expect(nowSlot(buckets, alt, 300, 3)).toMatchObject({ bucketIdx: 0, night: true });
  });
  it("returns null when the last slot is daylight and the clock is past it", () => {
    expect(nowSlot([360, 720], [9, 60], 800, 3)).toBeNull();
  });
});
