/// <reference types="node" />
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { progressFetch, progressLabel } from "./loadProgress";

const origin = "https://undercover.test";
const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8")
  .replace('"__BUILD_VERSION__"', '"test"').replace('["__BUILD_SHELL__"]', '["./index.html", "./assets/app-hash.js"]');

function worker() {
  const stores = new Map<string, Map<string, Response>>();
  const normalize = (key: string | { url: string }) => new URL(typeof key === "string" ? key : key.url, origin).href;
  const network = vi.fn(async (request: { url: string } | string) => {
    const url = normalize(request);
    const path = new URL(url).pathname;
    return new Response(`online ${url}`, { headers: { "content-type": path === "/" || path === "/index.html" ? "text/html" : "application/octet-stream" } });
  });
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async match(key: string) { return store.get(normalize(key))?.clone(); },
        async put(key: string, response: Response) { store.set(normalize(key), new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers })); },
        async keys() { return [...store.keys()].map((url) => ({ url })); },
        async delete(key: { url: string }) { return store.delete(normalize(key)); },
        async addAll(keys: string[]) { for (const key of keys) store.set(normalize(key), new Response(`shell ${key}`)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  const listeners = new Map<string, (event: unknown) => void>();
  const claim = vi.fn(), skipWaiting = vi.fn();
  runInNewContext(source, { URL, Map, Promise, caches, fetch: network, self: {
    location: new URL(`${origin}/sw.js`), clients: { claim }, skipWaiting,
    addEventListener(name: string, callback: (event: unknown) => void) { listeners.set(name, callback); },
  } });
  const event = (name: string, values: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    listeners.get(name)!({ ...values, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    return Promise.all(waits);
  };
  const get = async (path: string, mode = "cors", headers = new Headers(), method = "GET") => {
    let answer: Promise<Response> | undefined;
    const done = event("fetch", { request: { url: new URL(path, origin).href, mode, method, headers }, respondWith: (p: Promise<Response>) => { answer = p; } });
    const response = await answer;
    await done;
    return response;
  };
  return { event, get, stores, network, claim, skipWaiting };
}

describe("offline trip service worker", () => {
  it("never replaces the app shell with a JSON or SVG navigation", async () => {
    const w = worker();
    await w.event("install");
    w.network.mockResolvedValueOnce(new Response("app document", { headers: { "content-type": "text/html; charset=utf-8" } }));
    await w.get("/?trip=last", "navigate");
    for (const [path, type] of [["/data/areas.json", "application/json"], ["/icons/icon-512.svg", "image/svg+xml"]]) {
      w.network.mockResolvedValueOnce(new Response("other document", { headers: { "content-type": type } }));
      await w.get(path, "navigate");
    }
    w.network.mockResolvedValueOnce(new Response("misconfigured response", { headers: { "content-type": "application/json" } }));
    await w.get("/index.html", "navigate");
    w.network.mockRejectedValue(new TypeError("offline"));
    expect(await (await w.get("/?trip=last", "navigate"))!.text()).toBe("app document");
    expect(await (await w.get("/data/areas.json", "navigate"))!.text()).toBe("other document");
    expect(await (await w.get("/icons/icon-512.svg", "navigate"))!.text()).toBe("other document");
  });

  it("installs the full shell, claims the current page, and removes old shell caches only", async () => {
    const w = worker();
    w.stores.set("ucph-shell-old", new Map());
    w.stores.set("other-app", new Map());
    await w.event("install");
    await w.event("activate");
    expect(w.skipWaiting).toHaveBeenCalled();
    expect(w.claim).toHaveBeenCalled();
    expect(w.stores.has("ucph-shell-old")).toBe(false);
    expect(w.stores.has("other-app")).toBe(true);
    expect(w.stores.get("ucph-shell-test")?.has(`${origin}/assets/app-hash.js`)).toBe(true);
  });

  it("refreshes documents, JSON, shade and API online, then opens a trip navigation offline", async () => {
    const w = worker();
    await w.event("install");
    const paths = ["/?now=today", "/index.html", "/data/search/top.json", "/data/areas/metro-core/graph.cols.json", "/data/areas/metro-core/shade/day.bin", "/data/areas/metro-core/shade/day.bin.gz", "/api/advisory?prsd=ncrprsd"];
    for (const path of paths) {
      const mode = path.startsWith("/?") ? "navigate" : "cors";
      expect(await (await w.get(path, mode))!.text()).toContain("online");
      w.network.mockImplementationOnce(async () => new Response("fresh", { headers: { "content-type": path.startsWith("/?") || path === "/index.html" ? "text/html" : "application/octet-stream" } }));
      expect(await (await w.get(path, mode))!.text()).toBe("fresh");
    }
    w.network.mockRejectedValue(new TypeError("offline"));
    for (const path of paths) expect(await (await w.get(path, path.startsWith("/?") ? "navigate" : "cors"))!.text()).toBe("fresh");
    expect(await (await w.get("/?now=tomorrow#start=Ayala&end=Greenbelt", "navigate"))!.text()).toBe("fresh");
  });

  it("serves hashed assets from cache and leaves cross-origin, ranges and mutations alone", async () => {
    const w = worker();
    await w.event("install");
    w.network.mockRejectedValue(new TypeError("offline"));
    expect(await (await w.get("/assets/app-hash.js"))!.text()).toContain("shell");
    expect(w.network).not.toHaveBeenCalled();
    expect(await w.get("https://tiles.other.test/style.json")).toBeUndefined();
    expect(await w.get("/data/buildings.pmtiles", "cors", new Headers({ range: "bytes=0-100" }))).toBeUndefined();
    expect(await w.get("/api/advisory", "cors", new Headers(), "POST")).toBeUndefined();
  });

  it("shows HTTP errors online instead of replacing them with cached data", async () => {
    const w = worker();
    await w.get("/data/search/top.json");
    w.network.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    expect((await w.get("/data/search/top.json"))!.status).toBe(503);
    w.network.mockRejectedValueOnce(new TypeError("offline"));
    expect(await (await w.get("/data/search/top.json"))!.text()).toContain("online");
  });

  it("keeps the newest trip when area loads and retention messages overlap", async () => {
    const w = worker();
    await w.get("/data/areas/a/graph.cols.json");
    await w.get("/data/areas/a/shade/day.bin");
    await w.get("/data/areas/b/graph.cols.json");
    await w.get("/data/areas/b/shade/day.bin");
    await Promise.all([w.event("message", { data: { type: "KEEP_AREA", id: "a" } }), w.event("message", { data: { type: "KEEP_AREA", id: "b" } })]);
    const keys = [...w.stores.get("ucph-trip-v1")!.keys()];
    expect(keys.some((k) => k.includes("/a/"))).toBe(false);
    expect(keys.filter((k) => k.includes("/b/"))).toHaveLength(2);
    for (const data of [null, {}, { type: "KEEP_AREA", id: "../../" }, { type: "KEEP_AREA", id: 1 }]) await w.event("message", { data });
    w.network.mockRejectedValue(new TypeError("offline"));
    expect(await (await w.get("/data/areas/b/graph.cols.json"))!.text()).toContain("online");
  });

  it("keeps in-memory bundles when switching back and warms a trip loaded before claim", async () => {
    const w = worker();
    await w.event("message", { data: { type: "KEEP_AREA", id: "a", areas: ["a"], files: ["/data/areas.json", "/data/search/top.json", "/data/areas/a/graph.cols.json", "https://other.test/data/secret", "/api/ignored"] } });
    expect(w.network).toHaveBeenCalledTimes(3);
    await w.get("/data/areas/b/graph.cols.json");
    await w.event("message", { data: { type: "KEEP_AREA", id: "b", areas: ["a", "b"] } });
    await w.event("message", { data: { type: "KEEP_AREA", id: "a", areas: ["a", "b"] } });
    w.network.mockRejectedValue(new TypeError("offline"));
    expect(await (await w.get("/data/areas/a/graph.cols.json"))!.text()).toContain("online");
    expect(await (await w.get("/data/areas/b/graph.cols.json"))!.text()).toContain("online");
    expect(await (await w.get("/data/areas.json"))!.text()).toContain("online");
    expect(await (await w.get("/data/search/top.json"))!.text()).toContain("online");
  });
});

describe("area download progress", () => {
  it("counts chunks, gives bytes without lengths, and propagates malformed JSON", async () => {
    const updates: { loaded: number; total?: number }[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"x":')); c.enqueue(new TextEncoder().encode("1}")); c.close(); } }), { headers: { "content-length": "7" } })));
    try {
      expect(await (await progressFetch((p) => updates.push(p))("/graph")).json()).toEqual({ x: 1 });
      expect(updates.map((p) => p.loaded)).toEqual([0, 5, 7]);
      expect(updates.at(-1)?.total).toBe(7);
      expect(progressLabel({ loaded: 2048 })).toBe("2 KB");
      expect(progressLabel({ loaded: 20, total: 100 })).toBe("20%");
      vi.stubGlobal("fetch", vi.fn(async () => new Response("broken", { headers: { "content-length": "2", "content-encoding": "gzip" } })));
      const p: { loaded: number; total?: number }[] = [];
      await expect((await progressFetch((v) => p.push(v))("/graph")).json()).rejects.toThrow();
      expect(p.at(-1)?.total).toBeUndefined();
      expect(p.at(-1)?.loaded).toBe(6);
    } finally { vi.unstubAllGlobals(); }
  });
});
