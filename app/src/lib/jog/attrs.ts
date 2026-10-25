import type { Data } from "../router/types";
import type { JogAttrs, Sight, SightGrade } from "./types";

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 1000;

/** Reject the whole supplement when a column cannot be aligned safely with the graph. */
export function parseJog(raw: unknown, edgeCount: number, graphHash?: string): JogAttrs | null {
  if (!object(raw) || raw.version !== 1 || !Number.isInteger(edgeCount) || edgeCount < 0 || edgeCount > 2_000_000) return null;
  if (typeof raw.graph_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.graph_sha256) || (graphHash && raw.graph_sha256 !== graphHash)) return null;
  if (!object(raw.edges) || !object(raw.counts) || !Array.isArray(raw.sights) || raw.sights.length > 100_000) return null;
  if (raw.counts.edges !== edgeCount || raw.counts.sights !== raw.sights.length) return null;
  const share = raw.counts.lit_share;
  if (typeof share !== "number" || !Number.isFinite(share) || share < 0 || share > 1) return null;
  const sights: Sight[] = [];
  for (const s of raw.sights) {
    if (!object(s) || !text(s.name) || !text(s.kind) || !text(s.src) || typeof s.lon !== "number" || typeof s.lat !== "number" ||
      !Number.isFinite(s.lon) || !Number.isFinite(s.lat) || Math.abs(s.lon) > 180 || Math.abs(s.lat) > 90) return null;
    // Keep the row even when no name remains, since edges refer to sights by index.
    const name = s.name.split(";").map((value) => value.trim()).find(Boolean) ?? "";
    sights.push({ name, kind: s.kind, src: s.src, lon: s.lon, lat: s.lat });
  }
  for (const [key, lo, hi] of [["road", 0, 6], ["lit", 0, 2], ["surface", 0, 2], ["park", 0, 1], ["water", 0, 1], ["sight", -1, sights.length - 1]] as const) {
    const col = raw.edges[key];
    if (!Array.isArray(col) || col.length !== edgeCount || !col.every((v) => Number.isInteger(v) && v >= lo && v <= hi)) return null;
  }
  const hours = raw.edges.hours;
  if (hours !== undefined) {
    if (!Array.isArray(hours) || hours.length !== edgeCount) return null;
    for (const v of hours) if (!Number.isInteger(v) || v < -1) return null;
  }
  const col = raw.edges as Record<string, number[]>;
  return { graph_sha256: raw.graph_sha256, sights, litShare: share, edges: {
    road: Uint8Array.from(col.road), lit: Uint8Array.from(col.lit), surface: Uint8Array.from(col.surface),
    park: Uint8Array.from(col.park), water: Uint8Array.from(col.water),
    // An unnamed row stays in the table, but edges that point to it get -1 (no sight).
    sight: Int32Array.from(col.sight, (i) => i >= 0 && !sights[i].name ? -1 : i),
    // Preserve large indexes so an absent hours row cannot wrap around to a real one.
    hours: hours === undefined ? new Float64Array(edgeCount).fill(-1) : Float64Array.from(col.hours),
  } };
}

export function sightGrade(jog: JogAttrs, data: Data): SightGrade {
  const [w, s, e, n] = data.manifest.graph_bbox;
  const area = Math.abs((e - w) * data.mPerLon * (n - s) * data.mPerLat) / 1e6;
  const named = jog.sights.reduce((count, sight) => count + (sight.name ? 1 : 0), 0);
  const expected = area > 0 ? named * 0.5 / area : 0;
  return expected >= 3 ? "rich" : expected >= 1 ? "some" : "thin";
}

/** Check the published graph digest without downloading another copy of the routing graph. */
export async function loadJog(data: Data, base: string): Promise<JogAttrs | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const [res, digest] = await Promise.all([fetch(`${base.replace(/\/$/, "")}/jog.json`, { signal: controller.signal, cache: "no-cache" }), fetch(`${base.replace(/\/$/, "")}/graph.sha256`, { signal: controller.signal, cache: "no-cache" })]);
    if (!res.ok || !digest.ok) return null;
    const bytes = await digest.arrayBuffer();
    if (bytes.byteLength > 1024) return null;
    const hash = new TextDecoder().decode(bytes).trim();
    if (!/^[a-f0-9]{64}$/.test(hash)) return null;
    if (data.graphHash != null && data.graphHash !== hash) return null;
    return parseJog(await res.json(), data.edgeCount, hash);
  } catch {
    return null;
  } finally {
    clearTimeout(timer); controller.abort();
  }
}
