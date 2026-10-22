import type { Mode } from "../types";

// The trip lives in the URL fragment, so a reload or a shared link restores it. Browsers never send the
// fragment to a server, so no start or end reaches a request log.
// #area=metro-core&start=Ayala%20MRT%20Station&end=Greenbelt&date=2026-10-23&time=1500&mode=shade&step-free=1
// area names the routing area; start and end resolve inside it. A link without area predates the other areas
// and means metro-core, which holds Makati CBD.
// A place travels by name, or as n<node id> when its name is not unique. A map point travels as lon,lat.
// time=now means "leave when the link is opened". Other query params (now, map) pass through untouched.

export interface TripParams {
  area: string | null;
  start: string | null;
  end: string | null;
  date: string | null;
  time: string | null;
  mode: Mode;
  stepFree: boolean;
}

export type EndpointRef =
  | { kind: "name"; name: string; node?: number }
  | { kind: "node"; node: number }
  | { kind: "point"; lon: number; lat: number };

const TRIP_KEYS = new Set(["area", "start", "end", "date", "time", "mode", "step-free"]);
const AREA_ID = /^[a-z0-9-]+$/;
const POINT = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;
const NODE = /^n(\d+)$/;
// "Muji~n3557": a repeated name with the node that tells its copies apart. Several places can share one node,
// so the name travels too.
const NAMED_NODE = /^(.+)~n(\d+)$/;

const round5 = (n: number) => String(Math.round(n * 1e5) / 1e5);
export const MY_LOCATION = "My location";

// A GPS fix never goes into the link: links get shared and kept in history, and the spot is often a home.
// Such an end is left out, and a restored link asks for it again.
export function encodeEndpoint(ep: { label: string; node: number; lon: number; lat: number; snap_m: number | null }, places: { name: string }[]): string | null {
  if (ep.label === MY_LOCATION) return null;
  if (ep.snap_m != null) return `${round5(ep.lon)},${round5(ep.lat)}`;
  const same = places.filter((p) => p.name.toLowerCase() === ep.label.toLowerCase()).length;
  return same === 1 ? ep.label : `${ep.label}~n${ep.node}`;
}

export function decodeEndpoint(token: string | null): EndpointRef | null {
  if (!token) return null;
  const pt = POINT.exec(token);
  if (pt) return { kind: "point", lon: Number(pt[1]), lat: Number(pt[2]) };
  const nn = NAMED_NODE.exec(token);
  if (nn) return { kind: "name", name: nn[1], node: Number(nn[2]) };
  const nd = NODE.exec(token);
  if (nd) return { kind: "node", node: Number(nd[1]) };
  return { kind: "name", name: token };
}

export const minuteToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`;
export const hhmmToMinute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4));

export function parseTrip(search: string): TripParams {
  const q = new URLSearchParams(search);
  const area = q.get("area");
  const date = q.get("date");
  const time = q.get("time");
  return {
    area: area && AREA_ID.test(area) ? area : null,
    start: q.get("start") || null,
    end: q.get("end") || null,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    time: time && (time === "now" || /^\d{4}$/.test(time)) ? time : null,
    mode: q.get("mode") === "rain" ? "rain" : "shade",
    stepFree: q.get("step-free") === "1",
  };
}

// The query for `trip`, keeping every other param as it was. A null trip removes the trip params.
export function buildSearch(search: string, trip: TripParams | null): string {
  const keep = search
    .replace(/^\?/, "")
    .split("&")
    .filter((p) => p && !TRIP_KEYS.has(decodeURIComponent(p.split("=")[0])));
  if (trip) {
    const add = (k: string, v: string | null) => {
      if (v) keep.push(`${k}=${encodeURIComponent(v).replace(/%2C/g, ",")}`);
    };
    add("area", trip.area);
    add("start", trip.start);
    add("end", trip.end);
    add("date", trip.date);
    add("time", trip.time);
    add("mode", trip.mode);
    if (trip.stepFree) add("step-free", "1");
  }
  return keep.length ? `?${keep.join("&")}` : "";
}

export const tripFromHash = (hash: string): TripParams => parseTrip(hash.replace(/^#/, "?"));
export const hashFor = (trip: TripParams | null): string => buildSearch("", trip).replace(/^\?/, "#");
