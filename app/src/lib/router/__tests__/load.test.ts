/// <reference types="node" />
// loadData takes shade.bin.gz when the deploy build wrote one, and shade.bin otherwise.
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { loadData } from "../data";
import type { FetchLike, Manifest, RawGraph } from "../types";
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

  it("takes bytes that a host already inflated", async () => {
    const s = server({ ...base, "shade.bin.gz": { body: SHADE, type: "application/gzip" } });
    const data = await loadData("data", s.fetchImpl);
    expect([...data.shade!.building]).toEqual([40, 255]);
    expect(s.asked).not.toContain("shade.bin");
  });
});
