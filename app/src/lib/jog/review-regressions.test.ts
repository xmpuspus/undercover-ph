/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { makeData, DAY, NIGHT, THURSDAY } from "../router/__tests__/helpers";
import { findRoutes } from "../router/route";
import { loadJog, parseJog } from "./attrs";
import { JogClient } from "./client";
import { JOG_COPY, loopFacts } from "./copy";
import { exportRuns, historyMask, readRuns, validRun } from "./history";
import { loadData } from "../router/data";
import { findLoops, measureLoop } from "./loops";
import { darkAt } from "./score";
import { grid, rawJog } from "./__tests__/fixtures";
import type { JogQuery, RunRecord, StreetPoint } from "./types";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.doUnmock("./attrs"); });
const g = grid(8, 8, 100);
const query: JogQuery = { start: g.at(4, 4), targetM: 1000, dateIdx: THURSDAY, bucketIdx: DAY, departMin: 900, paceMinPerKm: 7 };

it("keeps the numbered run specification available inside this checkout", () => {
  const spec = new URL("./SPEC.md", import.meta.url);
  expect(existsSync(spec)).toBe(true);
  const text = readFileSync(spec, "utf8");
  for (const id of ["J-E11", "J-H6", "J-N2", "J-R6"]) expect(text).toContain(id);
});

it("loads street attributes using the small published digest without downloading the graph twice", async () => {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url);
    if (url.endsWith("/jog.json")) return new Response(JSON.stringify(rawJog(g.data)));
    if (url.endsWith("/graph.sha256")) return new Response(`${"0".repeat(64)}\n`);
    throw new Error("A second full graph download would exceed a phone's loading budget.");
  }));
  expect(await loadJog(g.data, "https://example.test/area/")).not.toBeNull();
  expect(urls).not.toContain("https://example.test/area/graph.json");
});

it("rejects a newer supplement for an older loaded graph with the same edge count", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.endsWith("graph.sha256") ? "0".repeat(64) : JSON.stringify(rawJog(g.data)))));
  expect(await loadJog({ ...g.data, graphHash: "a".repeat(64) }, "https://example.test/area/")).toBeNull();
});

it("can recover street data when the initial digest capture was unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.endsWith("graph.sha256") ? "0".repeat(64) : JSON.stringify(rawJog(g.data)))));
  expect(await loadJog({ ...g.data, graphHash: null }, "https://example.test/area/")).not.toBeNull();
});

it.each(["missing", "stale"])("keeps loops working with the approved note when the published digest is %s", async (state) => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("graph.sha256")) return state === "missing" ? new Response("", { status: 404 }) : new Response("a".repeat(64));
    return new Response(JSON.stringify(rawJog(g.data)));
  }));
  const jog = await loadJog(g.data, "https://example.test/area/");
  expect(jog).toBeNull();
  const result = findLoops(g.data, jog, query);
  expect(result.loops.length).toBeGreaterThan(0);
  expect(result.notes).toContain(JOG_COPY.missing);
});

it("returns the walking map before optional digest metadata arrives", async () => {
  vi.useFakeTimers();
  const manifest = { ...g.data.manifest }; delete manifest.shade;
  const nodes = [[121.02, 14.55], [121.021, 14.55]];
  const graph = { nodes, edges: [{ id: 10, u: 0, v: 1, len_m: 100, flags: 0, routable: true, geom: nodes, name: null, landmark: null, hours_idx: null }] };
  const files: Record<string, string> = { "manifest.json": JSON.stringify(manifest), "graph.json": JSON.stringify(graph), "places.json": "[]", "hours.json": "[]", "graph.sha256": `${"a".repeat(64)}\n` };
  let loaded: Awaited<ReturnType<typeof loadData>> | undefined;
  void loadData("https://example.test/area", async (url) => {
    await new Promise((resolve) => setTimeout(resolve, url.endsWith("graph.sha256") ? 1600 : 400));
    return new Response(files[url.split("/").at(-1)!]);
  }, { captureGraphHash: true }).then((data) => { loaded = data; });
  await vi.advanceTimersByTimeAsync(401);
  expect(loaded?.nodeCount).toBe(2);
  expect(loaded?.graphHash).toBeNull();
  await vi.advanceTimersByTimeAsync(1200);
  expect(loaded?.graphHash).toBe("a".repeat(64));
});

it.each([0, 1600])("captures the initial graph identity when its metadata takes %i ms", async (delay) => {
  vi.useFakeTimers();
  const manifest = { ...g.data.manifest }; delete manifest.shade;
  const nodes = [[121.02, 14.55], [121.021, 14.55]];
  const graph = { nodes, edges: [{ id: 10, u: 0, v: 1, len_m: 100, flags: 0, routable: true, geom: nodes, name: null, landmark: null, hours_idx: null }] };
  const files: Record<string, string> = { "manifest.json": JSON.stringify(manifest), "graph.json": JSON.stringify(graph), "places.json": "[]", "hours.json": "[]", "graph.sha256": `${"a".repeat(64)}\n` };
  const loading = loadData("https://example.test/area", async (url) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, url.endsWith("graph.json") ? 2000 : url.endsWith("graph.sha256") ? delay : 0));
    const body = files[url.split("/").at(-1)!];
    return new Response(body ?? "", { status: body === undefined ? 404 : 200 });
  }, { captureGraphHash: true });
  await vi.advanceTimersByTimeAsync(2001);
  const data = await loading;
  expect(data.graphHash).toBe("a".repeat(64));
});

it("retries missing street data when Other loops changes the seed", async () => {
  vi.resetModules();
  const actual = await vi.importActual<typeof import("./attrs")>("./attrs");
  const attrs = parseJog(rawJog(g.data, { litShare: 0.5 }), g.data.edgeCount);
  const loading = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(attrs);
  vi.doMock("./attrs", () => ({ ...actual, loadJog: loading }));
  const post = vi.fn(); vi.stubGlobal("postMessage", post); vi.stubGlobal("onmessage", null);
  await import("./jogWorker");
  const worker = globalThis as unknown as { onmessage: (event: { data: unknown }) => void };
  worker.onmessage({ data: { type: "init", area: "test", data: g.data, base: "https://example.test/area/" } });
  worker.onmessage({ data: { type: "query", area: "test", id: 1, query: { ...query, seed: 1 } } });
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls[0][0].litShare).toBeNull();
  worker.onmessage({ data: { type: "query", area: "test", id: 2, query: { ...query, seed: 2 } } });
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[1][0].litShare).toBe(0.5);
  expect(loading).toHaveBeenCalledTimes(2);
});

it("does not describe failed light data as zero mapped lights or sparse mapping", () => {
  const loop = measureLoop(g.data, null, { edges: [0], nodes: [0, 1] }, query);
  const text = loopFacts({ ...loop, dark: true, shade_pct: null }, { litShare: null as unknown as number, grade: "thin" });
  expect(text).toContain(JOG_COPY.missing);
  expect(text).not.toContain(JOG_COPY.lightsUnknown);
  expect(text.join(" ")).not.toMatch(/mapped as lit|Few sights/);
});

// SPEC J-N4: a run is dark whenever walking's slot rule says night, and also at any minute before sunrise or from
// sunset on. Walking keeps its slot rule (tmp/latent-bugs records the pre-6 AM walking case).
describe("running darkness covers walking's night rule and adds sunrise and sunset", () => {
  const walk = (data: ReturnType<typeof makeData>, bucketIdx: number, departMin: number) =>
    findRoutes(data, { from: 0, to: 1, dateIdx: THURSDAY, bucketIdx, departMin, mode: "shade", stepFree: false, includeUnchecked: false });
  it("matches walking when sun data and sunrise times are absent", () => {
    const data = makeData({ nodes: [[0, 0], [100, 0]], edges: [{ u: 0, v: 1 }] });
    data.manifest.sun = {}; delete data.manifest.sunrise_sunset;
    expect(darkAt(data, THURSDAY, DAY, 300)).toBe(walk(data, DAY, 300).state === "night");
  });
  it("is dark at 20:00 after a 17:00 sunset even in a daylight slot", () => {
    const data = makeData({ nodes: [[0, 0], [100, 0]], edges: [{ u: 0, v: 1 }] });
    data.manifest.sunrise_sunset = { [data.manifest.dates[THURSDAY]]: ["06:00", "17:00"] };
    expect(walk(data, DAY, 1200).state).not.toBe("night");
    expect(darkAt(data, THURSDAY, DAY, 1200)).toBe(true);
    expect(darkAt(data, THURSDAY, DAY, 12 * 60)).toBe(false);
  });
  it("is dark whenever walking's slot is night", () => {
    const data = makeData({ nodes: [[0, 0], [100, 0]], edges: [{ u: 0, v: 1 }] });
    expect(walk(data, NIGHT, 1110).state).toBe("night");
    expect(darkAt(data, THURSDAY, NIGHT, 1110)).toBe(true);
  });
});

// A cursor double counts actual records requested. Large arrays are shared here so the test itself
// stays small; real IndexedDB would clone each of those records before invoking onsuccess.
function historyDB(records: unknown[], onRead: () => void) {
  const tx = { oncomplete: null as (() => void) | null, onerror: null, onabort: null,
    objectStore: () => ({ count: () => ({ result: records.length }), openCursor: () => request }) };
  let at = 0;
  const request = { result: null as null | { value: unknown; continue: () => void }, onsuccess: null as (() => void) | null };
  const tick = () => queueMicrotask(() => {
    if (at >= records.length) { request.result = null; request.onsuccess?.(); tx.oncomplete?.(); return; }
    onRead(); let continued = false;
    request.result = { value: records[at++], continue: () => { continued = true; tick(); } };
    request.onsuccess?.();
    if (!continued) tx.oncomplete?.();
  });
  const db = { transaction: () => { tick(); return tx; }, close: () => {} };
  const open = { result: db, onsuccess: null as (() => void) | null, onerror: null, onblocked: null, onupgradeneeded: null };
  vi.stubGlobal("indexedDB", { open: () => { queueMicrotask(() => open.onsuccess?.()); return open; } });
}

it("bounds inspected history samples even when every large record is corrupt", async () => {
  const streets: StreetPoint[] = Array.from({ length: 100_000 }, () => [7, 1, 12100000, 1450000]);
  streets[streets.length - 1] = [-1, 1, 0, 0];
  const record: RunRecord = { id: "bad", area: "test", date: "2026-10-24", length_m: 5000, streets };
  let reads = 0;
  historyDB(Array.from({ length: 30 }, () => record), () => reads++);
  const loaded = await readRuns();
  expect(loaded.runs).toEqual([]);
  expect(loaded.skipped).toBe(true);
  expect(loaded.count).toBe(30);
  expect(reads).toBeLessThanOrEqual(10);
});

it("reads and exports browser histories off the main thread", async () => {
  const open = vi.fn(() => { throw new Error("Large records must not be cloned on the page thread."); });
  vi.stubGlobal("indexedDB", { open }); vi.stubGlobal("document", {});
  class HistoryWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    terminate() {}
    postMessage(message: { type: string }) { queueMicrotask(() => this.onmessage?.({ data: message.type === "export" ? new Blob(['{"runs":[]}']) : { runs: [], skipped: true, count: 30 } })); }
  }
  vi.stubGlobal("Worker", HistoryWorker);
  const loaded = await readRuns();
  expect(loaded.count).toBe(30);
  expect(await (await exportRuns()).text()).toBe('{"runs":[]}');
  expect(open).not.toHaveBeenCalled();
});

it.each(["throw", "missing"])("gives a plain history error when its worker is %s", async (failure) => {
  vi.stubGlobal("document", {});
  vi.stubGlobal("Worker", failure === "missing" ? undefined : class { constructor() { throw new Error("Blocked internal historyWorker asset"); } });
  await expect(readRuns()).rejects.toThrow("Saved history could not be opened on this phone.");
});

it("rejects sparse IndexedDB street arrays before scoring", () => {
  const record: RunRecord = { id: "sparse", area: "test", date: "2026-10-24", length_m: 100, streets: new Array<StreetPoint>(3) };
  expect(validRun(record)).toBe(false);
  expect(() => historyMask(g.data, [record])).not.toThrow();
});

it("returns only canonical run fields and four-number samples from stored records", async () => {
  const point = Object.assign([7, 1, 12100000, 1450000] as StreetPoint, { payload: "tuple payload" });
  const streets = Object.assign([point], { payload: "array payload" });
  const raw = { id: "run", area: "test", date: "2026-10-24", length_m: 100, streets, payload: "record payload" };
  historyDB([raw], () => {});
  const { runs } = await readRuns();
  expect(runs).toHaveLength(1);
  expect(Object.keys(runs[0]).sort()).toEqual(["area", "date", "id", "length_m", "streets"]);
  expect(Object.keys(runs[0].streets)).toEqual(["0"]);
  expect(Object.keys(runs[0].streets[0])).toEqual(["0", "1", "2", "3"]);
  expect(runs[0]).not.toBe(raw); expect(runs[0].streets[0]).not.toBe(point);
});

it("does not validate a large record that exceeds the remaining sample allowance", async () => {
  const row = (n: number) => ({ id: "run", area: "test", date: "2026-10-24", length_m: 5000, streets: Array.from({ length: n }, (): StreetPoint => [7, 1, 12100000, 1450000]) });
  const first = row(100_000), last = row(99_999), extra = row(100_000);
  let inspected = 0;
  const sample = extra.streets[0];
  Object.defineProperty(extra.streets, 0, { get: () => { inspected++; return sample; } });
  let reads = 0;
  historyDB([...Array.from({ length: 9 }, () => first), last, extra, extra], () => reads++);
  const loaded = await readRuns();
  expect(loaded.runs).toHaveLength(10);
  expect(loaded.skipped).toBe(true);
  expect(inspected).toBe(0);
  expect(reads).toBeLessThanOrEqual(11);
});

it("gives an isolated-path state for an existing routable node with no circuit", () => {
  const data = makeData({ nodes: [[0, 0], [100, 0]], edges: [{ u: 0, v: 1 }] });
  const r = findLoops(data, parseJog(rawJog(data), data.edgeCount), { ...query, start: 0 });
  expect(r.state).toBe("no_loop");
  expect(r.notes.join(" ")).toContain("isolated path");
  expect(r.searches).toBe(0);
});

class TestWorker {
  static instances: TestWorker[] = [];
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.instances.push(this); }
}
for (const failure of ["onerror", "onmessageerror", "timeout"] as const) it(`bounds history worker ${failure} without a page-thread fallback`, async () => {
  vi.useFakeTimers(); vi.stubGlobal("document", {}); vi.stubGlobal("Worker", TestWorker);
  const open = vi.fn(); vi.stubGlobal("indexedDB", { open });
  const rejected = expect(readRuns()).rejects.toThrow(/Saved history/);
  const worker = TestWorker.instances.at(-1)!;
  if (failure === "timeout") await vi.advanceTimersByTimeAsync(10_001); else worker[failure]?.();
  await rejected;
  expect(open).not.toHaveBeenCalled(); expect(worker.terminate).toHaveBeenCalled();
});
for (const failure of ["onerror", "onmessageerror", "timeout"] as const) it(`rejects worker ${failure} and permits a fresh client to retry`, async () => {
  vi.useFakeTimers(); vi.stubGlobal("Worker", TestWorker);
  const client = new JogClient();
  const p = client.query("test", g.data, "https://example.test/area/", query);
  const rejected = expect(p).rejects.toThrow(/Other loops/);
  const worker = TestWorker.instances.at(-1)!;
  if (failure === "timeout") await vi.advanceTimersByTimeAsync(25_001); else worker[failure]?.();
  await rejected;
  expect(worker.terminate).toHaveBeenCalled();
  const retry = new JogClient(), response = retry.query("test", g.data, "https://example.test/area/", query);
  const fresh = TestWorker.instances.at(-1)!;
  fresh.onmessage?.({ data: { id: 1, result: { state: "no_loop", loops: [] }, grade: "thin", litShare: null } });
  expect((await response).result.state).toBe("no_loop");
  retry.close(); client.close();
});

it("stops redundant searches once a small network keeps returning the same choices", () => {
  const nodes: [number, number][] = Array.from({ length: 12 }, (_, i) => [160 * Math.cos(i * Math.PI / 6), 160 * Math.sin(i * Math.PI / 6)]);
  const data = makeData({ nodes, edges: nodes.map((_, i) => ({ u: i, v: (i + 1) % nodes.length })), nodeFlags: nodes.map(() => 5) });
  const r = findLoops(data, null, { ...query, start: 0, targetM: 1000 });
  expect(r.loops).toHaveLength(1);
  expect(r.searches).toBeLessThan(150);
});
