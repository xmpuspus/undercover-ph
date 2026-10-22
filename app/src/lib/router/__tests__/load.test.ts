/// <reference types="node" />
// loadData takes shade.bin.gz when the deploy build wrote one, and shade.bin otherwise. A per-date manifest
// loads one date's file and lowconf.bin, and loadShadeDate adds other dates.
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { loadData, loadShadeDate } from "../data";
import { findRoutes } from "../route";
import type { Data, FetchLike, Manifest, Query, RawGraph } from "../types";
import { pt } from "./helpers";

const manifest: Manifest = {
  generated_at: "2026-10-21T12:00:00+08:00",
  pilot_bbox: [121.012, 14.548, 121.032, 14.562],
  graph_bbox: [121.0074, 14.5435, 121.0366, 14.5665],
  timezone: "Asia/Manila",
  dates: ["2026-10-22"],
  buckets_min: [600, 900],
  sun: { "2026-10-22": [[60, 90], [40, 250]] },
  shade: { n_dates: 1, n_buckets: 2, n_edges: 1, layout: "uint8 building[d][b][e], then uint8 tree[d][b][e], then uint8 lowconf[e]" },
};
const graph: RawGraph = {
  nodes: [pt(0, 0), pt(100, 0)],
  edges: [{ id: 7, u: 0, v: 1, len_m: 100, geom: [pt(0, 0), pt(100, 0)], flags: 32, routable: true, side: "centre", way_id: 1, name: null, landmark: null, hours_idx: null, level: null }],
  node_flags: [0, 0],
};
// building per bucket, tree per bucket, lowconf.
const SHADE = new Uint8Array([40, 255, 10, 255, 5]);

type File = { body: Uint8Array | string; type: string };

function server(files: Record<string, File>) {
  const asked: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    const name = url.replace(/^data\//, "");
    asked.push(name);
    // Like the Vite dev server, answer a missing file with index.html when asked to; otherwise 404.
    const f = files[name] ?? files["*"];
    const bytes = f ? (typeof f.body === "string" ? new TextEncoder().encode(f.body) : f.body) : new Uint8Array(0);
    return {
      ok: !!f,
      status: f ? 200 : 404,
      headers: { get: (h: string) => (h.toLowerCase() === "content-type" && f ? f.type : null) },
      json: async () => JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      arrayBuffer: async () => bytes.slice().buffer,
    };
  };
  return { fetchImpl, asked };
}

const json = (v: unknown): File => ({ body: JSON.stringify(v), type: "application/json" });
const base = { "manifest.json": json(manifest), "graph.json": json(graph), "places.json": json([]), "hours.json": json([]) };
const raw: File = { body: SHADE, type: "application/octet-stream" };
const gz: File = { body: new Uint8Array(gzipSync(SHADE)), type: "application/gzip" };

describe("loadData shade file", () => {
  it("inflates shade.bin.gz and skips shade.bin", async () => {
    const s = server({ ...base, "shade.bin.gz": gz, "shade.bin": raw });
    const data = await loadData("data", s.fetchImpl);
    expect(data.loadNotes).toEqual([]);
    expect([...data.shade!.building]).toEqual([40, 255]);
    expect([...data.shade!.tree]).toEqual([10, 255]);
    expect([...data.shade!.lowconf]).toEqual([5]);
    expect(s.asked).toContain("shade.bin.gz");
    expect(s.asked).not.toContain("shade.bin");
  });

  it("falls back to shade.bin when the gzip copy is missing", async () => {
    const s = server({ ...base, "shade.bin": raw });
    const data = await loadData("data", s.fetchImpl);
    expect([...data.shade!.building]).toEqual([40, 255]);
    expect(s.asked).toEqual(expect.arrayContaining(["shade.bin.gz", "shade.bin"]));
  });

  it("falls back to shade.bin when the dev server answers with index.html", async () => {
    const s = server({ ...base, "shade.bin": raw, "*": { body: "<!doctype html>", type: "text/html" } });
    const data = await loadData("data", s.fetchImpl);
    expect([...data.shade!.tree]).toEqual([10, 255]);
  });

  it("falls back to shade.bin when the gzip copy is broken", async () => {
    const broken = new Uint8Array(gzipSync(SHADE)).slice(0, 12);
    const s = server({ ...base, "shade.bin.gz": { body: broken, type: "application/gzip" }, "shade.bin": raw });
    const data = await loadData("data", s.fetchImpl);
    expect(data.loadNotes).toEqual([]);
    expect([...data.shade!.lowconf]).toEqual([5]);
  });

  it("falls back to shade.bin when the gzip copy has no gzip header and the wrong size", async () => {
    const s = server({ ...base, "shade.bin.gz": { body: new Uint8Array([0]), type: "application/gzip" }, "shade.bin": raw });
    const data = await loadData("data", s.fetchImpl);
    expect(data.loadNotes).toEqual([]);
    expect(s.asked).toContain("shade.bin");
    expect([...data.shade!.lowconf]).toEqual([5]);
  });

  it("takes bytes that a host already inflated", async () => {
    const s = server({ ...base, "shade.bin.gz": { body: SHADE, type: "application/gzip" } });
    const data = await loadData("data", s.fetchImpl);
    expect([...data.shade!.building]).toEqual([40, 255]);
    expect(s.asked).not.toContain("shade.bin");
  });
});

// The per-date layout: shade/<date>.bin holds building[b][e] then tree[b][e], and shade/lowconf.bin holds lowconf[e].
const DATES = ["2026-10-22", "2026-10-23"];
const perDate: Manifest = {
  ...manifest,
  dates: DATES,
  sun: { [DATES[0]]: [[60, 90], [40, 250]], [DATES[1]]: [[61, 91], [41, 251]] },
  shade: {
    n_dates: 2,
    n_buckets: 2,
    n_edges: 1,
    layout: "shade/<date>.bin: uint8 building[b][e], then uint8 tree[b][e]; shade/lowconf.bin: uint8 lowconf[e]",
    per_date: true,
    files: DATES.map((d) => `shade/${d}.bin`),
    lowconf: "shade/lowconf.bin",
  },
};
const day = (b: number[], t: number[]): File => ({ body: new Uint8Array([...b, ...t]), type: "application/octet-stream" });
const area = {
  ...base,
  "manifest.json": json(perDate),
  "shade/lowconf.bin": { body: new Uint8Array([7]), type: "application/octet-stream" },
  "shade/2026-10-22.bin": day([40, 255], [10, 255]),
  "shade/2026-10-23.bin": day([30, 20], [5, 6]),
};
const plane = (data: Data, d: number) => {
  const n = data.shade!.nBuckets * data.shade!.nEdges;
  return { building: [...data.shade!.building.slice(d * n, (d + 1) * n)], tree: [...data.shade!.tree.slice(d * n, (d + 1) * n)] };
};
const q = (dateIdx: number): Query => ({ from: 0, to: 1, dateIdx, bucketIdx: 0, mode: "shade", stepFree: false, includeUnchecked: false, departMin: 600 });

describe("loadData per-date shade", () => {
  it("fetches only the chosen date and lowconf.bin", async () => {
    const s = server(area);
    const data = await loadData("data", s.fetchImpl, { dateIdx: 1 });
    expect(data.loadNotes).toEqual([]);
    expect(s.asked).toContain("shade/2026-10-23.bin");
    expect(s.asked).toContain("shade/lowconf.bin");
    expect(s.asked.filter((f) => f.includes("2026-10-22"))).toEqual([]);
    expect(s.asked).not.toContain("shade.bin");
    expect([...data.shade!.loaded]).toEqual([0, 1]);
    expect(plane(data, 1)).toEqual({ building: [30, 20], tree: [5, 6] });
    expect([...data.shade!.lowconf]).toEqual([7]);
    // A date not fetched yet holds no shade value, not 0 (full sun).
    expect(plane(data, 0).building).toEqual([255, 255]);
  });

  it("fetches another date on request, once", async () => {
    const s = server(area);
    const data = await loadData("data", s.fetchImpl, { dateIdx: 1 });
    expect(await loadShadeDate(data, 0)).toBe(true);
    expect(plane(data, 0)).toEqual({ building: [40, 255], tree: [10, 255] });
    expect([...data.shade!.loaded]).toEqual([1, 1]);
    const n = s.asked.length;
    expect(await loadShadeDate(data, 0)).toBe(true);
    expect(s.asked.length).toBe(n);
  });

  it("inflates a date's gzip copy and checks its size", async () => {
    const good = new Uint8Array(gzipSync(new Uint8Array([40, 255, 10, 255])));
    const s = server({ ...area, "shade/2026-10-22.bin.gz": { body: good, type: "application/gzip" } });
    const data = await loadData("data", s.fetchImpl);
    expect(plane(data, 0)).toEqual({ building: [40, 255], tree: [10, 255] });
    expect(s.asked).not.toContain("shade/2026-10-22.bin");
    // A copy of the wrong size falls back to the plain file.
    const bad = new Uint8Array(gzipSync(new Uint8Array([1, 2, 3])));
    const s2 = server({ ...area, "shade/2026-10-23.bin.gz": { body: bad, type: "application/gzip" } });
    const d2 = await loadData("data", s2.fetchImpl, { dateIdx: 1 });
    expect(plane(d2, 1)).toEqual({ building: [30, 20], tree: [5, 6] });
    expect(s2.asked).toContain("shade/2026-10-23.bin");
  });

  it("routes on roofs only, with a note, for a date whose file did not load", async () => {
    const { "shade/2026-10-23.bin": _missing, ...rest } = area;
    const s = server(rest);
    const data = await loadData("data", s.fetchImpl);
    expect(await loadShadeDate(data, 1)).toBe(false);
    expect([...data.shade!.loaded]).toEqual([1, 0]);
    const r = findRoutes(data, q(1));
    expect(r.state).toBe("ok");
    expect(r.notes).toContain("Shade for this date did not load. Only roofs count as cover.");
    expect(r.routes[0].split.building_m).toBe(0);
    // The loaded date still counts building shade.
    const ok = findRoutes(data, q(0));
    expect(ok.notes).not.toContain("Shade for this date did not load. Only roofs count as cover.");
    expect(ok.routes[0].split.building_m).toBe(40);
  });

  it("drops shade with a note when lowconf.bin is missing", async () => {
    const { "shade/lowconf.bin": _missing, ...rest } = area;
    const data = await loadData("data", server(rest).fetchImpl);
    expect(data.shade).toBeNull();
    expect(data.loadNotes[0]).toBe("Shade data did not load. Only roofs count as cover.");
  });
});
